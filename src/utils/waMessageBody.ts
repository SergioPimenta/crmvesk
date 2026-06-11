export type WaMediaKind = 'image' | 'video' | 'audio' | 'document';

export type WaMediaPayload = {
  _waMedia: true;
  kind: WaMediaKind;
  name: string;
  caption: string;
  url: string;
};

export function parseMessageBody(body: string): { text: string; media: WaMediaPayload | null } {
  if (!body) return { text: '', media: null };
  try {
    const parsed = JSON.parse(body) as WaMediaPayload;
    if (parsed?._waMedia) {
      const label =
        parsed.kind === 'audio'
          ? '🎤 Áudio'
          : parsed.kind === 'image'
            ? '📷 Foto'
            : parsed.kind === 'video'
              ? '🎬 Vídeo'
              : `📎 ${parsed.name || 'Documento'}`;
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
