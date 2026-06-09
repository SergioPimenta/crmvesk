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
  openChatFromContact,
  startNewAttendance,
  processWebhook,
  refreshConnectionStatus,
  saveSettings,
  sendChatMessage,
  setChatAttendance,
  startConnection,
  syncChatsFromProvider,
  verifyMetaWebhook,
  getWebhookDiagnostics,
  getMessageTemplates,
} from '../services/whatsappService.js';
import pool from '../db.js';

const router = express.Router();

router.get('/webhook/:userId/:secret', async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId)) return res.status(400).send('ID inválido');
    const challenge = await verifyMetaWebhook(userId, req.params.secret, req.query);
    res.status(200).send(String(challenge));
  } catch (err) {
    console.error('WhatsApp webhook verify:', err.message);
    res.status(403).send(err.message);
  }
});

router.post('/webhook/:userId/:secret', async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId)) return res.status(400).json({ message: 'ID inválido' });

    const rawBody = req.rawBody || JSON.stringify(req.body ?? {});
    const signature = req.get('x-hub-signature-256') || req.get('X-Hub-Signature-256') || '';
    const rawBodyTrusted = Boolean(req.rawBodyTrusted);

    const result = await processWebhook(userId, req.params.secret, req.body, {
      rawBody,
      signature,
      rawBodyTrusted,
    });
    res.json(result);
  } catch (err) {
    console.error('WhatsApp webhook:', err.message);
    const unauthorized =
      err.message.includes('não autorizado') || err.message.includes('Assinatura do webhook inválida');
    if (unauthorized) {
      return res.status(401).json({ message: err.message });
    }
    res.json({ ok: false, error: err.message });
  }
});

router.use(verifyToken);

router.get('/diagnostics', async (req, res) => {
  try {
    const data = await getWebhookDiagnostics(req.userId);
    res.json(data);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/config', async (req, res) => {
  const settings = await getSettings(req.userId);
  res.json({ configured: Boolean(settings), settings: maskSettings(settings) });
});

router.put('/config', async (req, res) => {
  try {
    const body = req.body ?? {};
    const existing = await getSettings(req.userId);
    const provider = body.provider === 'meta' ? 'meta' : body.provider === 'evolution' ? 'evolution' : existing?.provider || 'evolution';

    if (provider === 'meta') {
      const mergedToken = body.accessToken?.trim() || body.apiKey?.trim() || existing?.apiKey;
      if (!mergedToken) {
        return res.status(400).json({ message: 'Access Token é obrigatório' });
      }
      await saveSettings(req.userId, {
        provider: 'meta',
        phoneNumberId: body.phoneNumberId || body.instanceName || existing?.instanceName,
        accessToken: mergedToken,
        phone: body.phone,
        appSecret: body.appSecret,
        wabaId: body.wabaId,
        metaAppId: body.metaAppId || body.appId,
      });
    } else {
      const mergedKey = body.apiKey?.trim() || existing?.apiKey;
      if (!mergedKey) {
        return res.status(400).json({ message: 'Token / API Key é obrigatório' });
      }
      await saveSettings(req.userId, {
        provider: 'evolution',
        baseUrl: body.baseUrl,
        instanceName: body.instanceName,
        apiKey: mergedKey,
        phone: body.phone,
      });
    }

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

router.get('/templates', async (req, res) => {
  try {
    const data = await getMessageTemplates(req.userId);
    res.json(data);
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
  res.json({ configured: true, status: status.status, provider: status.provider, chats });
});

router.post('/chats', async (req, res) => {
  const { phone, contactId, name, message } = req.body ?? {};
  try {
    if (message?.trim()) {
      const result = await startNewAttendance(req.userId, { phone, name, message: message.trim() });
      return res.status(201).json(result);
    }
    const chat = await openChatFromContact(req.userId, {
      phone,
      contactId: contactId ? Number(contactId) : undefined,
      name,
    });
    res.status(201).json({ chat, messages: [] });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
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

router.post('/chats/:id/attendance', async (req, res) => {
  const chatId = Number(req.params.id);
  const { status } = req.body ?? {};
  if (!Number.isFinite(chatId)) return res.status(400).json({ message: 'ID inválido' });
  if (status !== 'open' && status !== 'closed') {
    return res.status(400).json({ message: 'Status inválido' });
  }

  try {
    const result = await setChatAttendance(req.userId, chatId, status);
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
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
