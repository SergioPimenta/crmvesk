const normalizeBaseUrl = (url) => String(url || '').replace(/\/+$/, '');

export async function evolutionRequest(baseUrl, apiKey, method, path, body) {
  const url = `${normalizeBaseUrl(baseUrl)}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
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
      (data && typeof data === 'object' && (data.message || data.error || data.response?.message)) ||
      (typeof data === 'string' ? data : null) ||
      res.statusText;
    const err = new Error(String(message));
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export function digitsOnly(phone) {
  return String(phone || '').replace(/\D/g, '');
}

export function jidToPhone(remoteJid) {
  if (!remoteJid) return '';
  const base = String(remoteJid).split('@')[0];
  return digitsOnly(base);
}

export function phoneToJid(phone) {
  const digits = digitsOnly(phone);
  if (!digits) return '';
  return `${digits}@s.whatsapp.net`;
}

export function extractMessageText(message = {}) {
  if (!message || typeof message !== 'object') return '';
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  if (message.documentMessage?.caption) return message.documentMessage.caption;
  if (message.buttonsResponseMessage?.selectedDisplayText) return message.buttonsResponseMessage.selectedDisplayText;
  if (message.listResponseMessage?.title) return message.listResponseMessage.title;
  return '[Mídia ou mensagem não suportada]';
}

export async function getConnectionState(baseUrl, apiKey, instanceName) {
  const data = await evolutionRequest(baseUrl, apiKey, 'GET', `/instance/connectionState/${instanceName}`);
  const state =
    data?.instance?.state ||
    data?.state ||
    data?.status ||
    data?.connectionStatus ||
    (typeof data === 'string' ? data : 'close');
  return String(state).toLowerCase();
}

export async function connectInstance(baseUrl, apiKey, instanceName) {
  return evolutionRequest(baseUrl, apiKey, 'GET', `/instance/connect/${instanceName}`);
}

export async function createInstance(baseUrl, apiKey, instanceName) {
  return evolutionRequest(baseUrl, apiKey, 'POST', '/instance/create', {
    instanceName,
    integration: 'WHATSAPP-BAILEYS',
    qrcode: true,
  });
}

export async function setWebhook(baseUrl, apiKey, instanceName, webhookUrl) {
  return evolutionRequest(baseUrl, apiKey, 'POST', `/webhook/set/${instanceName}`, {
    enabled: true,
    url: webhookUrl,
    webhookByEvents: false,
    webhookBase64: false,
    events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
  });
}

export async function sendText(baseUrl, apiKey, instanceName, number, text) {
  const payload = { number: digitsOnly(number), text };
  try {
    return await evolutionRequest(baseUrl, apiKey, 'POST', `/message/sendText/${instanceName}`, payload);
  } catch {
    return evolutionRequest(baseUrl, apiKey, 'POST', `/message/sendText/${instanceName}`, {
      number: digitsOnly(number),
      textMessage: { text },
    });
  }
}

export async function findChats(baseUrl, apiKey, instanceName) {
  const data = await evolutionRequest(baseUrl, apiKey, 'POST', `/chat/findChats/${instanceName}`, {});
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.chats)) return data.chats;
  if (Array.isArray(data?.records)) return data.records;
  return [];
}

export async function findMessages(baseUrl, apiKey, instanceName, remoteJid, limit = 80) {
  const data = await evolutionRequest(baseUrl, apiKey, 'POST', `/chat/findMessages/${instanceName}`, {
    where: { key: { remoteJid } },
    page: 1,
    offset: limit,
  });
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.messages)) return data.messages;
  if (Array.isArray(data?.records)) return data.records;
  return [];
}

export function extractQrBase64(connectData) {
  if (!connectData) return null;
  const candidates = [
    connectData.base64,
    connectData.qrcode?.base64,
    connectData.qrcode,
    connectData.code,
    connectData.pairingCode,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 50) {
      return c.startsWith('data:image') ? c : `data:image/png;base64,${c}`;
    }
  }
  return null;
}

export function isConnectedState(state) {
  const s = String(state || '').toLowerCase();
  return s === 'open' || s === 'connected';
}
