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
  parseWebhookStatuses,
  phoneToJid,
  sendText as metaSendText,
  sendTemplate as metaSendTemplate,
  uploadMetaMedia,
  sendMetaMedia,
  downloadMetaMedia,
  validateConnection,
  verifySignature,
  subscribeAppToWaba,
  listMessageTemplates,
  resolveWabaId,
} from './metaWhatsAppClient.js';
import { sendPushToUser } from './pushService.js';
import { computeMessagingWindow } from '../utils/whatsappWindow.js';
import { canonicalWhatsAppPhone, phoneToCanonicalJid, phonesMatch } from '../utils/whatsappPhone.js';
import {
  assertMetaMimeSupported,
  detectMediaKind,
  inlinePreviewDataUrl,
  mediaLabel,
  normalizeMetaMime,
  parseMessageBody,
  safeMediaFilename,
  serializeMediaMessage,
} from '../utils/waMessageBody.js';

const STATUS_RANK = { sent: 1, delivered: 2, read: 3, failed: 0 };

function toIso(date) {
  if (!date) return new Date().toISOString();
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

const webhookPublicBase = () =>
  process.env.WHATSAPP_WEBHOOK_PUBLIC_URL ||
  process.env.PRODUCTION_APP_URL ||
  process.env.PUBLIC_URL ||
  `http://localhost:${process.env.PORT || 3001}`;

export function jidToPhone(remoteJid) {
  return evolutionJidToPhone(remoteJid) || metaJidToPhone(remoteJid);
}

async function loadUserChats(userId) {
  const [rows] = await pool.query(
    `SELECT id, remote_jid AS remoteJid, last_message_at AS lastMessageAt, attendance_status AS attendanceStatus
     FROM whatsapp_chats WHERE user_id = ?`,
    [userId]
  );
  return rows.map((row) => normalizeRow(row));
}

async function mergeDuplicatesIntoChat(userId, keepChatId, phone) {
  const canonical = canonicalWhatsAppPhone(phone);
  const canonicalJid = phoneToCanonicalJid(canonical);
  if (!canonical || !keepChatId) return;

  const all = await loadUserChats(userId);
  for (const row of all) {
    if (Number(row.id) === Number(keepChatId)) continue;
    if (!phonesMatch(canonical, jidToPhone(row.remoteJid))) continue;
    await pool.query('UPDATE whatsapp_messages SET chat_id = ? WHERE chat_id = ? AND user_id = ?', [
      keepChatId,
      row.id,
      userId,
    ]);
    await pool.query('DELETE FROM whatsapp_chats WHERE id = ? AND user_id = ?', [row.id, userId]);
  }

  await pool.query('UPDATE whatsapp_chats SET remote_jid = ? WHERE id = ? AND user_id = ?', [
    canonicalJid,
    keepChatId,
    userId,
  ]);
}

async function resolveChatForPhone(userId, phone) {
  const canonical = canonicalWhatsAppPhone(phone);
  const canonicalJid = phoneToCanonicalJid(canonical);
  if (!canonical) return { chatId: null, remoteJid: '' };

  const all = await loadUserChats(userId);
  const matches = all.filter((row) => phonesMatch(canonical, jidToPhone(row.remoteJid)));
  if (!matches.length) return { chatId: null, remoteJid: canonicalJid };

  const sorted = [...matches].sort((a, b) => {
    const aOpen = a.attendanceStatus === 'open' ? 1 : 0;
    const bOpen = b.attendanceStatus === 'open' ? 1 : 0;
    if (bOpen !== aOpen) return bOpen - aOpen;
    return new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0);
  });

  const keep = sorted[0];
  for (const dup of sorted.slice(1)) {
    await pool.query('UPDATE whatsapp_messages SET chat_id = ? WHERE chat_id = ? AND user_id = ?', [
      keep.id,
      dup.id,
      userId,
    ]);
    await pool.query('DELETE FROM whatsapp_chats WHERE id = ? AND user_id = ?', [dup.id, userId]);
  }

  if (keep.remoteJid !== canonicalJid) {
    await pool.query('UPDATE whatsapp_chats SET remote_jid = ? WHERE id = ? AND user_id = ?', [
      canonicalJid,
      keep.id,
      userId,
    ]);
  }

  return { chatId: keep.id, remoteJid: canonicalJid };
}

