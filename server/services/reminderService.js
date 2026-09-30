import pool from '../db.js';
import { normalizeRows } from '../utils/rows.js';
import { sendPushToUser } from './pushService.js';
import { sendMail } from '../utils/mailer.js';
import { logger } from '../utils/logger.js';

/** Antecedências aceitas (minutos antes do início); 0 = na hora. */
export const REMIND_OPTIONS = [0, 5, 10, 15, 30, 60, 120, 1440];

const TZ = 'America/Sao_Paulo';
const timeFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const leadText = (minutes) => {
  if (minutes === 0) return 'agora';
  if (minutes < 60) return `em ${minutes} min`;
  if (minutes === 1440) return 'amanhã';
  return `em ${minutes / 60} h`;
};

/**
 * Dispara os lembretes que já venceram. Seguro para rodar em paralelo (cron + telas abertas): cada atividade é
 * "reivindicada" por um UPDATE atômico que marca reminded_at, então só um executor a notifica.
 * Só lembra atividades pendentes, com horário, ainda não terminadas e com antecedência definida.
 */
export async function processDueReminders({ limit = 50, mailer = sendMail } = {}) {
  const [, claimed] = await pool.query(
    `UPDATE activities SET reminded_at = NOW()
     WHERE id IN (
       SELECT id FROM activities
       WHERE status = 'Pendente' AND start_at IS NOT NULL AND all_day IS NOT TRUE
         AND remind_minutes IS NOT NULL AND reminded_at IS NULL
         AND start_at - (remind_minutes * INTERVAL '1 minute') <= NOW()
         AND COALESCE(end_at, start_at + INTERVAL '60 minutes') > NOW()
       ORDER BY start_at ASC
       LIMIT ?
     ) AND reminded_at IS NULL
     RETURNING id, user_id, created_by, assigned_to, contact_id, titulo, tipo, start_at, local, link, remind_minutes`,
    [limit]
  );
  const rows = normalizeRows(claimed || []);
  const summary = { claimed: rows.length, notified: 0, pushed: 0, emailed: 0 };
  if (!rows.length) return summary;

  const contactIds = [...new Set(rows.map((r) => r.contactId ?? r.contact_id).filter(Boolean))];
  const contactNames = new Map();
  if (contactIds.length) {
    const [contacts] = await pool.query(
      `SELECT id, nome FROM contacts WHERE id IN (${contactIds.map(() => '?').join(', ')})`,
      contactIds
    );
    contacts.forEach((c) => contactNames.set(Number(c.id), c.nome));
  }

  for (const raw of rows) {
    try {
      const activity = {
        id: raw.id,
        accountId: raw.user_id ?? raw.userid,
        recipientId: raw.assigned_to ?? raw.assignedTo ?? raw.assignedto ?? raw.created_by ?? raw.createdBy ?? raw.createdby ?? raw.user_id ?? raw.userid,
        titulo: raw.titulo,
        tipo: raw.tipo,
        start: new Date(raw.start_at ?? raw.startAt ?? raw.startat),
        local: raw.local,
        link: raw.link,
        contactId: raw.contact_id ?? raw.contactId ?? raw.contactid,
        remind: Number(raw.remind_minutes ?? raw.remindMinutes ?? raw.remindminutes ?? 0),
      };
      const at = timeFormat.format(activity.start);
      const contact = activity.contactId ? contactNames.get(Number(activity.contactId)) : null;
      const title = `${activity.tipo} ${leadText(activity.remind)} · ${at}`;
      const body = [activity.titulo, contact, activity.local].filter(Boolean).join(' · ');

      await pool.query(
        `INSERT INTO notifications (user_id, account_id, type, title, body, url, ref_id)
         VALUES (?, ?, 'reminder', ?, ?, '/admin/agenda', ?)`,
        [activity.recipientId, activity.accountId, title, body, activity.id]
      );
      summary.notified += 1;

      const push = await sendPushToUser(activity.recipientId, {
        title,
        body,
        url: '/admin/agenda',
        tag: `reminder-${activity.id}`,
      }).catch(() => ({ sent: 0 }));
      summary.pushed += push?.sent || 0;

      const [users] = await pool.query('SELECT email, name, remind_email FROM users WHERE id = ?', [activity.recipientId]);
      const user = users[0];
      if (user?.remind_email && user.email) {
        try {
          await mailer({
            to: user.email,
            subject: `Lembrete: ${activity.titulo} às ${at}`,
            text: `${title}\n${body}${activity.link ? `\nLink: ${activity.link}` : ''}`,
            html: `<div style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:480px">
              <h3 style="color:#ef6a27;margin:0 0 8px">${title}</h3>
              <p style="margin:0 0 12px">${body.replace(/</g, '&lt;')}</p>
              ${activity.link ? `<p><a href="${activity.link}">Entrar na videochamada</a></p>` : ''}
              <p style="font-size:12px;color:#666">Enviado pela Agenda do VESK CRM.</p></div>`,
          });
          summary.emailed += 1;
        } catch (err) {
          logger.warn('reminder_email_failed', { error: err, activityId: activity.id });
        }
      }
    } catch (err) {
      logger.error('reminder_failed', { error: err, activityId: raw.id });
    }
  }
  return summary;
}

let lastRun = 0;
const MIN_INTERVAL_MS = 20_000;

/** Versão "oportunista": quem tiver o CRM aberto mantém os lembretes em dia mesmo sem o agendador externo. */
export async function maybeProcessReminders() {
  const now = Date.now();
  if (now - lastRun < MIN_INTERVAL_MS) return null;
  lastRun = now;
  try {
    return await processDueReminders();
  } catch (err) {
    logger.warn('reminders_unavailable', { error: err });
    return null;
  }
}

/** Só para testes: zera o limite de frequência. */
export function resetReminderThrottle() {
  lastRun = 0;
}

// ---------- feed de notificações do usuário ----------
export async function listFeed(userId, limit = 30) {
  const [rows] = await pool.query(
    `SELECT id, type, title, body, url, ref_id AS refId, created_at AS createdAt, read_at AS readAt
     FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
    [userId, limit]
  );
  const [count] = await pool.query(
    'SELECT COUNT(*)::int AS total FROM notifications WHERE user_id = ? AND read_at IS NULL',
    [userId]
  );
  return {
    items: normalizeRows(rows).map((r) => ({ ...r, id: String(r.id), read: Boolean(r.readAt) })),
    unread: Number(count[0]?.total) || 0,
  };
}

export async function markRead(userId, id) {
  await pool.query('UPDATE notifications SET read_at = NOW() WHERE id = ? AND user_id = ? AND read_at IS NULL', [id, userId]);
}

export async function markAllRead(userId) {
  await pool.query('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL', [userId]);
}

export async function getPrefs(userId) {
  const [rows] = await pool.query('SELECT remind_email FROM users WHERE id = ?', [userId]);
  return { remindEmail: Boolean(rows[0]?.remind_email) };
}

export async function setPrefs(userId, { remindEmail }) {
  await pool.query('UPDATE users SET remind_email = ? WHERE id = ?', [Boolean(remindEmail), userId]);
  return getPrefs(userId);
}
