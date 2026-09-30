import pool from '../db.js';

// Limitador de requisições persistido no Postgres: na Vercel cada requisição pode cair numa instância
// diferente, então contadores em memória não protegem. Janelas fixas; se o banco falhar, a requisição passa
// (o limitador nunca deve derrubar login ou formulários).

export function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

let lastCleanup = 0;

async function hit(key, windowSec) {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(nowSec / windowSec) * windowSec;
  const [rows] = await pool.query(
    `INSERT INTO rate_limits (key, window_start, hits) VALUES (?, ?, 1)
     ON CONFLICT (key, window_start) DO UPDATE SET hits = rate_limits.hits + 1
     RETURNING hits`,
    [key, windowStart]
  );

  if (nowSec - lastCleanup > 3600) {
    lastCleanup = nowSec;
    void pool.query('DELETE FROM rate_limits WHERE window_start < ?', [nowSec - 86400]).catch(() => {});
  }

  return { hits: Number(rows?.[0]?.hits) || 1, retryAfter: windowStart + windowSec - nowSec };
}

/**
 * @param {{ name: string, limit: number, windowSec: number, key?: (req) => string,
 *           onLimited?: (req, res, retryAfter: number) => void }} options
 */
export function rateLimit({ name, limit, windowSec, key, onLimited }) {
  return async (req, res, next) => {
    try {
      const id = `${name}:${key ? key(req) : clientIp(req)}`.slice(0, 190);
      const { hits, retryAfter } = await hit(id, windowSec);
      if (hits > limit) {
        if (onLimited) return onLimited(req, res, retryAfter);
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({ message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
      }
    } catch (err) {
      console.warn('rateLimit:', err.message);
    }
    return next();
  };
}
