import crypto from 'crypto';
import pool from '../db.js';
import { normalizeRow } from '../utils/rows.js';
import {
  connectInstance,
  createInstance,
  extractMessageText as extractEvolutionMessageText,
  extractQrBase64,
  findChats,
  findMessages,
  getConnectionState,
  isConnectedState,
  jidToPhone as evolutionJidToPhone,
  sendText as evolutionSendText,
  setWebhook,
} from './evolutionClient.js';
import {
  jidToPhone as metaJidToPhone,
  parseWebhookMessages,
  phoneToJid,
  sendText as metaSendText,
  validateConnection,
  verifySignature,
  subscribeAppToWaba,
} from './metaWhatsAppClient.js';

const webhookPublicBase = () =>
  process.env.WHATSAPP_WEBHOOK_PUBLIC_URL ||
  process.env.PRODUCTION_APP_URL ||
  process.env.PUBLIC_URL ||
  `http://localhost:${process.env.PORT || 3001}`;

export function jidToPhone(remoteJid) {
  return evolutionJidToPhone(remoteJid) || metaJidToPhone(remoteJid);
}

async function logWebhookEvent(userId, { eventType, payload, processed, error = '' }) {
  try {
    await pool.query(
      `INSERT INTO whatsapp_webhook_logs (user_id, event_type, payload, processed, error)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, eventType || 'webhook', JSON.stringify(payload ?? {}), processed ?? 0, error || '']
    );
  } catch (err) {
    console.warn('Webhook log:', err.message);
  }
}

export async function getWebhookDiagnostics(userId) {
  const settings = await getSettings(userId);
  const [chatRows] = await pool.query('SELECT COUNT(*)::int AS c FROM whatsapp_chats WHERE user_id = ?', [userId]);
  const [msgRows] = await pool.query('SELECT COUNT(*)::int AS c FROM whatsapp_messages WHERE user_id = ?', [userId]);

  let recentWebhooks = [];
  try {
    const [logs] = await pool.query(
      `SELECT id, event_type AS eventType, processed, error, created_at AS createdAt
       FROM whatsapp_webhook_logs WHERE user_id = ? ORDER BY id DESC LIMIT 10`,
      [userId]
    );
    recentWebhooks = logs.map((r) => {
      const row = normalizeRow(r);
      return {
        id: String(row.id),
        eventType: row.eventType,
        processed: Number(row.processed) || 0,
        error: row.error || '',
        createdAt: row.createdAt,
      };
    });
  } catch {
    /* tabela ainda não migrada */
  }

  return {
    configured: Boolean(settings),
    provider: settings?.provider || 'evolution',
    status: settings?.status || 'disconnected',
    phoneNumberId: settings?.instanceName,
    webhookUrl: settings ? webhookUrlFor(userId, settings.webhookSecret) : null,
    chatCount: Number(chatRows[0]?.c) || 0,
    messageCount: Number(msgRows[0]?.c) || 0,
    recentWebhooks,
  };
}

export async function getSettings(userId) {
  const [rows] = await pool.query(
    `SELECT user_id AS userId, provider, base_url AS baseUrl, instance_name AS instanceName,
            api_key AS apiKey, phone, status, webhook_secret AS webhookSecret,
            app_secret AS appSecret
     FROM whatsapp_settings WHERE user_id = ?`,
    [userId]
  );
  return rows[0] ? normalizeRow(rows[0]) : null;
}

export async function saveSettings(userId, payload) {
  const provider = payload.provider === 'meta' ? 'meta' : 'evolution';
  const existing = await getSettings(userId);
  const webhookSecret = existing?.webhookSecret || crypto.randomBytes(24).toString('hex');

  if (provider === 'meta') {
    const phoneNumberId = String(payload.phoneNumberId || payload.instanceName || '').trim();
    const accessToken = String(payload.accessToken || payload.apiKey || existing?.apiKey || '').trim();
    const phone = String(payload.phone || '').trim();
    const appSecret = String(payload.appSecret ?? existing?.appSecret ?? '').trim();

    if (!phoneNumberId || !accessToken) {
      throw new Error('Phone Number ID e Access Token são obrigatórios');
    }

    await pool.query(
      `INSERT INTO whatsapp_settings
         (user_id, provider, base_url, instance_name, api_key, phone, status, webhook_secret, app_secret)
       VALUES (?, 'meta', '', ?, ?, ?, 'disconnected', ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
         provider = 'meta',
         base_url = '',
         instance_name = EXCLUDED.instance_name,
         api_key = EXCLUDED.api_key,
         phone = EXCLUDED.phone,
         app_secret = EXCLUDED.app_secret,
         status = CASE WHEN whatsapp_settings.status = 'connected' THEN whatsapp_settings.status ELSE 'disconnected' END`,
      [userId, phoneNumberId, accessToken, phone, webhookSecret, appSecret]
    );
  } else {
    const baseUrl = String(payload.baseUrl || '').trim();
    const instanceName = String(payload.instanceName || '').trim();
    const apiKey = String(payload.apiKey || existing?.apiKey || '').trim();
    const phone = String(payload.phone || '').trim();

    if (!baseUrl || !instanceName || !apiKey) {
      throw new Error('URL da API, instância e token são obrigatórios');
    }

    await pool.query(
      `INSERT INTO whatsapp_settings
         (user_id, provider, base_url, instance_name, api_key, phone, status, webhook_secret, app_secret)
       VALUES (?, 'evolution', ?, ?, ?, ?, 'disconnected', ?, '')
       ON CONFLICT (user_id) DO UPDATE SET
         provider = 'evolution',
         base_url = EXCLUDED.base_url,
         instance_name = EXCLUDED.instance_name,
         api_key = EXCLUDED.api_key,
         phone = EXCLUDED.phone,
         app_secret = '',
         status = CASE WHEN whatsapp_settings.status = 'connected' THEN whatsapp_settings.status ELSE 'disconnected' END`,
      [userId, baseUrl, instanceName, apiKey, phone, webhookSecret]
    );
  }

  return getSettings(userId);
}

export async function deleteSettings(userId) {
  await pool.query('DELETE FROM whatsapp_messages WHERE user_id = ?', [userId]);
  await pool.query('DELETE FROM whatsapp_chats WHERE user_id = ?', [userId]);
  await pool.query('DELETE FROM whatsapp_settings WHERE user_id = ?', [userId]);
}

export function webhookUrlFor(userId, webhookSecret) {
  return `${webhookPublicBase()}/api/whatsapp/webhook/${userId}/${webhookSecret}`;
}

export async function refreshConnectionStatus(userId) {
  const settings = await getSettings(userId);
  if (!settings) return { configured: false, status: 'disconnected' };

  if (settings.provider === 'meta') {
    try {
      const info = await validateConnection(settings.instanceName, settings.apiKey);
      if (!settings.phone && info.phone) {
        await pool.query('UPDATE whatsapp_settings SET phone = ? WHERE user_id = ?', [info.phone, userId]);
      }
      await pool.query('UPDATE whatsapp_settings SET status = ? WHERE user_id = ?', ['connected', userId]);
      return {
        configured: true,
        status: 'connected',
        provider: 'meta',
        displayName: info.displayName,
        settings: maskSettings(await getSettings(userId)),
      };
    } catch (err) {
      await pool.query('UPDATE whatsapp_settings SET status = ? WHERE user_id = ?', ['disconnected', userId]);
      return {
        configured: true,
        status: 'disconnected',
        provider: 'meta',
        error: err.message,
        settings: maskSettings(settings),
      };
    }
  }

  try {
    const state = await getConnectionState(settings.baseUrl, settings.apiKey, settings.instanceName);
    const connected = isConnectedState(state);
    const status = connected ? 'connected' : state === 'connecting' ? 'connecting' : 'disconnected';
    await pool.query('UPDATE whatsapp_settings SET status = ? WHERE user_id = ?', [status, userId]);
    return { configured: true, status, state, provider: 'evolution', settings: maskSettings(settings) };
  } catch (err) {
    await pool.query('UPDATE whatsapp_settings SET status = ? WHERE user_id = ?', ['disconnected', userId]);
    return {
      configured: true,
      status: 'disconnected',
      provider: 'evolution',
      error: err.message,
      settings: maskSettings(settings),
    };
  }
}

export function maskSettings(settings) {
  if (!settings) return null;
  return {
    provider: settings.provider || 'evolution',
    baseUrl: settings.baseUrl || '',
    instanceName: settings.instanceName,
    phoneNumberId: settings.provider === 'meta' ? settings.instanceName : undefined,
    phone: settings.phone,
    status: settings.status,
    hasApiKey: Boolean(settings.apiKey),
    hasAppSecret: Boolean(settings.appSecret),
    apiKeyPreview: settings.apiKey ? `${settings.apiKey.slice(0, 4)}…${settings.apiKey.slice(-4)}` : '',
    webhookUrl: webhookUrlFor(settings.userId, settings.webhookSecret),
    verifyToken: settings.webhookSecret,
  };
}

export async function startConnection(userId) {
  const settings = await getSettings(userId);
  if (!settings) throw new Error('Configure a integração antes de conectar');

  if (settings.provider === 'meta') {
    const info = await validateConnection(settings.instanceName, settings.apiKey);
    await subscribeAppToWaba(settings.instanceName, settings.apiKey);
    if (!settings.phone && info.phone) {
      await pool.query('UPDATE whatsapp_settings SET phone = ? WHERE user_id = ?', [info.phone, userId]);
    }
    await pool.query('UPDATE whatsapp_settings SET status = ? WHERE user_id = ?', ['connected', userId]);
    return {
      status: 'connected',
      provider: 'meta',
      displayName: info.displayName,
      webhookUrl: webhookUrlFor(userId, settings.webhookSecret),
    };
  }

  const { baseUrl, apiKey, instanceName } = settings;

  try {
    await createInstance(baseUrl, apiKey, instanceName);
  } catch (err) {
    if (err.status !== 409 && err.status !== 403) {
      const msg = String(err.message || '').toLowerCase();
      if (!msg.includes('already') && !msg.includes('exists')) {
        /* instância pode já existir */
      }
    }
  }

  const webhookUrl = webhookUrlFor(userId, settings.webhookSecret);
  try {
    await setWebhook(baseUrl, apiKey, instanceName, webhookUrl);
  } catch (err) {
    console.warn('WhatsApp webhook setup:', err.message);
  }

  const connectData = await connectInstance(baseUrl, apiKey, instanceName);
  const qrcode = extractQrBase64(connectData);
  await pool.query('UPDATE whatsapp_settings SET status = ? WHERE user_id = ?', ['connecting', userId]);

  return {
    status: 'connecting',
    provider: 'evolution',
    qrcode,
    pairingCode: connectData?.pairingCode ?? null,
  };
}

export async function getConnectionView(userId) {
  const refreshed = await refreshConnectionStatus(userId);
  if (!refreshed.configured) {
    return { configured: false, status: 'disconnected' };
  }

  if (refreshed.provider === 'meta') {
    const settings = await getSettings(userId);
    return {
      ...refreshed,
      webhookUrl: settings ? webhookUrlFor(userId, settings.webhookSecret) : null,
    };
  }

  let qrcode = null;
  if (refreshed.status === 'connecting') {
    try {
      const settings = await getSettings(userId);
      const connectData = await connectInstance(settings.baseUrl, settings.apiKey, settings.instanceName);
      qrcode = extractQrBase64(connectData);
    } catch {
      /* ignore */
    }
  }

  if (refreshed.status === 'connected') {
    await syncChatsFromProvider(userId);
  }

  return { ...refreshed, qrcode };
}

export async function upsertChat(userId, { remoteJid, name, lastMessage, lastMessageAt, incrementUnread = false }) {
  const [existing] = await pool.query(
    'SELECT id, unread FROM whatsapp_chats WHERE user_id = ? AND remote_jid = ?',
    [userId, remoteJid]
  );

  if (existing.length === 0) {
    const phone = jidToPhone(remoteJid);
    let contactId = null;
    if (phone) {
      const [contacts] = await pool.query(
        "SELECT id FROM contacts WHERE user_id = ? AND REPLACE(REPLACE(REPLACE(telefone, ' ', ''), '-', ''), '+', '') LIKE ? LIMIT 1",
        [userId, `%${phone.slice(-8)}%`]
      );
      contactId = contacts[0]?.id ?? null;
    }

    const [ins] = await pool.query(
      `INSERT INTO whatsapp_chats (user_id, remote_jid, contact_id, name, last_message, last_message_at, unread)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, remoteJid, contactId, name || phone || remoteJid, lastMessage || '', lastMessageAt, incrementUnread ? 1 : 0]
    );
    return ins.insertId;
  }

  const unread = incrementUnread ? Number(existing[0].unread) + 1 : existing[0].unread;
  await pool.query(
    `UPDATE whatsapp_chats SET name = COALESCE(NULLIF(?, ''), name), last_message = ?, last_message_at = ?, unread = ?
     WHERE id = ?`,
    [name || '', lastMessage || '', lastMessageAt, unread, existing[0].id]
  );
  return existing[0].id;
}

