import pool from '../db.js';
import { logger } from '../utils/logger.js';
import { brasiliaMidnight, whenLabel } from '../utils/agendaTime.js';
import { getAccessToken, GoogleAuthError } from './googleAuth.js';
import {
  buildEventBody,
  deleteEvent,
  insertEvent,
  isMeetUrl,
  listChanges,
  meetUrlOf,
  patchEvent,
} from './googleCalendar.js';

// Liga as atividades da Agenda ao Google Agenda. Regra de ouro: a atividade do CRM é a fonte da verdade local —
// uma falha no Google nunca impede salvar/excluir a atividade; vira um aviso (`{ status: 'error', message }`).

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
export const MAX_ATTENDEES = 20;

/** Lê a lista de convidados guardada na atividade (JSON em texto). */
export function parseAttendees(text) {
  try {
    const list = JSON.parse(text || '[]');
    return Array.isArray(list) ? list.filter((e) => typeof e === 'string') : [];
  } catch {
    return [];
  }
}

/** Normaliza e-mails (minúsculos, sem repetição). Lança Error com mensagem para o usuário se algum for inválido. */
export function cleanAttendees(list) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const email = String(raw ?? '').trim().toLowerCase();
    if (!email) continue;
    if (!EMAIL_RE.test(email) || email.length > 254) throw new Error(`E-mail de convidado inválido: ${email}`);
    if (!out.includes(email)) out.push(email);
  }
  if (out.length > MAX_ATTENDEES) throw new Error(`No máximo ${MAX_ATTENDEES} convidados por atividade`);
  return out;
}

const messageOf = (err) =>
  err instanceof GoogleAuthError ? err.message : err?.message ? `Google Agenda: ${err.message}` : 'Falha ao falar com o Google Agenda.';

async function loadRow(workspaceId, activityId) {
  const [rows] = await pool.query('SELECT * FROM activities WHERE id = ? AND user_id = ?', [activityId, workspaceId]);
  return rows[0] || null;
}

/**
 * Cria/atualiza o evento da atividade no Google Agenda do usuário.
 * Atividade já vinculada continua no calendário de quem a criou no Google (`google_owner_id`).
 * @param opts { meet?: boolean, invite?: boolean, attendees?: string[] }
 * @returns { status: 'ok', htmlLink, meetUrl } | { status: 'error', message }
 */
export async function pushActivityToGoogle({ actorId, workspaceId, activityId, meet = false, invite = false, attendees }) {
  try {
    const row = await loadRow(workspaceId, activityId);
    if (!row) return { status: 'error', message: 'Atividade não encontrada' };
    if (!row.start_at) return { status: 'error', message: 'Defina data e hora para enviar ao Google Agenda.' };

    const linked = Boolean(row.google_event_id);
    const ownerId = linked && row.google_owner_id ? Number(row.google_owner_id) : actorId;
    const { accessToken, account } = await getAccessToken(ownerId);
    const calendarId = account.calendar_id || 'primary';

    const guests = attendees ? cleanAttendees(attendees) : parseAttendees(row.attendees);
    const activity = {
      id: row.id,
      titulo: row.titulo,
      descricao: row.descricao,
      local: row.local,
      link: row.link,
      startAt: row.start_at,
      endAt: row.end_at,
      allDay: Boolean(row.all_day),
      status: row.status,
      remindMinutes: row.remind_minutes,
    };
    // Só pede um Meet novo se a atividade ainda não tem um.
    const wantsMeet = meet && !isMeetUrl(row.link);
    const body = buildEventBody(activity, { attendees: guests, meet: wantsMeet });
    const sendInvites = invite && guests.length > 0;

    const event = linked
      ? await patchEvent(accessToken, calendarId, row.google_event_id, body, { invite: sendInvites })
      : await insertEvent(accessToken, calendarId, body, { invite: sendInvites });

    const meetUrl = meetUrlOf(event);
    await pool.query(
      `UPDATE activities SET google_event_id = ?, google_etag = ?, google_owner_id = ?, google_html_link = ?,
              attendees = ?, link = ?, updated_at = NOW() WHERE id = ? AND user_id = ?`,
      [
        event.id,
        event.etag || null,
        ownerId,
        String(event.htmlLink || '').slice(0, 512),
        JSON.stringify(guests),
        meetUrl && wantsMeet ? meetUrl.slice(0, 512) : row.link,
        activityId,
        workspaceId,
      ]
    );
    return { status: 'ok', htmlLink: event.htmlLink || '', meetUrl: meetUrl || '' };
  } catch (err) {
    logger.warn('google push failed', { activityId, err });
    return { status: 'error', message: messageOf(err) };
  }
}

