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

export function detectMediaKind(mimeType) {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}