async function dedupeUserChats(userId) {
  const all = await loadUserChats(userId);
  const byPhone = new Map();
  for (const row of all) {
    const key = canonicalWhatsAppPhone(jidToPhone(row.remoteJid));
    if (!key) continue;
    if (!byPhone.has(key)) byPhone.set(key, []);
    byPhone.get(key).push(row);
  }
  for (const [canonical, matches] of byPhone) {
    if (matches.length > 1) {
      await resolveChatForPhone(userId, canonical);
    } else if (matches[0].remoteJid !== phoneToCanonicalJid(canonical)) {
      await pool.query('UPDATE whatsapp_chats SET remote_jid = ? WHERE id = ? AND user_id = ?', [
        phoneToCanonicalJid(canonical),
        matches[0].id,
        userId,
      ]);
    }
  }
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
            app_secret AS appSecret, waba_id AS wabaId, meta_app_id AS metaAppId
     FROM whatsapp_settings WHERE user_id = ?`,
    [userId]
  );
  return rows[0] ? normalizeRow(rows[0]) : null;
}

function metaResolveOptions(settings) {
  return {
    cachedWabaId: settings?.wabaId,
    appId: settings?.metaAppId || process.env.META_APP_ID,
    appSecret: settings?.appSecret || process.env.META_APP_SECRET,
  };
}

async function ensureWabaIdPersisted(userId, settings) {
  if (!settings || settings.provider !== 'meta') return settings?.wabaId || '';
  if (settings.wabaId) return settings.wabaId;

  const wabaId = await resolveWabaId(settings.instanceName, settings.apiKey, metaResolveOptions(settings));
  if (wabaId) {
    await pool.query('UPDATE whatsapp_settings SET waba_id = ? WHERE user_id = ?', [wabaId, userId]);
    return wabaId;
  }
  return '';
}

export async function saveSettings(userId, payload) {
  const provider = payload.provider === 'meta' ? 'meta' : 'evolution';
  const existing = await getSettings(userId);
  const webhookSecret = existing?.webhookSecret || crypto.randomBytes(24).toString('hex');

  if (provider === 'meta') {
    const phoneNumberId = String(
      payload.phoneNumberId || payload.instanceName || existing?.instanceName || ''
    ).trim();
    const accessToken = String(payload.accessToken || payload.apiKey || existing?.apiKey || '').trim();
    const phone = String(payload.phone ?? existing?.phone ?? '').trim();
    const appSecret = String(payload.appSecret ?? existing?.appSecret ?? '').trim();
    const wabaId = String(payload.wabaId ?? existing?.wabaId ?? '').trim();
    const metaAppId = String(payload.metaAppId ?? payload.appId ?? existing?.metaAppId ?? '').trim();

    if (!phoneNumberId || !accessToken) {
      throw new Error('Phone Number ID e Access Token são obrigatórios');
    }
    if (!appSecret) {
      throw new Error('App Secret é obrigatório');
    }
    if (!metaAppId) {
      throw new Error('App ID (Meta) é obrigatório');
    }

    await pool.query(
      `INSERT INTO whatsapp_settings
         (user_id, provider, base_url, instance_name, api_key, phone, status, webhook_secret, app_secret, waba_id, meta_app_id)
       VALUES (?, 'meta', '', ?, ?, ?, 'disconnected', ?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
         provider = 'meta',
         base_url = '',
         instance_name = EXCLUDED.instance_name,
         api_key = EXCLUDED.api_key,
         phone = EXCLUDED.phone,
         app_secret = EXCLUDED.app_secret,
         waba_id = EXCLUDED.waba_id,
         meta_app_id = EXCLUDED.meta_app_id,
         status = CASE WHEN whatsapp_settings.status = 'connected' THEN whatsapp_settings.status ELSE 'disconnected' END`,
      [userId, phoneNumberId, accessToken, phone, webhookSecret, appSecret, wabaId, metaAppId]
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
      const wabaId =
        settings.wabaId ||
        (await resolveWabaId(settings.instanceName, settings.apiKey, metaResolveOptions(settings)));
      if (!settings.phone && info.phone) {
        await pool.query('UPDATE whatsapp_settings SET phone = ? WHERE user_id = ?', [info.phone, userId]);
      }
      await pool.query(
        'UPDATE whatsapp_settings SET status = ?, waba_id = COALESCE(NULLIF(?, \'\'), waba_id) WHERE user_id = ?',
        ['connected', wabaId || '', userId]
      );
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
    wabaId: settings.wabaId || '',
    metaAppId: settings.metaAppId || '',
    hasWabaId: Boolean(settings.wabaId),
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
    const resolveOpts = metaResolveOptions(settings);
    const wabaId =
      settings.wabaId ||
      (await subscribeAppToWaba(settings.instanceName, settings.apiKey, resolveOpts)) ||
      (await resolveWabaId(settings.instanceName, settings.apiKey, resolveOpts));
    if (!settings.phone && info.phone) {
      await pool.query('UPDATE whatsapp_settings SET phone = ? WHERE user_id = ?', [info.phone, userId]);
    }
    await pool.query(
      'UPDATE whatsapp_settings SET status = ?, waba_id = COALESCE(NULLIF(?, \'\'), waba_id) WHERE user_id = ?',
      ['connected', wabaId || '', userId]
    );
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
  const phone = jidToPhone(remoteJid);
  const { chatId: resolvedId, remoteJid: canonicalJid } = await resolveChatForPhone(userId, phone);
  const effectiveJid = canonicalJid || phoneToCanonicalJid(phone) || remoteJid;

  if (resolvedId) {
    const [existing] = await pool.query('SELECT unread FROM whatsapp_chats WHERE id = ?', [resolvedId]);
    const unread = incrementUnread ? Number(existing[0]?.unread || 0) + 1 : existing[0]?.unread || 0;
    await pool.query(
      `UPDATE whatsapp_chats SET name = COALESCE(NULLIF(?, ''), name), last_message = ?, last_message_at = ?, unread = ?
       WHERE id = ?`,
      [name || '', lastMessage || '', lastMessageAt, unread, resolvedId]
    );
    await mergeDuplicatesIntoChat(userId, resolvedId, phone);
    return resolvedId;
  }

  let contactId = null;
  const canonicalPhone = canonicalWhatsAppPhone(phone);
  if (canonicalPhone) {
    const [contacts] = await pool.query(
      "SELECT id FROM contacts WHERE user_id = ? AND REPLACE(REPLACE(REPLACE(telefone, ' ', ''), '-', ''), '+', '') LIKE ? LIMIT 1",
      [userId, `%${canonicalPhone.slice(-8)}%`]
    );
    contactId = contacts[0]?.id ?? null;
  }

  const [ins] = await pool.query(
    `INSERT INTO whatsapp_chats (user_id, remote_jid, contact_id, name, last_message, last_message_at, unread)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      effectiveJid,
      contactId,
      name || canonicalPhone || effectiveJid,
      lastMessage || '',
      lastMessageAt,
      incrementUnread ? 1 : 0,
    ]
  );
  const newId = ins.insertId;
  if (newId) {
    await mergeDuplicatesIntoChat(userId, newId, phone);
  }
  return newId;
}

