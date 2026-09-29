import express from 'express';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import { getAutomationSettings, saveAutomationSettings } from '../services/automationService.js';

const router = express.Router();

router.use(verifyToken, requireAdmin);

router.get('/settings', async (req, res) => {
  try {
    const settings = await getAutomationSettings(req.userId);
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erro ao carregar automações' });
  }
});

router.put('/settings', async (req, res) => {
  const { welcomeMessageEnabled, welcomeMessageText } = req.body ?? {};
  try {
    const settings = await saveAutomationSettings(req.userId, { welcomeMessageEnabled, welcomeMessageText });
    res.json(settings);
  } catch (err) {
    res.status(400).json({ message: err.message || 'Erro ao salvar automações' });
  }
});

export default router;
