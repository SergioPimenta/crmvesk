import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
  getVapidPublicKey,
  saveSubscription,
  removeSubscription,
} from '../services/pushService.js';

const router = express.Router();

// Chave pública VAPID — não é segredo, o front precisa dela para se inscrever.
router.get('/vapid-public-key', (_req, res) => {
  res.json({ key: getVapidPublicKey() });
});

router.use(verifyToken);

router.post('/subscribe', async (req, res) => {
  try {
    await saveSubscription(req.userId, req.body?.subscription);
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/unsubscribe', async (req, res) => {
  try {
    await removeSubscription(req.userId, req.body?.endpoint);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

export default router;
