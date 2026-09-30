import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
  getVapidPublicKey,
  saveSubscription,
  removeSubscription,
} from '../services/pushService.js';
import {
  getPrefs,
  listFeed,
  markAllRead,
  markRead,
  maybeProcessReminders,
  setPrefs,
} from '../services/reminderService.js';

const router = express.Router();

// Chave pública VAPID — não é segredo, o front precisa dela para se inscrever.
router.get('/vapid-public-key', (_req, res) => {
  res.json({ key: getVapidPublicKey() });
});

router.use(verifyToken);

// Feed de lembretes do usuário. Buscar o feed também dispara os lembretes vencidos (no máximo a cada 20 s), então
// quem está com o CRM aberto é avisado mesmo que o agendador externo não esteja configurado.
router.get('/feed', async (req, res) => {
  await maybeProcessReminders();
  res.json(await listFeed(req.authUserId));
});

router.post('/feed/read-all', async (req, res) => {
  await markAllRead(req.authUserId);
  res.json({ ok: true });
});

router.post('/feed/:id/read', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ message: 'ID inválido' });
  await markRead(req.authUserId, id);
  res.json({ ok: true });
});

router.get('/prefs', async (req, res) => {
  res.json(await getPrefs(req.authUserId));
});

router.put('/prefs', async (req, res) => {
  res.json(await setPrefs(req.authUserId, { remindEmail: req.body?.remindEmail === true }));
});

router.post('/subscribe', async (req, res) => {
  try {
    await saveSubscription(req.authUserId, req.body?.subscription);
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/unsubscribe', async (req, res) => {
  try {
    await removeSubscription(req.authUserId, req.body?.endpoint);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

export default router;