/** Remove do Google o evento de uma atividade já apagada (avisa os convidados). Nunca lança. */
export async function removeActivityFromGoogle(row) {
  if (!row?.google_event_id || !row.google_owner_id) return { status: 'skipped' };
  try {
    const { accessToken, account } = await getAccessToken(Number(row.google_owner_id));
    const hasGuests = parseAttendees(row.attendees).length > 0;
    await deleteEvent(accessToken, account.calendar_id || 'primary', row.google_event_id, { invite: hasGuests });
    return { status: 'ok' };
  } catch (err) {
    logger.warn('google delete failed', { err });
    return { status: 'error', message: messageOf(err) };
  }
}

// ─── Google → CRM ────────────────────────────────────────────────────────────

const clip = (v, n) => String(v ?? '').slice(0, n);

/** Início/fim de um evento do Google em objetos Date (+ se é dia inteiro). */
function eventTimes(ev) {
  if (ev.start?.date) {
    const start = brasiliaMidnight(ev.start.date);
    return { start, end: start, allDay: true };
  }
  if (!ev.start?.dateTime) return null;
  const start = new Date(ev.start.dateTime);
  const end = ev.end?.dateTime ? new Date(ev.end.dateTime) : null;
  return { start, end, allDay: false };
}

async function applyEvent({ ev, userId, workspaceId, importEvents }) {
  const [found] = await pool.query(
    'SELECT * FROM activities WHERE google_owner_id = ? AND google_event_id = ? AND user_id = ?',
    [userId, ev.id, workspaceId]
  );
  const row = found[0];
  const cancelled = ev.status === 'cancelled';

  if (!row) {
    if (cancelled || !importEvents) return 'skipped';
    // Evento que nasceu no CRM mas cuja atividade foi apagada: não recria.
    if (ev.extendedProperties?.private?.vesk_activity_id) return 'skipped';
    const t = eventTimes(ev);
    if (!t) return 'skipped';
    const guests = (ev.attendees || []).map((a) => String(a.email || '').toLowerCase()).filter(Boolean);
    await pool.query(
      `INSERT INTO activities (user_id, created_by, assigned_to, titulo, tipo, quando, status, start_at, end_at, all_day,
                               descricao, local, link, google_event_id, google_etag, google_owner_id, google_html_link, attendees)
       VALUES (?, ?, ?, ?, 'Reunião', ?, 'Pendente', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        workspaceId,
        userId,
        userId,
        clip(ev.summary || '(sem título)', 200),
        whenLabel(t.start, t.allDay),
        t.start.toISOString(),
        t.end ? t.end.toISOString() : null,
        t.allDay,
        clip(ev.description, 2000),
        clip(ev.location, 255),
        clip(meetUrlOf(ev), 512),
        ev.id,
        ev.etag || null,
        userId,
        clip(ev.htmlLink, 512),
        JSON.stringify(guests.slice(0, 20)),
      ]
    );
    return 'created';
  }

  // O Google devolve o nosso próprio envio como "mudança": etag igual = eco, ignorar.
  if (ev.etag && ev.etag === row.google_etag) return 'skipped';

  if (cancelled) {
    await pool.query(
      `UPDATE activities SET status = 'Cancelada', completed_at = NULL, google_etag = ?, updated_at = NOW()
       WHERE id = ? AND user_id = ? AND status <> 'Cancelada'`,
      [ev.etag || null, row.id, workspaceId]
    );
    return 'cancelled';
  }

  const t = eventTimes(ev);
  if (!t) return 'skipped';
  const sameStart = row.start_at && new Date(row.start_at).getTime() === t.start.getTime();
  const guests = (ev.attendees || []).map((a) => String(a.email || '').toLowerCase()).filter(Boolean);
  const meetUrl = meetUrlOf(ev);
  // Google venceu (etag mudou): título, horário, local e descrição vêm de lá. Status do CRM é preservado,
  // exceto reabrir uma atividade que estava cancelada e voltou a existir no Google.
  await pool.query(
    `UPDATE activities SET titulo = ?, descricao = ?, local = ?, start_at = ?, end_at = ?, all_day = ?, quando = ?,
            link = ?, attendees = ?, google_etag = ?, google_html_link = ?,
            status = CASE WHEN status = 'Cancelada' THEN 'Pendente' ELSE status END,
            reminded_at = CASE WHEN ? THEN reminded_at ELSE NULL END, updated_at = NOW()
     WHERE id = ? AND user_id = ?`,
    [
      clip(ev.summary || row.titulo, 200),
      clip(ev.description, 2000),
      clip(ev.location, 255),
      t.start.toISOString(),
      t.end ? t.end.toISOString() : null,
      t.allDay,
      whenLabel(t.start, t.allDay),
      meetUrl ? clip(meetUrl, 512) : row.link,
      JSON.stringify(guests.slice(0, 20)),
      ev.etag || null,
      clip(ev.htmlLink, 512),
      Boolean(sameStart),
      row.id,
      workspaceId,
    ]
  );
  return 'updated';
}

/**
 * Traz as mudanças do Google Agenda de um usuário para o CRM (atividades vinculadas; e, se o usuário ligou a
 * importação, também eventos novos). Usa sincronização incremental (`syncToken`).
 */
export async function pullGoogleChanges(userId) {
  const { accessToken, account } = await getAccessToken(userId);
  const [urows] = await pool.query('SELECT account_id FROM users WHERE id = ?', [userId]);
  const workspaceId = Number(urows[0]?.account_id || userId);
  const calendarId = account.calendar_id || 'primary';
  const importEvents = Boolean(account.import_events);

  const timeMin = new Date(Date.now() - 30 * 86_400_000).toISOString();
  let result = await listChanges(accessToken, calendarId, { syncToken: account.sync_token || undefined, timeMin });
  if (result.reset) result = await listChanges(accessToken, calendarId, { timeMin });

  const counts = { created: 0, updated: 0, cancelled: 0, skipped: 0 };
  for (const ev of result.events) {
    if (!ev?.id) continue;
    const outcome = await applyEvent({ ev, userId, workspaceId, importEvents });
    counts[outcome] += 1;
  }
  await pool.query('UPDATE google_accounts SET sync_token = ?, last_synced_at = NOW() WHERE user_id = ?', [
    result.nextSyncToken || null,
    userId,
  ]);
  return counts;
}

/** Cron: sincroniza todas as contas conectadas, uma falha não interrompe as demais. */
export async function pullAllGoogleAccounts(limit = 100) {
  const [rows] = await pool.query('SELECT user_id FROM google_accounts ORDER BY last_synced_at ASC NULLS FIRST LIMIT ?', [limit]);
  const summary = { accounts: rows.length, created: 0, updated: 0, cancelled: 0, failed: 0 };
  for (const r of rows) {
    try {
      const c = await pullGoogleChanges(Number(r.user_id));
      summary.created += c.created;
      summary.updated += c.updated;
      summary.cancelled += c.cancelled;
    } catch (err) {
      summary.failed += 1;
      logger.warn('google pull failed', { userId: r.user_id, err });
    }
  }
  return summary;
}
