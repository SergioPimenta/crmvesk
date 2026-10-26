import express from 'express';
import { recordCollect, resolveCollectKey } from '../services/siteAnalyticsService.js';
import { buildTrackerScript } from '../services/siteTrackerScript.js';
import { getPublicApiBase } from '../services/whatsappButtonService.js';
import { clientIp, rateLimit } from '../middleware/rateLimit.js';
import { logger } from '../utils/logger.js';

// Rotas públicas do monitoramento de sites (script e coleta). CORS aberto definido no app.js.
const router = express.Router();

const collectLimit = rateLimit({
  name: 'site-collect',
  limit: 600,
  windowSec: 600,
  key: (req) => `${clientIp(req)}:${req.params.code}`,
  // Acima do limite responde OK sem gravar: o site nunca vê erro.
  onLimited: (req, res) => res.status(204).end(),
});

router.get('/:code.js', async (req, res) => {
  const code = String(req.params.code || '').replace(/\.js$/, '');
  const site = await resolveCollectKey(code);
  if (!site) {
    return res.status(404).type('text/plain').send('// monitoramento não encontrado ou inativo');
  }
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(buildTrackerScript(getPublicApiBase(), code));
});

router.post('/:code/collect', collectLimit, async (req, res) => {
  let body = req.body ?? {};
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  try {
    await recordCollect(String(req.params.code || ''), body, req.headers);
  } catch (err) {
    logger.warn('site_collect_failed', { error: err });
  }
  // Sempre 204: o script do site não depende da resposta.
  res.status(204).end();
});

export default router;
