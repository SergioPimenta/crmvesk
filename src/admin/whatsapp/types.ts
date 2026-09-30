import type { WaMsgStatus } from '../../utils/waChatFormat';
import type { WaMediaPayload } from '../../utils/waMessageBody';

export type ListTab = 'aguardando' | 'andamento' | 'finalizados';

export type MetaApprovedTemplate = {
  id: string;
  name: string;
  body: string;
  language: string;
  category: string;
};

// Espelha os limites reais da Meta Cloud API (server/routes/whatsapp.js).
export const MEDIA_BYTES_LIMITS: Record<string, number> = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
};

export function mediaKindFromMime(mimeType: string): keyof typeof MEDIA_BYTES_LIMITS {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

export const templateKey = (t: MetaApprovedTemplate) => `${t.id}-${t.language}`;

export const templateOptionLabel = (t: MetaApprovedTemplate) => {
  const lang = t.language.replace('_', '-');
  return t.name.includes(lang) ? t.name : `${t.name} (${lang})`;
};

export type WaMessage = {
  id: string;
  text: string;
  messageAt: string;
  fromMe: boolean;
  status?: WaMsgStatus;
  errorMessage?: string;
  media?: WaMediaPayload | null;
};

export type WaConversation = {
  id: string;
  contatoId?: string;
  nome: string;
  phone: string;
  lastMessage: string;
  when: string;
  unread: number;
  attendanceStatus?: 'open' | 'closed';
  assignedTo?: string;
  assignedToName?: string;
};

export type TeamMember = {
  id: number;
  name: string;
};

export { initials } from '../../utils/initials';

export const formatAudioTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

export const RECORD_BARS = 28;