export async function insertMessage(userId, chatId, { waMessageId, body, fromMe, messageAt }) {
  if (waMessageId) {
    const [dup] = await pool.query(
      'SELECT id FROM whatsapp_messages WHERE user_id = ? AND wa_message_id = ? LIMIT 1',
      [userId, waMessageId]
    );
    if (dup.length > 0) return dup[0].id;
  }

  const [ins] = await pool.query(
    `INSERT INTO whatsapp_messages (user_id, chat_id, wa_message_id, body, from_me, message_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, chatId, waMessageId || null, body, fromMe ? true : false, messageAt]
  );
  return ins.insertId;
}

export async function verifyMetaWebhook(userId, webhookSecret, query) {
  const settings = await getSettings(userId);
  if (!settings || settings.webhookSecret !== webhookSecret) {
    throw new Error('Webhook não autorizado');
  }

  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];

  if (mode === 'subscribe' && token === webhookSecret && challenge) {
    return challenge;
  }

  throw new Error('Verificação do webhook falhou');
}

export async function processWebhook(userId, webhookSecret, payload, { rawBody, signature, rawBodyTrusted = false } = {}) {
  const settings = await getSettings(userId);
  if (!settings || settings.webhookSecret !== webhookSecret) {
    throw new Error('Webhook não autorizado');
  }

  const isMetaPayload = payload?.object === 'whatsapp_business_account';
  const useMeta = settings.provider === 'meta' || isMetaPayload;

  if (useMeta) {
    if (settings.appSecret && rawBody && signature) {
      const valid = verifySignature(settings.appSecret, rawBody, signature);
      if (!valid) {
        console.warn('WhatsApp webhook: assinatura inválida — mensagem será processada mesmo assim');
      }
    }

    const items = parseWebhookMessages(payload);
    const fields = (payload?.entry || [])
      .flatMap((e) => (e.changes || []).map((c) => c.field))
      .filter(Boolean);
    await logWebhookEvent(userId, {
      eventType: fields.join(',') || payload?.object || 'unknown',
      payload,
      processed: items.length,
    });
    console.log(`WhatsApp webhook Meta: ${items.length} mensagem(ns) para user ${userId}`);

    for (const item of items) {
      if (!item.text) continue;
      try {
        const remoteJid = phoneToJid(item.from);
        const chatId = await upsertChat(userId, {
          remoteJid,
          name: item.contactName || item.from,
          lastMessage: item.text,
          lastMessageAt: item.messageAt,
          incrementUnread: true,
        });
        await insertMessage(userId, chatId, {
          waMessageId: item.waMessageId,
          body: item.text,
          fromMe: false,
          messageAt: item.messageAt,
        });
      } catch (err) {
        console.error('WhatsApp webhook insert:', err.message);
        await logWebhookEvent(userId, {
          eventType: 'error',
          payload: { waMessageId: item.waMessageId, from: item.from },
          processed: 0,
          error: err.message,
        });
      }
    }

    if (items.length > 0 || isMetaPayload) {
      await pool.query('UPDATE whatsapp_settings SET status = ? WHERE user_id = ?', ['connected', userId]);
    }
    return { ok: true, processed: items.length };
  }

  const event = String(payload?.event || payload?.type || '').toLowerCase();

  if (event.includes('connection')) {
    const state = payload?.data?.state || payload?.data?.status || payload?.state;
    if (isConnectedState(state)) {
      await pool.query('UPDATE whatsapp_settings SET status = ? WHERE user_id = ?', ['connected', userId]);
      await syncChatsFromProvider(userId);
    }
    return { ok: true };
  }

  if (!event.includes('messages')) return { ok: true };

  const items = [];
  if (Array.isArray(payload?.data)) items.push(...payload.data);
  else if (payload?.data) items.push(payload.data);
  else if (payload?.message) items.push(payload);

  for (const item of items) {
    const key = item?.key || item?.data?.key;
    const message = item?.message || item?.data?.message;
    if (!key?.remoteJid) continue;

    const remoteJid = key.remoteJid;
    const fromMe = Boolean(key.fromMe);
    const text = extractEvolutionMessageText(message);
    if (!text) continue;

    const messageAt = item?.messageTimestamp
      ? new Date(Number(item.messageTimestamp) * 1000)
      : new Date();

    const chatId = await upsertChat(userId, {
      remoteJid,
      name: item?.pushName || '',
      lastMessage: text,
      lastMessageAt: messageAt,
      incrementUnread: !fromMe,
    });

    await insertMessage(userId, chatId, {
      waMessageId: key.id,
      body: text,
      fromMe,
      messageAt,
    });
  }

  return { ok: true };
}

export async function syncChatsFromProvider(userId) {
  const settings = await getSettings(userId);
  if (!settings) return [];

  if (settings.provider === 'meta') {
    return listChats(userId);
  }

  const chats = await findChats(settings.baseUrl, settings.apiKey, settings.instanceName);
  for (const chat of chats) {
    const remoteJid = chat.id || chat.remoteJid || chat.jid;
    if (!remoteJid || remoteJid.includes('@g.us')) continue;

    const lastMsg =
      chat.lastMessage?.message?.conversation ||
      chat.lastMessage?.message?.extendedTextMessage?.text ||
      chat.lastMessage ||
      '';

    const ts = chat.updatedAt || chat.lastMessage?.messageTimestamp;
    const lastMessageAt = ts ? new Date(Number(ts) > 1e12 ? Number(ts) : Number(ts) * 1000) : new Date();

    await upsertChat(userId, {
      remoteJid,
      name: chat.name || chat.pushName || jidToPhone(remoteJid),
      lastMessage: typeof lastMsg === 'string' ? lastMsg : '',
      lastMessageAt,
      incrementUnread: false,
    });
  }

  return listChats(userId);
}

export async function listChats(userId) {
  const [rows] = await pool.query(
    `SELECT c.id, c.remote_jid AS remoteJid, c.contact_id AS contactId, c.name, c.last_message AS lastMessage,
            c.last_message_at AS lastMessageAt, c.unread,
            ct.nome AS contactName
     FROM whatsapp_chats c
     LEFT JOIN contacts ct ON ct.id = c.contact_id
     WHERE c.user_id = ?
     ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC`,
    [userId]
  );

  return rows.map((r) => {
    const row = normalizeRow(r);
    return {
      id: String(row.id),
      remoteJid: row.remoteJid,
      contatoId: row.contactId ? String(row.contactId) : undefined,
      nome: row.contactName || row.name || jidToPhone(row.remoteJid),
      phone: jidToPhone(row.remoteJid),
      lastMessage: row.lastMessage || '',
      when: formatWhen(row.lastMessageAt),
      unread: Number(row.unread) || 0,
    };
  });
}

export async function listMessages(userId, chatId) {
  const [rows] = await pool.query(
    `SELECT id, body AS text, from_me AS fromMe, message_at AS messageAt
     FROM whatsapp_messages WHERE user_id = ? AND chat_id = ? ORDER BY message_at ASC, id ASC`,
    [userId, chatId]
  );

  return rows.map((r) => {
    const row = normalizeRow(r);
    return {
      id: String(row.id),
      text: row.text,
      fromMe: Boolean(row.fromMe),
      at: formatTime(row.messageAt),
    };
  });
}

export async function loadMessagesFromProvider(userId, chatId) {
  const settings = await getSettings(userId);
  if (!settings) throw new Error('WhatsApp não configurado');

  if (settings.provider === 'meta') {
    return listMessages(userId, chatId);
  }

  const [chatRows] = await pool.query(
    'SELECT remote_jid AS remoteJid FROM whatsapp_chats WHERE id = ? AND user_id = ?',
    [chatId, userId]
  );
  const chat = chatRows[0] ? normalizeRow(chatRows[0]) : null;
  if (!chat) throw new Error('Conversa não encontrada');

  const messages = await findMessages(settings.baseUrl, settings.apiKey, settings.instanceName, chat.remoteJid);
  for (const item of messages) {
    const key = item?.key || item;
    const message = item?.message || item;
    const text = extractEvolutionMessageText(message);
    if (!text || !key?.remoteJid) continue;
    const messageAt = item?.messageTimestamp
      ? new Date(Number(item.messageTimestamp) * 1000)
      : new Date();
    await insertMessage(userId, chatId, {
      waMessageId: key.id,
      body: text,
      fromMe: Boolean(key.fromMe),
      messageAt,
    });
  }

  return listMessages(userId, chatId);
}

export async function sendChatMessage(userId, chatId, text) {
  const settings = await getSettings(userId);
  if (!settings) throw new Error('WhatsApp não configurado');
  if (settings.status !== 'connected') throw new Error('WhatsApp não está conectado');

  const [chatRows] = await pool.query(
    'SELECT remote_jid AS remoteJid FROM whatsapp_chats WHERE id = ? AND user_id = ?',
    [chatId, userId]
  );
  const chat = chatRows[0] ? normalizeRow(chatRows[0]) : null;
  if (!chat) throw new Error('Conversa não encontrada');

  const number = jidToPhone(chat.remoteJid);
  let result;
  let waMessageId = null;

  if (settings.provider === 'meta') {
    result = await metaSendText(settings.instanceName, settings.apiKey, number, text);
    waMessageId = result?.messages?.[0]?.id || null;
  } else {
    result = await evolutionSendText(settings.baseUrl, settings.apiKey, settings.instanceName, number, text);
    waMessageId = result?.key?.id || result?.messageId || null;
  }

  const messageAt = new Date();

  await insertMessage(userId, chatId, {
    waMessageId,
    body: text,
    fromMe: true,
    messageAt,
  });

  await upsertChat(userId, {
    remoteJid: chat.remoteJid,
    name: '',
    lastMessage: text,
    lastMessageAt: messageAt,
    incrementUnread: false,
  });

  return listMessages(userId, chatId);
}

function formatWhen(date) {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return formatTime(d);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatTime(date) {
  const d = new Date(date);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