export async function insertMessage(userId, chatId, { waMessageId, body, fromMe, messageAt, status }) {
  if (waMessageId) {
    const [dup] = await pool.query(
      'SELECT id FROM whatsapp_messages WHERE user_id = ? AND wa_message_id = ? LIMIT 1',
      [userId, waMessageId]
    );
    if (dup.length > 0) return dup[0].id;
  }

  const msgStatus = fromMe ? status || 'sent' : '';

  const [ins] = await pool.query(
    `INSERT INTO whatsapp_messages (user_id, chat_id, wa_message_id, body, from_me, message_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, chatId, waMessageId || null, body, fromMe ? true : false, messageAt, msgStatus]
  );
  return ins.insertId;
}

export async function updateMessageStatus(userId, waMessageId, status) {
  if (!waMessageId || !status) return;
  const next = String(status).toLowerCase();
  if (!['sent', 'delivered', 'read', 'failed'].includes(next)) return;

  const [rows] = await pool.query(
    'SELECT id, status FROM whatsapp_messages WHERE user_id = ? AND wa_message_id = ? LIMIT 1',
    [userId, waMessageId]
  );
  if (!rows.length) return;

  const current = String(rows[0].status || 'sent').toLowerCase();
  const currentRank = STATUS_RANK[current] ?? 0;
  const nextRank = STATUS_RANK[next] ?? 0;
  if (next !== 'failed' && nextRank <= currentRank) return;

  await pool.query('UPDATE whatsapp_messages SET status = ? WHERE id = ? AND user_id = ?', [
    next,
    rows[0].id,
    userId,
  ]);
}

export async function setChatAttendance(userId, chatId, status) {
  const next = status === 'closed' ? 'closed' : 'open';
  const [result] = await pool.query(
    'UPDATE whatsapp_chats SET attendance_status = ?, updated_at = NOW() WHERE id = ? AND user_id = ?',
    [next, chatId, userId]
  );
  if (!result.affectedRows) throw new Error('Conversa não encontrada');
  return { attendanceStatus: next };
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

    for (const entry of payload?.entry || []) {
      const entryWabaId = entry?.id ? String(entry.id).trim() : '';
      if (entryWabaId && payload?.object === 'whatsapp_business_account') {
        await pool.query(
          `UPDATE whatsapp_settings SET waba_id = ? WHERE user_id = ? AND COALESCE(waba_id, '') = ''`,
          [entryWabaId, userId]
        );
        break;
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

    const statuses = parseWebhookStatuses(payload);
    for (const st of statuses) {
      await updateMessageStatus(userId, st.waMessageId, st.status);
    }

    for (const item of items) {
      if (!item.text && !item.media) continue;
      try {
        let body = item.text;
        let preview = item.text;

        if (item.media) {
          try {
            const { buffer, mimeType } = await downloadMetaMedia(settings.apiKey, item.media.id);
            const normalizedMime = normalizeMetaMime(item.media.filename, mimeType || item.media.mimeType, buffer);
            const kind = item.media.kind === 'document' ? 'document' : detectMediaKind(normalizedMime) || item.media.kind;
            const safeName = safeMediaFilename(
              item.media.filename || `${kind}-${item.waMessageId || Date.now()}`,
              normalizedMime
            );
            const previewUrl = await resolveMediaPreviewUrl(userId, buffer, safeName, normalizedMime, kind);
            body = serializeMediaMessage({ kind, name: safeName, caption: item.media.caption, url: previewUrl });
            preview = item.media.caption?.trim() || mediaLabel({ kind, name: safeName });
          } catch (mediaErr) {
            console.error('WhatsApp webhook media download:', mediaErr.message);
            body = item.text || `[Mídia recebida — falha ao baixar: ${mediaErr.message}]`;
            preview = body;
          }
        }

        const remoteJid = phoneToCanonicalJid(item.from);
        const chatId = await upsertChat(userId, {
          remoteJid,
          name: item.contactName || item.from,
          lastMessage: preview,
          lastMessageAt: item.messageAt,
          incrementUnread: true,
        });
        await pool.query(
          "UPDATE whatsapp_chats SET attendance_status = 'open' WHERE id = ? AND user_id = ?",
          [chatId, userId]
        );
        await insertMessage(userId, chatId, {
          waMessageId: item.waMessageId,
          body,
          fromMe: false,
          messageAt: item.messageAt,
        });

        const senderName = item.contactName || item.from;
        void sendPushToUser(userId, {
          title: `WhatsApp — ${senderName}`,
          body: (preview || 'Nova mensagem').slice(0, 120),
          url: '/admin/whatsapp',
          tag: `wa-${chatId}`,
        }).catch((pushErr) => console.warn('Push WhatsApp:', pushErr.message));
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

export async function openChatFromContact(userId, { phone, contactId, name }) {
  const digits = canonicalWhatsAppPhone(phone);
  if (digits.length < 12) throw new Error('Informe um telefone com DDI + DDD + número');

  const remoteJid = phoneToCanonicalJid(digits);
  const { chatId: existingId } = await resolveChatForPhone(userId, digits);

  let chatId;
  if (existingId) {
    chatId = existingId;
    await pool.query(
      `UPDATE whatsapp_chats SET
         name = COALESCE(NULLIF(?, ''), name),
         contact_id = COALESCE(?, contact_id),
         attendance_status = 'open',
         updated_at = NOW()
       WHERE id = ? AND user_id = ?`,
      [name || '', contactId || null, chatId, userId]
    );
  } else {
    chatId = await upsertChat(userId, {
      remoteJid,
      name: name || digits,
      lastMessage: '',
      lastMessageAt: new Date(),
      incrementUnread: false,
    });
    if (contactId) {
      await pool.query('UPDATE whatsapp_chats SET contact_id = ? WHERE id = ? AND user_id = ?', [
        contactId,
        chatId,
        userId,
      ]);
    }
    await pool.query("UPDATE whatsapp_chats SET attendance_status = 'open' WHERE id = ? AND user_id = ?", [
      chatId,
      userId,
    ]);
  }

  const chats = await listChats(userId);
  const chat = chats.find((c) => c.id === String(chatId));
  if (!chat) throw new Error('Não foi possível abrir a conversa');
  return chat;
}

export async function getChatMessagingWindow(userId, chatId) {
  const messages = await listMessages(userId, chatId);
  return computeMessagingWindow(messages);
}

async function assertMetaCustomerCareWindow(userId, chatId) {
  const settings = await getSettings(userId);
  if (!settings || settings.provider !== 'meta') return;

  const window = await getChatMessagingWindow(userId, chatId);
  if (!window.withinWindow) {
    throw new Error(
      'Fora da janela de 24 horas. Finalize o atendimento e inicie novamente com um modelo aprovado pela Meta.'
    );
  }
}

export async function sendTemplateMessage(userId, chatId, { templateName, templateLanguage, bodyPreview }) {
  const settings = await getSettings(userId);
  if (!settings) throw new Error('WhatsApp não configurado');
  if (settings.status !== 'connected') throw new Error('WhatsApp não está conectado');
  if (settings.provider !== 'meta') {
    throw new Error('Envio de modelos disponível apenas com a API oficial Meta');
  }

  const name = String(templateName || '').trim();
  const language = String(templateLanguage || '').trim();
  if (!name || !language) {
    throw new Error('Modelo e idioma são obrigatórios');
  }

  const [chatRows] = await pool.query(
    'SELECT remote_jid AS remoteJid FROM whatsapp_chats WHERE id = ? AND user_id = ?',
    [chatId, userId]
  );
  const chat = chatRows[0] ? normalizeRow(chatRows[0]) : null;
  if (!chat) throw new Error('Conversa não encontrada');

  const number = canonicalWhatsAppPhone(jidToPhone(chat.remoteJid));
  const result = await metaSendTemplate(settings.instanceName, settings.apiKey, number, name, language);
  const waMessageId = result?.messages?.[0]?.id || null;
  const displayBody = String(bodyPreview || `[Modelo: ${name}]`).trim();
  const messageAt = new Date();

  await insertMessage(userId, chatId, {
    waMessageId,
    body: displayBody,
    fromMe: true,
    messageAt,
    status: 'sent',
  });

  await mergeDuplicatesIntoChat(userId, Number(chatId), number);
  await pool.query(
    `UPDATE whatsapp_chats SET remote_jid = ?, last_message = ?, last_message_at = ?, attendance_status = 'open'
     WHERE id = ? AND user_id = ?`,
    [phoneToCanonicalJid(number), displayBody, messageAt, chatId, userId]
  );

  return listMessages(userId, chatId);
}

export async function startNewAttendance(userId, { phone, name, contactId: contactIdParam, templateName, templateLanguage, templateBody }) {
  const digits = canonicalWhatsAppPhone(phone);
  if (digits.length < 12) throw new Error('Informe um telefone com DDI + DDD + número');

  const tplName = String(templateName || '').trim();
  const tplLang = String(templateLanguage || '').trim();
  if (!tplName || !tplLang) {
    throw new Error('Selecione um modelo de mensagem aprovado pela Meta');
  }

  let contactId = contactIdParam ? Number(contactIdParam) : null;
  let contactName = String(name || '').trim();

  if (!contactId || !contactName) {
    const [contacts] = await pool.query(
      "SELECT id, nome FROM contacts WHERE user_id = ? AND REPLACE(REPLACE(REPLACE(telefone, ' ', ''), '-', ''), '+', '') LIKE ? LIMIT 1",
      [userId, `%${digits.slice(-8)}%`]
    );
    if (contacts[0]) {
      contactId = contactId || contacts[0].id;
      if (!contactName) contactName = contacts[0].nome;
    }
  }

  const chat = await openChatFromContact(userId, {
    phone: digits,
    contactId,
    name: contactName,
  });

  const messages = await sendTemplateMessage(userId, Number(chat.id), {
    templateName: tplName,
    templateLanguage: tplLang,
    bodyPreview: templateBody,
  });

  const chats = await listChats(userId);
  const updatedChat = chats.find((c) => c.id === chat.id) || chat;
  const messagingWindow = computeMessagingWindow(messages);
  return { chat: updatedChat, messages, messagingWindow };
}

const BULK_SEND_DELAY_MS_MIN = 2000;
const BULK_SEND_DELAY_MS_MAX = 3000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bulkSendDelayMs() {
  return BULK_SEND_DELAY_MS_MIN + Math.floor(Math.random() * (BULK_SEND_DELAY_MS_MAX - BULK_SEND_DELAY_MS_MIN + 1));
}

export async function sendBulkTemplates(userId, { phones, templateName, templateLanguage, templateBody }) {
  const settings = await getSettings(userId);
  if (!settings) throw new Error('WhatsApp não configurado');
  if (settings.provider !== 'meta') {
    throw new Error('Disparos em massa disponíveis apenas com a API oficial Meta');
  }
  if (settings.status !== 'connected') {
    throw new Error('Conecte o WhatsApp antes de enviar disparos');
  }

  const tplName = String(templateName || '').trim();
  const tplLang = String(templateLanguage || '').trim();
  if (!tplName || !tplLang) {
    throw new Error('Selecione um modelo de mensagem aprovado pela Meta');
  }

  const unique = [...new Set((phones || []).map((p) => canonicalWhatsAppPhone(p)).filter((p) => p.length >= 12))];
  if (!unique.length) {
    throw new Error('Informe ao menos um telefone válido');
  }

  const sent = [];
  const failed = [];

  for (let i = 0; i < unique.length; i++) {
    const phone = unique[i];
    if (i > 0) {
      await sleep(bulkSendDelayMs());
    }
    try {
      const chat = await openChatFromContact(userId, { phone, name: '' });
      await sendTemplateMessage(userId, Number(chat.id), {
        templateName: tplName,
        templateLanguage: tplLang,
        bodyPreview: templateBody,
      });
      sent.push(phone);
    } catch (err) {
      failed.push({ phone, error: err.message || 'Falha no envio' });
    }
  }

  return { sent: sent.length, failed, phones: sent };
}

export async function getUnreadCount(userId) {
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(unread), 0) AS total FROM whatsapp_chats
     WHERE user_id = ? AND COALESCE(attendance_status, 'open') = 'open'`,
    [userId]
  );
  return Number(rows[0]?.total) || 0;
}

