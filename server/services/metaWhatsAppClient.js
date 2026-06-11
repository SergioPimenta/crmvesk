import crypto from 'crypto';
import { File } from 'node:buffer';
import { buffer as bufferFromStream } from 'node:stream/consumers';
import FormData from 'form-data';

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export function digitsOnly(phone) {
  return String(phone || '').replace(/\D/g, '');
}

export function phoneToJid(phone) {
  const digits = digitsOnly(phone);
  if (!digits) return '';
  return `${digits}@s.whatsapp.net`;
}

export function jidToPhone(remoteJid) {
  if (!remoteJid) return '';
  return digitsOnly(String(remoteJid).split('@')[0]);
}

export async function metaRequest(accessToken, method, path, body) {
  const url = `${GRAPH_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const message =
      (data?.error?.message) ||
      (typeof data === 'string' ? data : null) ||
      res.statusText;
    const err = new Error(String(message));
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

/** Valida token e phone_number_id consultando a Meta Graph API. */
export async function validateConnection(phoneNumberId, accessToken) {
  const data = await metaRequest(accessToken, 'GET', `/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`);
  return {
    phone: digitsOnly(data?.display_phone_number || ''),
    displayName: data?.verified_name || '',
    qualityRating: data?.quality_rating?.score || null,
  };
}

export async function sendText(phoneNumberId, accessToken, to, text) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: digitsOnly(to),
    type: 'text',
    text: { preview_url: false, body: text },
  };
  return metaRequest(accessToken, 'POST', `/${phoneNumberId}/messages`, payload);
}

/** Envia modelo aprovado (obrigatório fora da janela de 24 h). */
export async function sendTemplate(phoneNumberId, accessToken, to, templateName, languageCode) {
  const name = String(templateName || '').trim();
  const code = String(languageCode || '').trim();
  if (!name || !code) {
    throw new Error('Nome e idioma do modelo são obrigatórios');
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: digitsOnly(to),
    type: 'template',
    template: {
      name,
      language: { code },
    },
  };
  return metaRequest(accessToken, 'POST', `/${phoneNumberId}/messages`, payload);
}

async function parseMetaUploadResponse(res) {
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const message =
      data?.error?.message || (typeof data === 'string' ? data : null) || res.statusText;
    throw new Error(String(message));
  }

  if (!data?.id) throw new Error('Meta não retornou o ID da mídia');
  return data;
}

/** Envia arquivo para a Meta e retorna o media id. */
export async function uploadMetaMedia(phoneNumberId, accessToken, { buffer, mimeType, filename }) {
  const mime = mimeType || 'application/octet-stream';
  const fileBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (!fileBuffer.length) throw new Error('Arquivo vazio');
  const name = filename || 'arquivo';
  const url = `${GRAPH_BASE}/${phoneNumberId}/media`;

  // FormData nativo do Node (melhor no Vercel serverless)
  if (typeof globalThis.FormData !== 'undefined') {
    const form = new globalThis.FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', new File([fileBuffer], name, { type: mime }));
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    return parseMetaUploadResponse(res);
  }

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', fileBuffer, {
    filename: name,
    contentType: mime,
    knownLength: fileBuffer.length,
  });

  const body = await bufferFromStream(form);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...form.getHeaders(),
      'Content-Length': String(body.length),
    },
    body,
  });

  return parseMetaUploadResponse(res);
}

/** Envia imagem, documento, áudio ou vídeo via media id. */
export async function sendMetaMedia(phoneNumberId, accessToken, to, { kind, mediaId, caption, filename }) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: digitsOnly(to),
    type: kind,
  };

  if (kind === 'image') {
    payload.image = { id: mediaId };
    if (caption?.trim()) payload.image.caption = caption.trim();
  } else if (kind === 'video') {
    payload.video = { id: mediaId };
    if (caption?.trim()) payload.video.caption = caption.trim();
  } else if (kind === 'audio') {
    payload.audio = { id: mediaId };
  } else {
    payload.document = {
      id: mediaId,
      filename: filename || 'documento',
    };
    if (caption?.trim()) payload.document.caption = caption.trim();
  }

  return metaRequest(accessToken, 'POST', `/${phoneNumberId}/messages`, payload);
}

/** Envia mídia por URL pública (recomendado no Vercel/serverless). */
export async function sendMetaMediaByLink(phoneNumberId, accessToken, to, { kind, url, caption, filename }) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: digitsOnly(to),
    type: kind,
  };

  if (kind === 'image') {
    payload.image = { link: url };
    if (caption?.trim()) payload.image.caption = caption.trim();
  } else if (kind === 'video') {
    payload.video = { link: url };
    if (caption?.trim()) payload.video.caption = caption.trim();
  } else if (kind === 'audio') {
    payload.audio = { link: url };
  } else {
    payload.document = { link: url, filename: filename || 'documento' };
    if (caption?.trim()) payload.document.caption = caption.trim();
  }

  return metaRequest(accessToken, 'POST', `/${phoneNumberId}/messages`, payload);
}

export function extractMessageText(message = {}) {
  if (!message || typeof message !== 'object') return '';
  if (message.type === 'text' && message.text?.body) return message.text.body;
  if (message.type === 'button' && message.button?.text) return message.button.text;
  if (message.type === 'interactive') {
    if (message.interactive?.button_reply?.title) return message.interactive.button_reply.title;
    if (message.interactive?.list_reply?.title) return message.interactive.list_reply.title;
  }
  if (message.image?.caption) return message.image.caption;
  if (message.video?.caption) return message.video.caption;
  if (message.document?.caption) return message.document.caption;
  const type = message.type || 'desconhecido';
  return `[Mensagem ${type} — abra no WhatsApp]`;
}

/** Extrai mensagens recebidas do payload do webhook da Meta. */
export function parseWebhookMessages(payload) {
  const items = [];
  if (payload?.object !== 'whatsapp_business_account') return items;

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;
      const value = change.value || {};
      const contactsByWaId = {};
      for (const contact of value.contacts || []) {
        if (contact.wa_id) {
          contactsByWaId[digitsOnly(contact.wa_id)] = contact.profile?.name || '';
        }
      }

      for (const message of value.messages || []) {
        if (!message.from) continue;
        const from = digitsOnly(message.from);
        items.push({
          from,
          waMessageId: message.id,
          text: extractMessageText(message),
          contactName: contactsByWaId[from] || '',
          messageAt: message.timestamp
            ? new Date(Number(message.timestamp) * 1000)
            : new Date(),
        });
      }
    }
  }

  return items;
}

/** Extrai atualizações de status (enviada, entregue, lida) do webhook da Meta. */
export function parseWebhookStatuses(payload) {
  const items = [];
  if (payload?.object !== 'whatsapp_business_account') return items;

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;
      for (const status of change.value?.statuses || []) {
        if (!status.id || !status.status) continue;
        items.push({
          waMessageId: status.id,
          status: String(status.status).toLowerCase(),
        });
      }
    }
  }

  return items;
}

/** Inscreve o app na conta WhatsApp Business (necessário para receber webhooks). */
async function wabaOwnsPhoneNumber(wabaId, phoneNumberId, accessToken) {
  try {
    let after = null;
    for (;;) {
      const qs = new URLSearchParams({ fields: 'id', limit: '100' });
      if (after) qs.set('after', after);
      const data = await metaRequest(accessToken, 'GET', `/${wabaId}/phone_numbers?${qs.toString()}`);
      if ((data?.data || []).some((p) => String(p.id) === String(phoneNumberId))) {
        return true;
      }
      after = data?.paging?.cursors?.after;
      if (!after) break;
    }
  } catch {
    return false;
  }
  return false;
}

async function listWabaIdsFromDebugToken(accessToken, appId, appSecret) {
  const id = String(appId || process.env.META_APP_ID || '').trim();
  const secret = String(appSecret || process.env.META_APP_SECRET || '').trim();
  if (!id || !secret) return { all: [], management: [] };

  try {
    const appToken = `${id}|${secret}`;
    const data = await metaRequest(
      appToken,
      'GET',
      `/debug_token?input_token=${encodeURIComponent(accessToken)}`
    );
    const all = [];
    const management = [];
    for (const scope of data?.data?.granular_scopes || []) {
      const scopeName = String(scope.scope || '');
      if (!/whatsapp/i.test(scopeName)) continue;
      for (const targetId of scope.target_ids || []) {
        if (!targetId) continue;
        const wabaId = String(targetId);
        all.push(wabaId);
        if (scopeName === 'whatsapp_business_management') {
          management.push(wabaId);
        }
      }
    }
    return {
      all: [...new Set(all)],
      management: [...new Set(management)],
    };
  } catch {
    return { all: [], management: [] };
  }
}

async function listWabaIdsFromBusinesses(accessToken) {
  const ids = new Set();
  try {
    const businesses = await metaRequest(accessToken, 'GET', `/me/businesses?fields=id`);
    for (const biz of businesses?.data || []) {
      for (const edge of ['owned_whatsapp_business_accounts', 'client_whatsapp_business_accounts']) {
        try {
          const res = await metaRequest(accessToken, 'GET', `/${biz.id}/${edge}?fields=id`);
          for (const w of res?.data || []) {
            if (w?.id) ids.add(String(w.id));
          }
        } catch {
          /* empresa sem WABA neste edge */
        }
      }
    }
  } catch {
    /* sem permissão business_management */
  }
  return [...ids];
}

async function wabaCanListTemplates(wabaId, accessToken) {
  try {
    await metaRequest(accessToken, 'GET', `/${wabaId}/message_templates?limit=1&fields=id`);
    return true;
  } catch {
    return false;
  }
}

/** Resolve o WABA ID a partir do Phone Number ID (vários métodos da Graph API). */
export async function resolveWabaId(phoneNumberId, accessToken, options = {}) {
  const phoneId = String(phoneNumberId || '').trim();
  if (!phoneId) return null;

  const manualWabaId = String(options.cachedWabaId || options.wabaId || '').trim();
  if (manualWabaId) return manualWabaId;

  try {
    const legacy = await metaRequest(accessToken, 'GET', `/${phoneId}?fields=whatsapp_business_account`);
    if (legacy?.whatsapp_business_account?.id) {
      return String(legacy.whatsapp_business_account.id);
    }
  } catch (err) {
    const msg = String(err.message || '');
    if (!msg.includes('(#100)') && !msg.includes('nonexisting field')) {
      throw err;
    }
  }

  const { all: debugAll, management: debugManagement } = await listWabaIdsFromDebugToken(
    accessToken,
    options.appId,
    options.appSecret
  );
  const uniqueCandidates = [
    ...new Set([...debugManagement, ...debugAll, ...(await listWabaIdsFromBusinesses(accessToken))]),
  ];

  for (const wabaId of uniqueCandidates) {
    if (await wabaOwnsPhoneNumber(wabaId, phoneId, accessToken)) {
      return wabaId;
    }
  }

  for (const wabaId of uniqueCandidates) {
    if (await wabaCanListTemplates(wabaId, accessToken)) {
      return wabaId;
    }
  }

  if (debugManagement.length > 0) {
    return debugManagement[0];
  }

  if (uniqueCandidates.length === 1) {
    return uniqueCandidates[0];
  }

  return null;
}

export async function getWabaId(phoneNumberId, accessToken) {
  return resolveWabaId(phoneNumberId, accessToken);
}

export async function subscribeAppToWaba(phoneNumberId, accessToken, options = {}) {
  try {
    const wabaId = await resolveWabaId(phoneNumberId, accessToken, options);
    if (!wabaId) return null;
    await metaRequest(accessToken, 'POST', `/${wabaId}/subscribed_apps`);
    return wabaId;
  } catch (err) {
    console.warn('WhatsApp WABA subscribe:', err.message);
    return null;
  }
}

export function verifySignature(appSecret, rawBody, signatureHeader) {
  if (!appSecret?.trim()) return true;
  if (!signatureHeader?.startsWith('sha256=')) return false;

  const expected = crypto.createHmac('sha256', appSecret.trim()).update(rawBody).digest('hex');
  const received = signatureHeader.slice(7);

  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
  } catch {
    return false;
  }
}

function extractTemplateBody(components = []) {
  const body = components.find((c) => c.type === 'BODY');
  return body?.text || '';
}

function mapMessageTemplate(row) {
  return {
    id: String(row.id || ''),
    name: row.name || '',
    status: row.status || '',
    category: row.category || '',
    language: row.language || '',
    body: extractTemplateBody(row.components),
    rejectedReason: row.rejected_reason || '',
    qualityScore:
      typeof row.quality_score === 'object' ? row.quality_score?.score || null : row.quality_score || null,
  };
}

/** Lista modelos de mensagem da conta WABA (aprovados, rejeitados, pendentes, etc.). */
export async function listMessageTemplates(phoneNumberId, accessToken, cachedWabaId, options = {}) {
  let wabaId = String(cachedWabaId || options.cachedWabaId || options.wabaId || '').trim() || null;
  if (!wabaId) {
    wabaId = await resolveWabaId(phoneNumberId, accessToken, options);
  }
  if (!wabaId) {
    throw new Error(
      'Não foi possível identificar a conta WhatsApp Business (WABA). Informe o WABA ID em Integrações (WhatsApp) ou verifique permissões whatsapp_business_management no token.'
    );
  }

  const fields = 'id,name,status,category,language,components,rejected_reason,quality_score';
  const templates = [];
  let after = null;

  for (;;) {
    const qs = new URLSearchParams({ limit: '100', fields });
    if (after) qs.set('after', after);
    const data = await metaRequest(accessToken, 'GET', `/${wabaId}/message_templates?${qs.toString()}`);
    for (const row of data?.data || []) {
      templates.push(mapMessageTemplate(row));
    }
    after = data?.paging?.cursors?.after;
    if (!after) break;
  }

  const approved = templates.filter((t) => t.status === 'APPROVED');
  const rejected = templates.filter((t) => t.status === 'REJECTED');
  const pending = templates.filter((t) => t.status === 'PENDING' || t.status === 'IN_APPEAL');
  const other = templates.filter(
    (t) => !['APPROVED', 'REJECTED', 'PENDING', 'IN_APPEAL'].includes(t.status)
  );

  return {
    wabaId,
    total: templates.length,
    groups: { approved, rejected, pending, other },
    templates,
  };
}
