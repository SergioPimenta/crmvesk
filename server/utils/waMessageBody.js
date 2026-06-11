export function mediaLabel({ kind, name }) {
  if (kind === 'audio') return '🎤 Áudio';
  if (kind === 'image') return '📷 Foto';
  if (kind === 'video') return '🎬 Vídeo';
  return `📎 ${name || 'Documento'}`;
}

export function serializeMediaMessage({ kind, name, caption, url }) {
  return JSON.stringify({
    _waMedia: true,
    kind,
    name: name || '',
    caption: caption || '',
    url: url || '',
  });
}

/** Preview local no CRM (data URL) quando não há Blob na Vercel. */
export function inlinePreviewDataUrl(buffer, mimeType, kind) {
  if (!buffer?.length) return '';
  const maxBytes = kind === 'image' ? 900_000 : kind === 'audio' ? 600_000 : 0;
  if (!maxBytes || buffer.length > maxBytes) return '';
  const mime = mimeType || 'application/octet-stream';
  return `data:${mime};base64,${Buffer.from(buffer).toString('base64')}`;
}

export function parseMessageBody(body) {
  if (!body || typeof body !== 'string') {
    return { text: body || '', media: null };
  }
  try {
    const parsed = JSON.parse(body);
    if (parsed && parsed._waMedia) {
      const label = mediaLabel(parsed);
      return {
        text: parsed.caption?.trim() || label,
        media: parsed,
      };
    }
  } catch {
    /* texto simples */
  }
  return { text: body, media: null };
}

const MIME_ALIASES = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
};

const EXT_TO_MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  '3gp': 'video/3gpp',
  pdf: 'application/pdf',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  amr: 'audio/amr',
  webm: 'audio/webm',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
};

const META_SUPPORTED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/3gpp',
  'audio/aac',
  'audio/mp4',
  'audio/mpeg',
  'audio/amr',
  'audio/ogg',
  'audio/opus',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export function safeMediaFilename(name, mime) {
  const base = String(name || 'arquivo').replace(/[^\w.\-()+]/g, '_');
  if (base.includes('.')) return base;
  const ext = Object.entries(EXT_TO_MIME).find(([, m]) => m === mime)?.[0];
  return ext ? `${base}.${ext}` : base;
}

export function detectMimeFromBuffer(buffer) {
  if (!buffer || buffer.length < 4) return '';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/gif';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return '';
}

export function normalizeMetaMime(filename, mimeType, buffer) {
  let mime = String(mimeType || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
  if (MIME_ALIASES[mime]) mime = MIME_ALIASES[mime];

  const fromBuffer = detectMimeFromBuffer(buffer);
  if (fromBuffer) mime = fromBuffer;

  if (!mime || mime === 'application/octet-stream') {
    const ext = String(filename || '')
      .split('.')
      .pop()
      ?.toLowerCase();
    if (ext && EXT_TO_MIME[ext]) mime = EXT_TO_MIME[ext];
  }

  return mime;
}

export function assertMetaMimeSupported(mime) {
  if (!mime || !META_SUPPORTED_MIMES.has(mime)) {
    throw new Error(
      `Formato não suportado pelo WhatsApp (${mime || 'desconhecido'}). Imagens: JPEG, PNG ou WebP.`
    );
  }
}

export function detectMediaKind(mimeType) {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}