export async function listChats(userId) {
  await dedupeUserChats(userId);

  const [rows] = await pool.query(
    `SELECT c.id, c.remote_jid AS remoteJid, c.contact_id AS contactId, c.name, c.last_message AS lastMessage,
            c.last_message_at AS lastMessageAt, c.unread, c.attendance_status AS attendanceStatus,
            ct.nome AS contactName
     FROM whatsapp_chats c
     LEFT JOIN contacts ct ON ct.id = c.contact_id
     WHERE c.user_id = ? AND COALESCE(c.attendance_status, 'open') = 'open'
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
      when: formatWhenLocal(row.lastMessageAt),
      unread: Number(row.unread) || 0,
      attendanceStatus: row.attendanceStatus === 'closed' ? 'closed' : 'open',
    };
  });
}

export async function listMessages(userId, chatId) {
  const [rows] = await pool.query(
    `SELECT id, body AS text, from_me AS fromMe, message_at AS messageAt, status
     FROM whatsapp_messages WHERE user_id = ? AND chat_id = ? ORDER BY message_at ASC, id ASC`,
    [userId, chatId]
  );

  return rows.map((r) => {
    const row = normalizeRow(r);
    const fromMe = Boolean(row.fromMe);
    let status = row.status ? String(row.status).toLowerCase() : '';
    if (fromMe && !status) status = 'sent';
    const parsed = parseMessageBody(row.text);
    return {
      id: String(row.id),
      text: parsed.text,
      media: parsed.media,
      fromMe,
      messageAt: toIso(row.messageAt),
      status: fromMe ? status : undefined,
    };
  });
}

async function storeBlobPreview(userId, buffer, filename, contentType) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return '';
  try {
    const { put } = await import('@vercel/blob');
    const safeName = String(filename || 'arquivo').replace(/[^\w.\-()+]/g, '_');
    const blob = await put(`wa/${userId}/${Date.now()}-${safeName}`, buffer, {
      access: 'public',
      token,
      contentType: contentType || undefined,
    });
    return blob.url;
  } catch (err) {
    console.warn('WhatsApp media blob:', err.message);
    return '';
  }
}

async function resolveMediaPreviewUrl(userId, buffer, filename, contentType, kind) {
  const blobUrl = await storeBlobPreview(userId, buffer, filename, contentType);
  if (blobUrl) return blobUrl;
  return inlinePreviewDataUrl(buffer, contentType, kind);
}

async function sendMediaToMeta(settings, number, { kind, buffer, mimeType, filename, caption }) {
  let upload;
  try {
    upload = await uploadMetaMedia(settings.instanceName, settings.apiKey, {
      buffer,
      mimeType,
      filename,
    });
  } catch (err) {
    throw new Error(`Upload para Meta: ${err.message}`);
  }

  try {
    const result = await sendMetaMedia(settings.instanceName, settings.apiKey, number, {
      kind,
      mediaId: upload.id,
      caption,
      filename,
    });
    return { result, kind };
  } catch (err) {
    if (kind !== 'audio') throw new Error(`Envio para WhatsApp: ${err.message}`);
    try {
      const docUpload = await uploadMetaMedia(settings.instanceName, settings.apiKey, {
        buffer,
        mimeType,
        filename,
      });
      const result = await sendMetaMedia(settings.instanceName, settings.apiKey, number, {
        kind: 'document',
        mediaId: docUpload.id,
        caption,
        filename,
      });
      return { result, kind: 'document' };
    } catch (docErr) {
      throw new Error(`Envio para WhatsApp: ${docErr.message}`);
    }
  }
}

export async function sendChatMedia(userId, chatId, { buffer, mimeType, filename, caption }) {
  const settings = await getSettings(userId);
  if (!settings) throw new Error('WhatsApp não configurado');
  if (settings.status !== 'connected') throw new Error('WhatsApp não está conectado');
  if (settings.provider !== 'meta') {
    throw new Error('Envio de anexos disponível apenas com a API oficial Meta');
  }

  await assertMetaCustomerCareWindow(userId, chatId);

  const [chatRows] = await pool.query(
    'SELECT remote_jid AS remoteJid FROM whatsapp_chats WHERE id = ? AND user_id = ?',
    [chatId, userId]
  );
  const chat = chatRows[0] ? normalizeRow(chatRows[0]) : null;
  if (!chat) throw new Error('Conversa não encontrada');

  const number = canonicalWhatsAppPhone(jidToPhone(chat.remoteJid));
  const fileBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (!fileBuffer.length) throw new Error('Arquivo vazio');
  const normalizedMime = normalizeMetaMime(filename, mimeType, fileBuffer);
  assertMetaMimeSupported(normalizedMime);
  const kind = detectMediaKind(normalizedMime);
  const safeName = safeMediaFilename(filename, normalizedMime);

  const { result, kind: sendKind } = await sendMediaToMeta(settings, number, {
    kind,
    buffer: fileBuffer,
    mimeType: normalizedMime,
    filename: safeName,
    caption,
  });

  const waMessageId = result?.messages?.[0]?.id || null;
  const previewUrl = await resolveMediaPreviewUrl(
    userId,
    fileBuffer,
    safeName,
    normalizedMime,
    sendKind
  );
  const body = serializeMediaMessage({ kind: sendKind, name: safeName, caption, url: previewUrl });
  const preview = caption?.trim() || mediaLabel({ kind: sendKind, name: safeName });
  const messageAt = new Date();

  await insertMessage(userId, chatId, {
    waMessageId,
    body,
    fromMe: true,
    messageAt,
    status: 'sent',
  });

  await mergeDuplicatesIntoChat(userId, Number(chatId), number);
  await pool.query(
    `UPDATE whatsapp_chats SET remote_jid = ?, last_message = ?, last_message_at = ?, attendance_status = 'open'
     WHERE id = ? AND user_id = ?`,
    [phoneToCanonicalJid(number), preview, messageAt, chatId, userId]
  );

  return listMessages(userId, chatId);
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

  const number = canonicalWhatsAppPhone(jidToPhone(chat.remoteJid));
  let result;
  let waMessageId = null;

  if (settings.provider === 'meta') {
    await assertMetaCustomerCareWindow(userId, chatId);
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
    status: 'sent',
  });

  await mergeDuplicatesIntoChat(userId, Number(chatId), number);
  await pool.query(
    `UPDATE whatsapp_chats SET remote_jid = ?, last_message = ?, last_message_at = ?, attendance_status = 'open'
     WHERE id = ? AND user_id = ?`,
    [phoneToCanonicalJid(number), text, messageAt, chatId, userId]
  );

  return listMessages(userId, chatId);
}

const TZ_BR = 'America/Sao_Paulo';

function formatWhenLocal(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';

  const now = new Date();
  const dayFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ_BR, year: 'numeric', month: '2-digit', day: '2-digit' });
  const timeFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ_BR, hour: '2-digit', minute: '2-digit' });

  const dDay = dayFmt.format(d);
  const nowDay = dayFmt.format(now);
  if (dDay === nowDay) return timeFmt.format(d);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dDay === dayFmt.format(yesterday)) return 'Ontem';

  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ_BR, day: '2-digit', month: '2-digit' }).format(d);
}

export async function getMessageTemplates(userId) {
  const settings = await getSettings(userId);
  if (!settings) {
    throw new Error('WhatsApp não configurado');
  }
  if (settings.provider !== 'meta') {
    throw new Error('Modelos disponíveis apenas com a API oficial Meta');
  }
  if (settings.status !== 'connected') {
    throw new Error('Conecte o WhatsApp antes de consultar os modelos');
  }

  const wabaId = await ensureWabaIdPersisted(userId, settings);
  return listMessageTemplates(settings.instanceName, settings.apiKey, wabaId, metaResolveOptions(settings));
}
