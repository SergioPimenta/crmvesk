import webpush from 'web-push';
import pool from '../db.js';

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@vesk.com';
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || '';
}

export async function saveSubscription(userId, subscription) {
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    throw new Error('Inscrição de push inválida');
  }

  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, endpoint)
     DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [userId, endpoint, p256dh, auth]
  );
  return { ok: true };
}

export async function removeSubscription(userId, endpoint) {
  if (!endpoint) return { ok: true };
  await pool.query('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?', [
    userId,
    endpoint,
  ]);
  return { ok: true };
}

/** Envia uma notificação push para todos os dispositivos inscritos de um usuário. */
export async function sendPushToUser(userId, payload) {
  if (!ensureConfigured()) return { sent: 0, skipped: true };

  const [rows] = await pool.query(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
    [userId]
  );
  if (!rows.length) return { sent: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;

  await Promise.all(
    rows.map(async (row) => {
      const sub = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      try {
        await webpush.sendNotification(sub, body);
        sent += 1;
      } catch (err) {
        // 404/410: inscrição expirada — remove para não acumular lixo
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await pool.query('DELETE FROM push_subscriptions WHERE id = ?', [row.id]);
        } else {
          console.warn('Push falhou:', err?.statusCode || '', err?.message || err);
        }
      }
    })
  );

  return { sent };
}
