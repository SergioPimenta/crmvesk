import crypto from 'crypto';

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

async function listWabaIdsFromDebugToken(accessToken) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return [];

  try {
    const appToken = `${appId}|${appSecret}`;
    const data = await metaRequest(
      appToken,
      'GET',
      `/debug_token?input_token=${encodeURIComponent(accessToken)}`
    );
    const ids = new Set();
    for (const scope of data?.data?.granular_scopes || []) {
      if (!/whatsapp/i.test(scope.scope || '')) continue;
      for (const id of scope.target_ids || []) {
        if (id) ids.add(String(id));
      }
    }
    return [...ids];
  } catch {
    return [];
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

/** Resolve o WABA ID a partir do Phone Number ID (vários métodos da Graph API). */
export async function resolveWabaId(phoneNumberId, accessToken) {
  const phoneId = String(phoneNumberId || '').trim();
  if (!phoneId) return null;

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

  const candidates = new Set([
    ...(await listWabaIdsFromDebugToken(accessToken)),
    ...(await listWabaIdsFromBusinesses(accessToken)),
  ]);

  for (const wabaId of candidates) {
    if (await wabaOwnsPhoneNumber(wabaId, phoneId, accessToken)) {
      return wabaId;
    }
  }

  if (candidates.size === 1) {
    return [...candidates][0];
  }

  return null;
}

export async function getWabaId(phoneNumberId, accessToken) {
  return resolveWabaId(phoneNumberId, accessToken);
}

export async function subscribeAppToWaba(phoneNumberId, accessToken) {
  try {
    const wabaId = await resolveWabaId(phoneNumberId, accessToken);
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
export async function listMessageTemplates(phoneNumberId, accessToken, cachedWabaId) {
  let wabaId = String(cachedWabaId || '').trim() || null;
  if (!wabaId) {
    wabaId = await resolveWabaId(phoneNumberId, accessToken);
  }
  if (!wabaId) {
    throw new Error(
      'Não foi possível identificar a conta WhatsApp Business (WABA). Verifique permissões whatsapp_business_management no token.'
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
