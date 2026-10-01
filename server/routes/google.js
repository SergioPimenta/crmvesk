import express from 'express';
import pool from '../db.js';
import { verifyToken } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import {
  buildAuthUrl,
  connectAccount,
  disconnectAccount,
  getAccount,
  GoogleAuthError,
  googleConfig,
  verifyState,
} from '../services/googleAuth.js';
import { pullGoogleChanges } from '../services/googleActivityService.js';

// Conexão do usuário com o Google Agenda. Tudo exige login, exceto /callback (é o Google quem chama; a
// identidade vem do `state` assinado por nós em /connect-url).
const router = express.Router();

const SYNC_COOLDOWN_MS = 60_000;

function frontendBaseUrl() {
  const raw = process.env.FRONTEND_URL || process.env.PRODUCTION_APP_URL || 'http://localhost:5173';
  return raw.split(',')[0].trim().replace(/\/$/, '');
}

const backToAgenda = (res, result) => res.redirect(`${frontendBaseUrl()}/admin/agenda?google=${result}`);

router.get('/callback', async (req, res) => {
  if (req.query.error) return backToAgenda(res, 'denied');
  const userId = verifyState(req.query.state);
  if (!userId || !req.query.code) return backToAgenda(res, 'error');
  try {
    await connectAccount(userId, String(req.query.code));
    return backToAgenda(res, 'connected');
  } catch (err) {
    logger.warn('google connect failed', { userId, err });
    return backToAgenda(res, 'error');
  }
});

router.use(verifyToken);

router.get('/status', async (req, res) => {
  const cfg = googleConfig();
  const account = cfg.configured ? await getAccount(req.authUserId) : null;
  res.json({
    configured: cfg.configured,
    connected: Boolean(account),
    email: account?.email || '',
    importEvents: Boolean(account?.import_events),
    lastSyncedAt: account?.last_synced_at || null,
  });
});

router.get('/connect-url', (req, res) => {
  if (!googleConfig().configured) {
    return res.status(503).json({ message: 'A integração com o Google não está configurada no servidor.' });
  }
  res.json({ url: buildAuthUrl(req.authUserId) });
});

router.post('/disconnect', async (req, res) => {
  await disconnectAccount(req.authUserId);
  res.json({ connected: false });
});

// Ligar/desligar a importação de eventos novos do Google para a Agenda do CRM.
router.put('/settings', async (req, res) => {
  const [result] = await pool.query('UPDATE google_accounts SET import_events = ? WHERE user_id = ?', [
    req.body?.importEvents === true,
    req.authUserId,
  ]);
  if (!result.affectedRows) return res.status(409).json({ message: 'Conecte sua conta Google primeiro.' });
  res.json({ importEvents: req.body?.importEvents === true });
});

// "Sincronizar agora": traz as mudanças do Google (no máximo uma vez por minuto por usuário).
router.post('/sync', async (req, res) => {
  const account = await getAccount(req.authUserId);
  if (!account) return res.status(409).json({ message: 'Conecte sua conta Google primeiro.' });
  const last = account.last_synced_at ? new Date(account.last_synced_at).getTime() : 0;
  if (Date.now() - last < SYNC_COOLDOWN_MS) {
    return res.json({ throttled: true, created: 0, updated: 0, cancelled: 0, skipped: 0 });
  }
  try {
    res.json({ throttled: false, ...(await pullGoogleChanges(req.authUserId)) });
  } catch (err) {
    if (err instanceof GoogleAuthError) return res.status(409).json({ message: err.message });
    logger.warn('google sync failed', { userId: req.authUserId, err });
    res.status(502).json({ message: 'Não foi possível sincronizar com o Google agora.' });
  }
});

export default router;
