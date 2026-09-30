import express from 'express';
import pool from '../db.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { logger } from '../utils/logger.js';

const router = express.Router();
const startedAt = Date.now();

let dbCache = { ok: false, checkedAt: 0, latencyMs: 0 };
const DB_CACHE_MS = 10_000;

async function checkDb() {
  if (Date.now() - dbCache.checkedAt < DB_CACHE_MS) return dbCache;
  const t0 = Date.now();
  try {
    await pool.query('SELECT 1');
    dbCache = { ok: true, checkedAt: Date.now(), latencyMs: Date.now() - t0 };
  } catch (err) {
    logger.error('health_db_failed', { error: err });
    dbCache = { ok: false, checkedAt: Date.now(), latencyMs: Date.now() - t0 };
  }
  return dbCache;
}

// Disponibilidade para monitoramento externo (UptimeRobot, Better Stack etc.): 200 = API e banco respondendo.
router.get('/health', async (req, res) => {
  const db = await checkDb();
  res.status(db.ok ? 200 : 503).json({
    status: db.ok ? 'ok' : 'degraded',
    db: db.ok ? 'ok' : 'down',
    dbLatencyMs: db.latencyMs,
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    version: (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7),
    time: new Date().toISOString(),
  });
});

// Erros de JavaScript do navegador (React, promessas rejeitadas). Público porque falhas também acontecem antes
// do login; por isso tem limite por IP e tamanhos truncados.
router.post(
  '/client-errors',
  rateLimit({ name: 'client-errors', limit: 20, windowSec: 600 }),
  (req, res) => {
    const clip = (value, max) => String(value ?? '').slice(0, max);
    const body = req.body ?? {};
    logger.error('client_error', {
      message: clip(body.message, 500),
      stack: clip(body.stack, 4000),
      url: clip(body.url, 300),
      component: clip(body.component, 100),
      userAgent: clip(req.headers['user-agent'], 200),
    });
    res.status(204).end();
  }
);

export default router;
