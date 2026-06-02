import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
  deleteSettings,
  getConnectionView,
  getSettings,
  listChats,
  listMessages,
  loadMessagesFromProvider,
  maskSettings,
  processWebhook,
  refreshConnectionStatus,
  saveSettings,
  sendChatMessage,
  startConnection,
  syncChatsFromProvider,
} from '../services/whatsappService.js';
import pool from '../db.js';

const router = express.Router();

router.post('/webhook/:userId/:secret', async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId)) return res.status(400).json({ message: 'ID inválido' });
    await processWebhook(userId, req.params.secret, req.body);
    res.json({ ok: true });
  } catch (err) {
    console.error('WhatsApp webhook:', err.message);
    res.status(401).json({ message: err.message });
  }
});

router.use(verifyToken);

router.get('/config', async (req, res) => {
  const settings = await getSettings(req.userId);
  res.json({ configured: Boolean(settings), settings: maskSettings(settings) });
});

router.put('/config', async (req, res) => {
  try {
    const { baseUrl, instanceName, apiKey, phone } = req.body ?? {};
    const existing = await getSettings(req.userId);
    const mergedKey = apiKey?.trim() || existing?.apiKey;
    if (!mergedKey) {
      return res.status(400).json({ message: 'Token / API Key é obrigatório' });
    }
    await saveSettings(req.userId, {
      baseUrl,
      instanceName,
      apiKey: mergedKey,
      phone,
    });
    const settings = await getSettings(req.userId);
    res.json({ settings: maskSettings(settings) });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/config', async (req, res) => {
  await deleteSettings(req.userId);
  res.status(204).send();
});

router.get('/status', async (req, res) => {
  try {
    const view = await getConnectionView(req.userId);
    res.json(view);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/connect', async (req, res) => {
  try {
    const result = await startConnection(req.userId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/sync', async (req, res) => {
  try {
    const status = await refreshConnectionStatus(req.userId);
    if (status.status !== 'connected') {
      return res.status(400).json({ message: 'WhatsApp não está conectado' });
    }
    const chats = await syncChatsFromProvider(req.userId);
    res.json({ chats });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/chats', async (req, res) => {
  const status = await refreshConnectionStatus(req.userId);
  if (!status.configured) {
    return res.json({ configured: false, status: 'disconnected', chats: [] });
  }
  const chats = await listChats(req.userId);
  res.json({ configured: true, status: status.status, chats });
});

router.get('/chats/:id/messages', async (req, res) => {
  const chatId = Number(req.params.id);
  if (!Number.isFinite(chatId)) return res.status(400).json({ message: 'ID inválido' });

  await pool.query('UPDATE whatsapp_chats SET unread = 0 WHERE id = ? AND user_id = ?', [chatId, req.userId]);

  let messages = await listMessages(req.userId, chatId);
  if (messages.length === 0) {
    try {
      messages = await loadMessagesFromProvider(req.userId, chatId);
    } catch {
      /* histórico remoto indisponível */
    }
  }

  res.json({ messages });
});

router.post('/chats/:id/messages', async (req, res) => {
  const chatId = Number(req.params.id);
  const { text } = req.body ?? {};
  if (!Number.isFinite(chatId)) return res.status(400).json({ message: 'ID inválido' });
  if (!text?.trim()) return res.status(400).json({ message: 'Mensagem é obrigatória' });

  try {
    const messages = await sendChatMessage(req.userId, chatId, text.trim());
    res.json({ messages });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

export default router;
