import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { put } from '@vercel/blob/client';
import CrmLayout from '../components/crm/CrmLayout';
import Modal from '../components/crm/Modal';
import BulkMessagingModal from '../components/crm/BulkMessagingModal';
import WaAttachPreview, { type PendingAttachment } from '../components/crm/WaAttachPreview';
import { useCrmData, type Contact } from '../contexts/CrmDataContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
  buildChatTimeline,
  formatMessageTime,
  type WaMsgStatus,
} from '../utils/waChatFormat';
import { convertAudioBlobToMp3 } from '../utils/audioToMp3';
import { computeMessagingWindow } from '../utils/whatsappWindow';
import {
  buildFullPhone,
  COUNTRY_DIAL_CODES,
  countryFlag,
  DEFAULT_DIAL_COUNTRY,
  nationalDigitsFromContactPhone,
} from '../utils/countryDialCodes';
import type { WaMediaPayload } from '../utils/waMessageBody';

type MetaApprovedTemplate = {
  id: string;
  name: string;
  body: string;
  language: string;
  category: string;
};

// Espelha os limites reais da Meta Cloud API (server/routes/whatsapp.js).
const MEDIA_BYTES_LIMITS: Record<string, number> = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
};

function mediaKindFromMime(mimeType: string): keyof typeof MEDIA_BYTES_LIMITS {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

const templateKey = (t: MetaApprovedTemplate) => `${t.id}-${t.language}`;

const templateOptionLabel = (t: MetaApprovedTemplate) => {
  const lang = t.language.replace('_', '-');
  return t.name.includes(lang) ? t.name : `${t.name} (${lang})`;
};

type WaMessage = {
  id: string;
  text: string;
  messageAt: string;
  fromMe: boolean;
  status?: WaMsgStatus;
  errorMessage?: string;
  media?: WaMediaPayload | null;
};

type WaConversation = {
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

type TeamMember = {
  id: number;
  name: string;
};

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

const formatAudioTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

const RECORD_BARS = 28;

// Ícones preenchidos embutidos: o CSS "filled" do Tabler substitui a fonte de todos os ícones, então não pode ser importado junto.
const SolidIcon = ({ path }: { path: string }) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false">
    <path d={path} />
  </svg>
);
const PATH_PLAY = 'M6 4.5v15a1 1 0 0 0 1.53.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 6 4.5z';
const PATH_PAUSE = 'M7 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm7 0h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z';
const PATH_MIC =
  'M12 2a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4zm-7 9a1 1 0 0 1 2 0 5 5 0 0 0 10 0 1 1 0 0 1 2 0 7 7 0 0 1-6 6.92V21a1 1 0 0 1-2 0v-3.08A7 7 0 0 1 5 11z';
const PATH_ALERT =
  'M12 2.5c.7 0 1.4.4 1.8 1l8.1 14a2.1 2.1 0 0 1-1.8 3.1H3.9a2.1 2.1 0 0 1-1.8-3.1l8.1-14c.4-.6 1.1-1 1.8-1zM12 8a1 1 0 0 0-1 1v4a1 1 0 0 0 2 0V9a1 1 0 0 0-1-1zm0 8a1.2 1.2 0 1 0 0 2.4A1.2 1.2 0 0 0 12 16z';

const WAVE_BARS = 40;
const PLAYBACK_RATES = [1, 1.5, 2];

// Forma de onda determinística usada enquanto o áudio real ainda não foi analisado (ou se a análise falhar).
const fallbackPeaks = (seed: string) => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return Array.from({ length: WAVE_BARS }, () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return 0.25 + ((h >>> 0) % 1000) / 1000 * 0.75;
  });
};

const WaAudioPlayer = ({ src, avatarLabel }: { src: string; avatarLabel: string }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [rate, setRate] = useState(1);
  const [peaks, setPeaks] = useState<number[]>(() => fallbackPeaks(src));

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onLoaded = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onEnd = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('durationchange', onLoaded);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('durationchange', onLoaded);
      audio.removeEventListener('ended', onEnd);
    };
  }, []);

  // Lê o áudio uma vez para desenhar a forma de onda real; em caso de erro mantém a forma padrão.
  useEffect(() => {
    let cancelled = false;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return undefined;
    void (async () => {
      const ctx = new AudioCtx();
      try {
        const res = await fetch(src);
        const decoded = await ctx.decodeAudioData(await res.arrayBuffer());
        if (cancelled) return;
        const data = decoded.getChannelData(0);
        const size = Math.max(1, Math.floor(data.length / WAVE_BARS));
        const raw = Array.from({ length: WAVE_BARS }, (_, b) => {
          let sum = 0;
          for (let i = b * size; i < Math.min(data.length, (b + 1) * size); i += 1) sum += Math.abs(data[i]);
          return sum / size;
        });
        const max = Math.max(...raw, 0.0001);
        setPeaks(raw.map((v) => 0.18 + (v / max) * 0.82));
        if (Number.isFinite(decoded.duration)) setDuration((d) => d || decoded.duration);
      } catch {
        /* mantém forma de onda padrão */
      } finally {
        void ctx.close();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.playbackRate = rate;
      void audio.play();
      setPlaying(true);
    }
  };

  const cycleRate = () => {
    const next = PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(rate) + 1) % PLAYBACK_RATES.length];
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const handleSeek = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    const value = Number(ev.target.value);
    if (audio) audio.currentTime = value;
    setCurrentTime(value);
  };

  const ratio = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const timeLabel = playing || currentTime > 0 ? formatAudioTime(currentTime) : formatAudioTime(duration);

  return (
    <div className="wa-audio-player">
      <audio ref={audioRef} src={src} preload="metadata" />
      {playing ? (
        <button type="button" className="wa-audio-avatar wa-audio-rate" onClick={cycleRate} aria-label="Velocidade de reprodução">
          {rate}x
        </button>
      ) : (
        <div className="wa-audio-avatar" aria-hidden="true">
          {avatarLabel}
          <span className="wa-audio-mic">
            <SolidIcon path={PATH_MIC} />
          </span>
        </div>
      )}
      <button
        type="button"
        className="wa-audio-play"
        onClick={togglePlay}
        aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}
      >
        <SolidIcon path={playing ? PATH_PAUSE : PATH_PLAY} />
      </button>
      <div className="wa-audio-body">
        <div className="wa-audio-wave">
          {peaks.map((p, i) => (
            <span
              key={i}
              className={i / WAVE_BARS < ratio ? 'played' : undefined}
              style={{ height: `${Math.round(p * 100)}%` }}
            />
          ))}
          <span className="wa-audio-knob" style={{ left: `${ratio * 100}%` }} />
          <input
            type="range"
            className="wa-audio-seek"
            min={0}
            max={duration || 0}
            step={0.01}
            value={currentTime}
            onChange={handleSeek}
            aria-label="Progresso do áudio"
          />
        </div>
        <span className="wa-audio-time">{timeLabel}</span>
      </div>
    </div>
  );
};

const MessageContent = ({ message, avatarLabel }: { message: WaMessage; avatarLabel: string }) => {
  const media = message.media;
  if (!media) return <p>{message.text}</p>;

  if (media.kind === 'image' && media.url) {
    return (
      <div className="wa-media-block">
        <a href={media.url} target="_blank" rel="noreferrer">
          <img src={media.url} alt={media.name || 'Imagem'} className="wa-media-image" />
        </a>
        {media.caption ? <p>{media.caption}</p> : null}
      </div>
    );
  }

  if (media.kind === 'video' && media.url) {
    return (
      <div className="wa-media-block">
        <video controls src={media.url} className="wa-media-video" preload="metadata" />
        {media.caption ? <p>{media.caption}</p> : null}
      </div>
    );
  }

  if (media.kind === 'audio' && media.url) {
    return (
      <div className="wa-media-block">
        <WaAudioPlayer src={media.url} avatarLabel={avatarLabel} />
        {media.caption ? <p>{media.caption}</p> : null}
      </div>
    );
  }

  return (
    <div className="wa-media-block">
      {media.url ? (
        <a href={media.url} target="_blank" rel="noreferrer" className="wa-media-doc" download={media.name}>
          <i className="ti ti-file" aria-hidden="true" />
          <span>{media.name || message.text}</span>
        </a>
      ) : (
        <div className="wa-media-doc wa-media-doc--static">
          <i className="ti ti-file" aria-hidden="true" />
          <span>{media.name || message.text}</span>
        </div>
      )}
      {media.caption ? <p>{media.caption}</p> : null}
    </div>
  );
};

const MessageChecks = ({ status, errorMessage }: { status?: WaMsgStatus; errorMessage?: string }) => {
  if (!status) return null;
  if (status === 'failed') {
    return (
      <span
        className="wa-msg-checks wa-msg-checks--failed"
        title={errorMessage || 'Falha ao enviar'}
        aria-label={`Falha ao enviar: ${errorMessage || 'motivo não informado'}`}
      >
        <SolidIcon path={PATH_ALERT} />
        Não entregue
      </span>
    );
  }
  const isRead = status === 'read';
  const isDelivered = status === 'delivered' || isRead;
  return (
    <span className={`wa-msg-checks${isRead ? ' read' : ''}`} aria-label={isRead ? 'Lida' : isDelivered ? 'Entregue' : 'Enviada'}>
      <i className="ti ti-check" aria-hidden="true" />
      {isDelivered ? <i className="ti ti-check check-2" aria-hidden="true" /> : null}
    </span>
  );
};

const WhatsApp = () => {
  const { contacts, getCompanyName, setWhatsappUnread } = useCrmData();
  const { user: authUser } = useAuth();
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [conversations, setConversations] = useState<WaConversation[]>([]);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesLoadedFor, setMessagesLoadedFor] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [waStatus, setWaStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [listTab, setListTab] = useState<'aguardando' | 'andamento' | 'finalizados'>('aguardando');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [error, setError] = useState('');
  const [sendError, setSendError] = useState('');
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [newAttendanceOpen, setNewAttendanceOpen] = useState(false);
  const [bulkMessagingOpen, setBulkMessagingOpen] = useState(false);
  const [newPhoneDial, setNewPhoneDial] = useState(DEFAULT_DIAL_COUNTRY);
  const [newPhoneNational, setNewPhoneNational] = useState('');
  const [newContactId, setNewContactId] = useState<string | null>(null);
  const [newContactName, setNewContactName] = useState('');
  const [newTemplateId, setNewTemplateId] = useState('');
  const [approvedTemplates, setApprovedTemplates] = useState<MetaApprovedTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [startingAttendance, setStartingAttendance] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [pendingIndex, setPendingIndex] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const dragDepthRef = useRef(0);
  const pendingRef = useRef<PendingAttachment[]>([]);
  const [recordPaused, setRecordPaused] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordLevels, setRecordLevels] = useState<number[]>(() => Array(RECORD_BARS).fill(0));
  const recordCancelledRef = useRef(false);
  const recordPausedRef = useRef(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recordAudioCtxRef = useRef<AudioContext | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevActiveIdRef = useRef<string | null>(null);
  const scrolledForChatRef = useRef<string | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  const scrollOnNextMessagesRef = useRef(false);

  const loadApprovedTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const data = await api.get<{ groups: { approved: MetaApprovedTemplate[] } }>('/whatsapp/templates');
      const approved = data.groups?.approved ?? [];
      setApprovedTemplates(approved);
      if (approved.length > 0) {
        setNewTemplateId((current) =>
          approved.some((t) => templateKey(t) === current) ? current : templateKey(approved[0])
        );
      } else {
        setNewTemplateId('');
      }
    } catch {
      setApprovedTemplates([]);
      setNewTemplateId('');
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    if (newAttendanceOpen && waStatus === 'connected') {
      void loadApprovedTemplates();
    }
  }, [newAttendanceOpen, waStatus, loadApprovedTemplates]);

  const loadChats = useCallback(async () => {
    try {
      const data = await api.get<{
        configured: boolean;
        status: typeof waStatus;
        chats: WaConversation[];
      }>('/whatsapp/chats');
      setConfigured(data.configured);
      setWaStatus(data.status || 'disconnected');
      setConversations(data.chats || []);
      setError('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar conversas');
    }
  }, []);

  const loadMessages = useCallback(async (chatId: string, { showLoading = false } = {}) => {
    if (showLoading) setMessagesLoading(true);
    try {
      const data = await api.get<{ messages: WaMessage[] }>(`/whatsapp/chats/${chatId}/messages`);
      if (activeChatIdRef.current !== chatId) return;
      setMessages(data.messages || []);
      setMessagesLoadedFor(chatId);
    } catch {
      if (activeChatIdRef.current !== chatId) return;
      if (showLoading) {
        setMessages([]);
        setMessagesLoadedFor(null);
      }
    } finally {
      if (showLoading && activeChatIdRef.current === chatId) setMessagesLoading(false);
    }
  }, []);

  const loadTeamMembers = useCallback(async () => {
    try {
      const data = await api.get<TeamMember[]>('/whatsapp/team-members');
      setTeamMembers(Array.isArray(data) ? data : []);
    } catch {
      setTeamMembers([]);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await Promise.all([loadChats(), loadTeamMembers()]);
      setLoading(false);
    })();
  }, [loadChats, loadTeamMembers]);

  useEffect(() => {
    if (waStatus !== 'connected') return undefined;
    const id = window.setInterval(() => void loadChats(), 12000);
    return () => window.clearInterval(id);
  }, [waStatus, loadChats]);

  useEffect(() => {
    activeChatIdRef.current = activeId;
    setSendError('');

    if (!activeId) {
      setMessages([]);
      setMessagesLoadedFor(null);
      setMessagesLoading(false);
      return undefined;
    }

    setMessages([]);
    setMessagesLoadedFor(null);
    void loadMessages(activeId, { showLoading: true });
    const id = window.setInterval(() => void loadMessages(activeId), 8000);
    return () => window.clearInterval(id);
  }, [activeId, loadMessages]);

  const [windowTick, setWindowTick] = useState(0);
  useEffect(() => {
    if (!activeId) return undefined;
    const id = window.setInterval(() => setWindowTick((t) => t + 1), 30000);
    return () => window.clearInterval(id);
  }, [activeId]);

  const scrollMessagesToBottom = useCallback((smooth: boolean) => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  useEffect(() => {
    const switchedChat = prevActiveIdRef.current !== activeId;
    prevActiveIdRef.current = activeId;

    if (switchedChat) {
      scrollOnNextMessagesRef.current = false;
      return;
    }

    if (scrollOnNextMessagesRef.current) {
      scrollMessagesToBottom(true);
      scrollOnNextMessagesRef.current = false;
    }
  }, [messages, activeId, scrollMessagesToBottom]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.nome.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.lastMessage.toLowerCase().includes(q)
    );
  }, [conversations, query]);

  const openConversations = useMemo(() => filtered.filter((c) => c.attendanceStatus !== 'closed'), [filtered]);
  const closedChats = useMemo(() => filtered.filter((c) => c.attendanceStatus === 'closed'), [filtered]);
  const waitingChats = useMemo(() => openConversations.filter((c) => !c.assignedTo), [openConversations]);
  const ongoingChats = useMemo(() => openConversations.filter((c) => Boolean(c.assignedTo)), [openConversations]);
  const tabChats = listTab === 'aguardando' ? waitingChats : listTab === 'andamento' ? ongoingChats : closedChats;

  const active = useMemo(
    () => filtered.find((c) => c.id === activeId) ?? tabChats[0] ?? null,
    [activeId, filtered, tabChats]
  );

  const chatTimeline = useMemo(() => buildChatTimeline(messages), [messages]);
  const messagingWindow = useMemo(() => {
    void windowTick;
    return computeMessagingWindow(messages);
  }, [messages, windowTick]);
  const isClosed = active?.attendanceStatus === 'closed';
  const messagesReady = Boolean(active?.id) && messagesLoadedFor === active.id && !messagesLoading;
  const outsideWindow =
    messagesReady && !isClosed && waStatus === 'connected' && !messagingWindow.withinWindow;

  // Ao abrir uma conversa (ou trocar de conversa), sempre pula direto para a
  // mensagem mais recente — só uma vez por conversa, sem animação de rolagem.
  useEffect(() => {
    if (!messagesReady || !active) return;
    if (scrolledForChatRef.current === active.id) return;
    scrolledForChatRef.current = active.id;
    scrollMessagesToBottom(false);
  }, [messagesReady, active, scrollMessagesToBottom]);

  useEffect(() => {
    // No mobile a lista aparece primeiro; o usuário toca para abrir a conversa.
    // No desktop (2 painéis) mantemos a primeira conversa selecionada por padrão.
    const isMobile =
      typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) return;
    if (!activeId && tabChats[0]) setActiveId(tabChats[0].id);
  }, [tabChats, activeId]);

  const totalUnread = useMemo(() => conversations.reduce((n, c) => n + c.unread, 0), [conversations]);

  useEffect(() => {
    setWhatsappUnread(totalUnread);
  }, [totalUnread, setWhatsappUnread]);

  const selectConversation = (id: string) => {
    setActiveId(id);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
  };

  const sendMediaFile = async (file: File, opts?: { caption?: string }): Promise<boolean> => {
    if (!active || isClosed || sending) return false;
    setSendError('');
    // O Blob e a API da Meta não aceitam parâmetros de codec (ex.: "audio/webm;codecs=opus").
    const mimeType = (file.type || 'application/octet-stream').split(';')[0].trim();
    const limit = MEDIA_BYTES_LIMITS[mediaKindFromMime(mimeType)];
    if (file.size > limit) {
      setSendError(`Arquivo muito grande. O limite é ${Math.floor(limit / 1024 / 1024)} MB.`);
      return false;
    }
    setSending(true);
    setAttachOpen(false);
    try {
      const caption = opts?.caption !== undefined ? opts.caption.trim() : draft.trim();
      const safeName = (file.name || 'arquivo').replace(/[^\w.\-()+]/g, '_');
      const pathname = `wa/out/${Date.now()}-${safeName}`;
      const tokenResponse = await api.post<{ type: string; clientToken: string }>(
        '/whatsapp/blob-upload-token',
        {
          type: 'blob.generate-client-token',
          payload: {
            pathname,
            callbackUrl: `${window.location.origin}/api/whatsapp/blob-upload-token`,
            clientPayload: null,
            multipart: false,
          },
        }
      );
      const blob = await put(pathname, file, {
        access: 'public',
        token: tokenResponse.clientToken,
        contentType: mimeType,
      });
      const data = await api.post<{ messages: WaMessage[] }>(`/whatsapp/chats/${active.id}/media`, {
        blobUrl: blob.url,
        mimeType,
        filename: file.name || 'arquivo',
        caption,
      });
      scrollOnNextMessagesRef.current = true;
      setMessages(data.messages || []);
      if (opts?.caption === undefined) setDraft('');
      await loadChats();
      return true;
    } catch (err: unknown) {
      setSendError(err instanceof Error ? err.message : 'Não foi possível enviar o arquivo.');
      return false;
    } finally {
      setSending(false);
    }
  };

  const canAttach = Boolean(active) && !isClosed && messagesReady && !recording;

  const clearPending = () => {
    pendingRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    pendingRef.current = [];
    setPending([]);
    setPendingIndex(0);
  };

  const addPendingFiles = (files: File[]) => {
    if (!canAttach || files.length === 0) return;
    const accepted: PendingAttachment[] = [];
    const errors: string[] = [];
    files.forEach((file) => {
      const mime = (file.type || 'application/octet-stream').split(';')[0].trim();
      const limit = MEDIA_BYTES_LIMITS[mediaKindFromMime(mime)];
      if (file.size > limit) {
        errors.push(`${file.name}: acima do limite de ${Math.floor(limit / 1024 / 1024)} MB`);
        return;
      }
      accepted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        url: URL.createObjectURL(file),
        caption: '',
      });
    });
    setSendError(errors.join(' · '));
    if (accepted.length === 0) return;
    // Texto já digitado no campo vira a legenda do primeiro anexo (como no WhatsApp Web).
    if (pendingRef.current.length === 0 && draft.trim()) {
      accepted[0].caption = draft.trim();
      setDraft('');
    }
    const next = [...pendingRef.current, ...accepted];
    if (pendingRef.current.length === 0) setPendingIndex(0);
    else setPendingIndex(pendingRef.current.length);
    pendingRef.current = next;
    setPending(next);
    setAttachOpen(false);
  };

  const removePending = (id: string) => {
    const target = pendingRef.current.find((p) => p.id === id);
    if (target) URL.revokeObjectURL(target.url);
    const next = pendingRef.current.filter((p) => p.id !== id);
    pendingRef.current = next;
    setPending(next);
    setPendingIndex((i) => Math.max(0, Math.min(i, next.length - 1)));
  };

  const sendPending = async () => {
    if (sending) return;
    let remaining = [...pendingRef.current];
    for (const item of pendingRef.current) {
      const ok = await sendMediaFile(item.file, { caption: item.caption });
      if (!ok) {
        pendingRef.current = remaining;
        setPending(remaining);
        setPendingIndex(0);
        return;
      }
      URL.revokeObjectURL(item.url);
      remaining = remaining.filter((p) => p.id !== item.id);
      pendingRef.current = remaining;
      setPending(remaining);
    }
    clearPending();
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    addPendingFiles(files);
  };

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

  const onChatDragEnter = (e: React.DragEvent) => {
    if (!canAttach || !hasFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setDragActive(true);
  };

  const onChatDragOver = (e: React.DragEvent) => {
    if (!canAttach || !hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const onChatDragLeave = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  };

  const onChatDrop = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setDragActive(false);
    addPendingFiles(Array.from(e.dataTransfer.files));
  };

  const onComposerPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length === 0) return;
    e.preventDefault();
    addPendingFiles(files);
  };

  useEffect(() => {
    clearPending();
    dragDepthRef.current = 0;
    setDragActive(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  useEffect(
    () => () => {
      pendingRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    },
    []
  );

  const startRecording = async () => {
    if (!active || isClosed || sending || recording) return;
    setSendError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;
      recordCancelledRef.current = false;
      recordPausedRef.current = false;
      setRecordPaused(false);
      setRecordSeconds(0);
      setRecordLevels(Array(RECORD_BARS).fill(0));
      try {
        const ctx = new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        ctx.createMediaStreamSource(stream).connect(analyser);
        recordAudioCtxRef.current = ctx;
        analyserRef.current = analyser;
      } catch {
        analyserRef.current = null;
      }
      // Só ogg/opus (Firefox) é enviado como gravado. Qualquer outro formato (WebM do Chrome/Edge, MP4
      // fragmentado) é convertido para MP3, que a Meta entrega de forma confiável.
      const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        recordStreamRef.current = null;
        analyserRef.current = null;
        void recordAudioCtxRef.current?.close();
        recordAudioCtxRef.current = null;
        if (recordCancelledRef.current) {
          audioChunksRef.current = [];
          return;
        }
        const recordedType = recorder.mimeType || mimeType;
        const blob = new Blob(audioChunksRef.current, { type: recordedType });
        void (async () => {
          try {
            if (recordedType.includes('ogg')) {
              await sendMediaFile(new File([blob], `audio-${Date.now()}.ogg`, { type: 'audio/ogg' }));
              return;
            }
            const mp3 = await convertAudioBlobToMp3(blob);
            await sendMediaFile(new File([mp3], `audio-${Date.now()}.mp3`, { type: 'audio/mpeg' }));
          } catch {
            setSendError('Não foi possível processar o áudio gravado.');
          }
        })();
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setSendError('Não foi possível acessar o microfone. Verifique as permissões do navegador.');
    }
  };

  const stopRecording = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
    setRecordPaused(false);
  };

  const cancelRecording = () => {
    recordCancelledRef.current = true;
    stopRecording();
  };

  const togglePauseRecording = () => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    if (rec.state === 'recording') {
      rec.pause();
      recordPausedRef.current = true;
      setRecordPaused(true);
    } else if (rec.state === 'paused') {
      rec.resume();
      recordPausedRef.current = false;
      setRecordPaused(false);
    }
  };

  useEffect(() => {
    if (!recording) return undefined;
    const data = new Uint8Array(128);
    const id = window.setInterval(() => {
      if (recordPausedRef.current) return;
      setRecordSeconds((s) => s + 0.1);
      const analyser = analyserRef.current;
      let level = 0;
      if (analyser) {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i += 1) peak = Math.max(peak, Math.abs(data[i] - 128));
        level = Math.min(1, (peak / 128) * 2.2);
      }
      setRecordLevels((prev) => [...prev.slice(1), level]);
    }, 100);
    return () => window.clearInterval(id);
  }, [recording]);

  useEffect(() => {
    if (!attachOpen) return undefined;
    const onDocClick = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setAttachOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [attachOpen]);

  useEffect(() => {
    return () => {
      recordCancelledRef.current = true;
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== 'inactive') rec.stop();
      recordStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !active || isClosed) return;
    setSending(true);
    setSendError('');
    try {
      const data = await api.post<{ messages: WaMessage[] }>(`/whatsapp/chats/${active.id}/messages`, { text });
      scrollOnNextMessagesRef.current = true;
      setMessages(data.messages || []);
      setDraft('');
      await loadChats();
    } catch (err: unknown) {
      setSendError(err instanceof Error ? err.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  };

  const finishAttendance = async () => {
    if (!active || isClosed) return;
    const closedId = active.id;

    setConversations((prev) =>
      prev.map((c) => (c.id === closedId ? { ...c, attendanceStatus: 'closed' } : c))
    );
    setListTab('finalizados');

    setFinishing(true);
    try {
      await api.post(`/whatsapp/chats/${closedId}/attendance`, { status: 'closed' });
    } catch (err: unknown) {
      await loadChats();
      alert(err instanceof Error ? err.message : 'Não foi possível finalizar o atendimento');
    } finally {
      setFinishing(false);
    }
  };

  const transferChat = async (targetUserId: number | null) => {
    if (!active) return;
    const chatId = active.id;
    setTransferring(true);
    try {
      await api.put(`/whatsapp/chats/${chatId}/assign`, { userId: targetUserId });
      setTransferOpen(false);
      setListTab(targetUserId ? 'andamento' : 'aguardando');
      await loadChats();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Não foi possível transferir a conversa');
    } finally {
      setTransferring(false);
    }
  };

  const claimChat = async (chatId: string) => {
    if (!authUser?.id) return;
    setClaimingId(chatId);
    try {
      await api.put(`/whatsapp/chats/${chatId}/assign`, { userId: Number(authUser.id), claim: true });
      setListTab('andamento');
      await loadChats();
      selectConversation(chatId);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Não foi possível assumir a conversa');
      await loadChats();
    } finally {
      setClaimingId(null);
    }
  };

  const contactCompany = active?.contatoId
    ? getCompanyName(contacts.find((c) => c.id === active.contatoId)?.empresaId)
    : null;

  const pickerContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    const sorted = [...contacts].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    if (!q) return sorted;
    return sorted.filter(
      (c) =>
        c.nome.toLowerCase().includes(q) ||
        c.telefone.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
    );
  }, [contacts, contactSearch]);

  const selectedTemplate = useMemo(
    () => approvedTemplates.find((t) => templateKey(t) === newTemplateId) ?? approvedTemplates[0],
    [approvedTemplates, newTemplateId]
  );

  const resetNewAttendanceForm = () => {
    setNewPhoneDial(DEFAULT_DIAL_COUNTRY);
    setNewPhoneNational('');
    setNewContactId(null);
    setNewContactName('');
    setNewTemplateId(approvedTemplates[0] ? templateKey(approvedTemplates[0]) : '');
  };

  const openNewAttendanceFromContact = (contact: Contact) => {
    const phone = contact.telefone?.replace(/\D/g, '') || '';
    if (phone.length < 10) {
      alert('Este contato não possui telefone válido para WhatsApp.');
      return;
    }
    setNewPhoneDial(DEFAULT_DIAL_COUNTRY);
    setNewPhoneNational(nationalDigitsFromContactPhone(contact.telefone || ''));
    setNewContactId(contact.id);
    setNewContactName(contact.nome);
    setContactPickerOpen(false);
    setContactSearch('');
    setNewAttendanceOpen(true);
  };

  const startNewAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = buildFullPhone(newPhoneDial, newPhoneNational);
    if (phone.length < 10) {
      alert('Informe um telefone válido com DDD + número.');
      return;
    }
    if (!selectedTemplate) {
      alert('Selecione um modelo aprovado pela Meta.');
      return;
    }

    setStartingAttendance(true);
    try {
      const data = await api.post<{ chat: WaConversation; messages: WaMessage[] }>('/whatsapp/chats', {
        phone,
        contactId: newContactId || undefined,
        name: newContactName || undefined,
        templateName: selectedTemplate.name,
        templateLanguage: selectedTemplate.language,
        templateBody: selectedTemplate.body,
      });
      await loadChats();
      setActiveId(data.chat.id);
      setMessages(data.messages || []);
      scrollOnNextMessagesRef.current = true;
      setNewAttendanceOpen(false);
      resetNewAttendanceForm();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Não foi possível iniciar o atendimento');
    } finally {
      setStartingAttendance(false);
    }
  };

  return (
    <CrmLayout>
      <div className="crm-page-header">
        <div>
          <div className="crm-page-title">
            WhatsApp <span>({totalUnread} não lidas)</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--vesk-muted)', marginTop: 2 }}>
            {loading ? (
              'Carregando…'
            ) : waStatus === 'connected' ? (
              'Conectado à API oficial Meta'
            ) : (
              <>
                Não conectado — configure em{' '}
                <Link to="/admin/integracoes?tab=whatsapp" style={{ color: 'var(--vesk-orange)' }}>
                  Integrações
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="crm-page-actions">
          <div className="crm-inline-search" role="search">
            <i className="ti ti-search si" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar conversa…"
              aria-label="Buscar conversas"
              disabled={!configured || waStatus !== 'connected'}
            />
          </div>
          {waStatus === 'connected' ? (
            <button type="button" className="crm-btn-secondary" onClick={() => void loadChats()}>
              <i className="ti ti-refresh" aria-hidden="true" />
              Atualizar
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="integration-hint" style={{ marginBottom: 12, borderColor: '#e0525240', color: '#e05252' }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="wa-layout inbox wa-loading-shell" aria-busy="true" aria-label="Carregando WhatsApp">
          <div className="crm-card wa-list-skeleton" />
          <div className="crm-card wa-chat-skeleton" />
        </div>
      ) : !configured || waStatus !== 'connected' ? (
        <div className="crm-card" style={{ padding: 24, textAlign: 'center' }}>
          <i className="ti ti-brand-whatsapp" style={{ fontSize: 40, color: '#25d36655' }} aria-hidden="true" />
          <p style={{ color: 'var(--vesk-muted)', fontSize: 13, marginTop: 12 }}>
            Conecte o WhatsApp em Integrações (API oficial Meta) para ver e enviar mensagens.
          </p>
          <Link to="/admin/integracoes?tab=whatsapp" className="crm-btn-primary" style={{ display: 'inline-flex', marginTop: 12 }}>
            Ir para Integrações
          </Link>
        </div>
      ) : (
        <div className={`wa-layout inbox${activeId ? ' has-active' : ''}`} aria-label="Chat WhatsApp">
          <div className="wa-list crm-card inbox-list" aria-label="Lista de conversas">
            <div className="crm-card-header wa-list-header" style={{ marginBottom: 10 }}>
              <i className="ti ti-brand-whatsapp" style={{ color: '#25d366', fontSize: 18 }} aria-hidden="true" />
              <div className="crm-card-title">Conversas</div>
              <span className="pipeline-badge">{filtered.length} chats</span>
              <div className="wa-list-header-actions">
                <button
                  type="button"
                  className="crm-icon-btn wa-list-icon-btn"
                  title="Listagem de contatos"
                  aria-label="Abrir listagem de contatos"
                  onClick={() => {
                    setContactSearch('');
                    setContactPickerOpen(true);
                  }}
                >
                  <i className="ti ti-address-book" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="crm-icon-btn wa-list-icon-btn"
                  title="Disparos em massa"
                  aria-label="Disparos em massa"
                  onClick={() => setBulkMessagingOpen(true)}
                >
                  <i className="ti ti-broadcast" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="crm-icon-btn wa-list-icon-btn wa-list-icon-btn--primary"
                  title="Iniciar novo atendimento"
                  aria-label="Iniciar novo atendimento"
                  onClick={() => {
                    resetNewAttendanceForm();
                    setNewAttendanceOpen(true);
                  }}
                >
                  <i className="ti ti-message-plus" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="crm-tabs wa-list-tabs" aria-label="Fila de atendimento">
              <button
                type="button"
                className={`crm-tab${listTab === 'aguardando' ? ' active' : ''}`}
                onClick={() => setListTab('aguardando')}
              >
                Aguardando
                {waitingChats.length > 0 ? <span className="pipeline-badge">{waitingChats.length}</span> : null}
              </button>
              <button
                type="button"
                className={`crm-tab${listTab === 'andamento' ? ' active' : ''}`}
                onClick={() => setListTab('andamento')}
              >
                Em andamento
                {ongoingChats.length > 0 ? <span className="pipeline-badge">{ongoingChats.length}</span> : null}
              </button>
              <button
                type="button"
                className={`crm-tab${listTab === 'finalizados' ? ' active' : ''}`}
                onClick={() => setListTab('finalizados')}
              >
                Finalizados
                {closedChats.length > 0 ? <span className="pipeline-badge">{closedChats.length}</span> : null}
              </button>
            </div>

            {loading ? <div className="kanban-empty">Carregando…</div> : null}

            <div className="inbox-items" role="list">
              {tabChats.map((c) => (
                <div
                  key={c.id}
                  className={`inbox-item wa-conv-item${active?.id === c.id ? ' active' : ''}${c.unread > 0 ? ' unread' : ''}`}
                  onClick={() => selectConversation(c.id)}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      selectConversation(c.id);
                    }
                  }}
                  role="listitem"
                  tabIndex={0}
                >
                  <div className="wa-conv-row">
                    <div className="wa-avatar">{initials(c.nome)}</div>
                    <div className="wa-conv-body">
                      <div className="inbox-row">
                        <div className="inbox-from">{c.nome}</div>
                        <div className="wa-conv-row-right">
                          <div className="inbox-when">{c.when}</div>
                          {listTab !== 'aguardando' && c.assignedTo && c.assignedTo !== String(authUser?.id) ? (
                            <span className="wa-assignee-tag">{c.assignedToName || 'Outro usuário'}</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="wa-conv-preview">
                        <span className="inbox-preview">{c.lastMessage}</span>
                        {c.unread > 0 ? <span className="wa-unread">{c.unread}</span> : null}
                      </div>
                      {listTab === 'aguardando' ? (
                        <button
                          type="button"
                          className="wa-claim-btn"
                          disabled={claimingId === c.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void claimChat(c.id);
                          }}
                        >
                          <i className="ti ti-user-check" aria-hidden="true" />
                          {claimingId === c.id ? 'Assumindo…' : 'Assumir conversa'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
              {!loading && tabChats.length === 0 ? (
                <div className="kanban-empty">
                  {listTab === 'aguardando'
                    ? 'Nenhuma conversa aguardando atendimento.'
                    : listTab === 'andamento'
                      ? 'Nenhuma conversa em andamento.'
                      : 'Nenhuma conversa finalizada ainda.'}
                </div>
              ) : null}
            </div>
          </div>

          <div
            className="wa-chat crm-card inbox-view"
            aria-label="Mensagens da conversa"
            onDragEnter={onChatDragEnter}
            onDragOver={onChatDragOver}
            onDragLeave={onChatDragLeave}
            onDrop={onChatDrop}
          >
            {dragActive ? (
              <div className="wa-drop-overlay" aria-hidden="true">
                <div className="wa-drop-overlay-box">
                  <i className="ti ti-cloud-upload" />
                  <span>Arraste arquivo aqui</span>
                </div>
              </div>
            ) : null}
            {pending.length > 0 ? (
              <WaAttachPreview
                items={pending}
                activeIndex={pendingIndex}
                sending={sending}
                error={sendError}
                onSelect={setPendingIndex}
                onCaptionChange={(id, caption) => {
                  const next = pendingRef.current.map((p) => (p.id === id ? { ...p, caption } : p));
                  pendingRef.current = next;
                  setPending(next);
                }}
                onRemove={removePending}
                onAddFiles={addPendingFiles}
                onClose={clearPending}
                onSend={() => void sendPending()}
                onDismissError={() => setSendError('')}
              />
            ) : null}
            {active ? (
              <>
                <div className="wa-chat-head">
                  <button
                    type="button"
                    className="wa-chat-back"
                    aria-label="Voltar para conversas"
                    onClick={() => setActiveId(null)}
                  >
                    <i className="ti ti-arrow-left" aria-hidden="true" />
                  </button>
                  <div className="wa-avatar lg">{initials(active.nome)}</div>
                  <div className="wa-chat-head-info">
                    <div className="wa-chat-name">
                      {active.nome}
                      {isClosed ? <span className="wa-attendance-badge">Finalizado</span> : null}
                    </div>
                    <div className="wa-chat-phone">{active.phone}</div>
                    {contactCompany && contactCompany !== '—' ? (
                      <div className="wa-chat-meta">
                        <i className="ti ti-building" aria-hidden="true" />
                        {contactCompany}
                      </div>
                    ) : null}
                    <div className="wa-chat-meta">
                      <i className="ti ti-user-circle" aria-hidden="true" />
                      {active.assignedTo
                        ? active.assignedTo === String(authUser?.id)
                          ? 'Atribuído a você'
                          : `Atribuído a ${active.assignedToName || 'outro usuário'}`
                        : 'Sem responsável — visível para toda a equipe'}
                    </div>
                  </div>
                  <div className="wa-chat-head-actions">
                    <button
                      type="button"
                      className="crm-btn-secondary"
                      onClick={() => setTransferOpen(true)}
                      disabled={isClosed || teamMembers.length === 0}
                    >
                      <i className="ti ti-arrow-forward-up" aria-hidden="true" />
                      Transferir conversa
                    </button>
                    <button
                      type="button"
                      className="crm-btn-secondary wa-finish-btn"
                      onClick={() => void finishAttendance()}
                      disabled={finishing || isClosed}
                    >
                      <i className="ti ti-circle-check" aria-hidden="true" />
                      {finishing ? 'Salvando…' : 'Finalizar atendimento'}
                    </button>
                    {active.contatoId ? (
                      <Link to="/admin/contatos" className="crm-btn-secondary" style={{ padding: '6px 10px', fontSize: 11 }}>
                        Ver contato
                      </Link>
                    ) : null}
                  </div>
                </div>

                <div className="wa-messages" ref={messagesContainerRef} role="log" aria-live="polite">
                  {chatTimeline.map((item) =>
                    item.type === 'day' ? (
                      <div key={item.key} className="wa-day-separator" role="separator">
                        <span>{item.label}</span>
                      </div>
                    ) : (
                      <div key={item.key} className={`wa-bubble-wrap${item.message.fromMe ? ' out' : ' in'}`}>
                        <div
                          className={`wa-bubble${item.message.fromMe ? ' out' : ' in'}${
                            item.message.status === 'failed' ? ' wa-bubble--failed' : ''
                          }`}
                        >
                          <MessageContent
                            message={item.message}
                            avatarLabel={initials(item.message.fromMe ? authUser?.name || 'Eu' : active.nome)}
                          />
                          <div className="wa-bubble-meta">
                            <time dateTime={item.message.messageAt}>{formatMessageTime(item.message.messageAt)}</time>
                            {item.message.fromMe ? (
                              <MessageChecks status={item.message.status} errorMessage={item.message.errorMessage} />
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {isClosed ? (
                  <div className="wa-closed-banner">
                    <i className="ti ti-circle-check" aria-hidden="true" />
                    Atendimento finalizado.
                  </div>
                ) : !messagesReady ? (
                  <div className="wa-compose-pending">
                    <i className="ti ti-loader-2 wa-spin" aria-hidden="true" />
                    Carregando conversa…
                  </div>
                ) : (
                  <>
                    {outsideWindow ? (
                      <div className="wa-window-banner wa-window-banner--hint">
                        <i className="ti ti-clock-exclamation" aria-hidden="true" />
                        <div>
                          <strong>Fora da janela de 24 horas</strong>
                          <p>
                            Passaram mais de 24 horas desde a última mensagem do cliente. Mensagens de texto livre
                            podem ser recusadas pela Meta — se isso acontecer, finalize o atendimento e reinicie
                            com um modelo aprovado.
                          </p>
                        </div>
                      </div>
                    ) : null}
                    {sendError ? (
                      <div className="wa-send-error" role="alert">
                        <i className="ti ti-alert-circle" aria-hidden="true" />
                        <span>{sendError}</span>
                        <button
                          type="button"
                          className="wa-send-error-close"
                          aria-label="Fechar aviso de erro"
                          onClick={() => setSendError('')}
                        >
                          <i className="ti ti-x" aria-hidden="true" />
                        </button>
                      </div>
                    ) : null}
                    <form className="wa-compose" onSubmit={(e) => void sendMessage(e)}>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      hidden
                      onChange={onFileSelected}
                    />
                    <input
                      ref={videoInputRef}
                      type="file"
                      accept="video/*"
                      multiple
                      hidden
                      onChange={onFileSelected}
                    />
                    <input
                      ref={documentInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,application/*"
                      multiple
                      hidden
                      onChange={onFileSelected}
                    />
                    {recording ? (
                      <div className="wa-recorder" role="group" aria-label="Gravando áudio">
                        <button
                          type="button"
                          className="wa-recorder-icon"
                          title="Descartar gravação"
                          aria-label="Descartar gravação"
                          onClick={cancelRecording}
                        >
                          <i className="ti ti-trash" aria-hidden="true" />
                        </button>
                        <span className={`wa-recorder-dot${recordPaused ? ' paused' : ''}`} aria-hidden="true" />
                        <span className="wa-recorder-time">{formatAudioTime(recordSeconds)}</span>
                        <div className={`wa-recorder-wave${recordPaused ? ' paused' : ''}`} aria-hidden="true">
                          {recordLevels.map((lv, i) => (
                            <span key={i} style={{ height: `${Math.max(12, Math.round(lv * 100))}%` }} />
                          ))}
                        </div>
                        <button
                          type="button"
                          className="wa-recorder-icon wa-recorder-pause"
                          title={recordPaused ? 'Continuar gravação' : 'Pausar gravação'}
                          aria-label={recordPaused ? 'Continuar gravação' : 'Pausar gravação'}
                          onClick={togglePauseRecording}
                        >
                          <SolidIcon path={recordPaused ? PATH_MIC : PATH_PAUSE} />
                        </button>
                        <button
                          type="button"
                          className="wa-send-btn"
                          title="Enviar áudio"
                          aria-label="Enviar áudio"
                          onClick={stopRecording}
                        >
                          <i className="ti ti-send" aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                    <>
                    <div className="wa-compose-attach" ref={attachMenuRef}>
                      <button
                        type="button"
                        className="crm-icon-btn"
                        title="Anexar"
                        aria-label="Anexar arquivo"
                        aria-expanded={attachOpen}
                        disabled={sending || recording}
                        onClick={() => setAttachOpen((o) => !o)}
                      >
                        <i className="ti ti-paperclip" aria-hidden="true" />
                      </button>
                      {attachOpen ? (
                        <div className="wa-attach-menu" role="menu">
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setAttachOpen(false);
                              imageInputRef.current?.click();
                            }}
                          >
                            <i className="ti ti-photo" aria-hidden="true" />
                            Imagem
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setAttachOpen(false);
                              videoInputRef.current?.click();
                            }}
                          >
                            <i className="ti ti-video" aria-hidden="true" />
                            Vídeo
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setAttachOpen(false);
                              documentInputRef.current?.click();
                            }}
                          >
                            <i className="ti ti-file" aria-hidden="true" />
                            Documento
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="crm-icon-btn wa-record-btn"
                      title="Gravar áudio"
                      aria-label="Gravar áudio"
                      disabled={sending}
                      onClick={() => void startRecording()}
                    >
                      <i className="ti ti-microphone" aria-hidden="true" />
                    </button>
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={recording ? 'Gravando áudio…' : 'Digite uma mensagem…'}
                      rows={1}
                      aria-label="Mensagem"
                      onPaste={onComposerPaste}
                      disabled={sending || recording}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void sendMessage(e);
                        }
                      }}
                    />
                    <button
                      type="submit"
                      className="wa-send-btn"
                      disabled={!draft.trim() || sending || recording}
                      aria-label="Enviar"
                    >
                      <i className="ti ti-send" aria-hidden="true" />
                    </button>
                    </>
                    )}
                    </form>
                  </>
                )}
              </>
            ) : (
              <div className="wa-empty">
                <i className="ti ti-brand-whatsapp" aria-hidden="true" />
                <p>Selecione uma conversa na lista.</p>
              </div>
            )}
          </div>
        </div>
      )}

      <Modal
        open={newAttendanceOpen}
        wide
        title="Novo atendimento"
        description="Informe o número e selecione um modelo aprovado pela Meta para iniciar o atendimento."
        onClose={() => {
          setNewAttendanceOpen(false);
          resetNewAttendanceForm();
        }}
      >
        <form className="crm-form wa-new-attendance-form" onSubmit={(e) => void startNewAttendance(e)}>
          <div className="wa-new-attendance-section">
            <div className="crm-field">
              <label htmlFor="wa_new_phone">Telefone</label>
              <div className="wa-new-attendance-phone">
                <select
                  className="wa-phone-dial-select"
                  value={newPhoneDial}
                  onChange={(e) => setNewPhoneDial(e.target.value)}
                  aria-label="DDI do país"
                >
                  {COUNTRY_DIAL_CODES.map((c) => (
                    <option key={c.iso2} value={c.iso2} title={c.name}>
                      {countryFlag(c.iso2)} +{c.dial}
                    </option>
                  ))}
                </select>
                <input
                  id="wa_new_phone"
                  value={newPhoneNational}
                  onChange={(e) => setNewPhoneNational(e.target.value.replace(/\D/g, ''))}
                  placeholder="DDD + número"
                  inputMode="tel"
                  autoFocus
                  required
                />
              </div>
            </div>
          </div>

          <div className="wa-new-attendance-section wa-new-attendance-section--message">
            <div className="crm-field">
              <label htmlFor="wa_new_template">Modelo de mensagem (aprovado pela Meta)</label>
              <p className="wa-new-attendance-hint" style={{ marginTop: 0 }}>
                Obrigatório para iniciar atendimentos via API oficial WhatsApp.
              </p>
              {loadingTemplates ? (
                <div className="wa-new-attendance-state">
                  <i className="ti ti-loader-2 wa-spin" aria-hidden="true" />
                  <p>Carregando modelos aprovados da Meta…</p>
                </div>
              ) : approvedTemplates.length === 0 ? (
                <div className="wa-new-attendance-state wa-new-attendance-state--warn">
                  <i className="ti ti-alert-circle" aria-hidden="true" />
                  <p>
                    Nenhum modelo aprovado encontrado. Verifique em{' '}
                    <Link to="/admin/integracoes?tab=whatsapp">Integrações → Modelos de mensagem</Link>.
                  </p>
                </div>
              ) : (
                <div className="wa-new-attendance-template">
                  <select
                    id="wa_new_template"
                    value={newTemplateId}
                    onChange={(e) => setNewTemplateId(e.target.value)}
                    required
                  >
                    {approvedTemplates.map((t) => (
                      <option key={templateKey(t)} value={templateKey(t)}>
                        {templateOptionLabel(t)}
                      </option>
                    ))}
                  </select>
                  <div className="wa-new-attendance-preview">
                    <span className="wa-new-attendance-preview-label">Pré-visualização</span>
                    <div className="wa-new-attendance-preview-bubble">
                      <p>{selectedTemplate?.body}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="wa-new-attendance-footer">
            <button
              type="button"
              className="crm-btn-secondary"
              onClick={() => {
                setNewAttendanceOpen(false);
                resetNewAttendanceForm();
              }}
              disabled={startingAttendance}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="crm-btn-primary"
              disabled={startingAttendance || !approvedTemplates.length || loadingTemplates}
            >
              <i className="ti ti-send" aria-hidden="true" />
              {startingAttendance ? 'Iniciando…' : 'Iniciar atendimento'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={contactPickerOpen}
        title="Contatos"
        description="Selecione um contato para iniciar o atendimento com um modelo da Meta."
        wide
        onClose={() => {
          setContactPickerOpen(false);
          setContactSearch('');
        }}
      >
        <div className="wa-contact-picker">
          <div className="crm-inline-search" role="search">
            <i className="ti ti-search si" aria-hidden="true" />
            <input
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              placeholder="Buscar por nome, telefone ou e-mail…"
              aria-label="Buscar contatos"
              autoFocus
            />
          </div>
          <div className="wa-contact-picker-list" role="list">
            {pickerContacts.map((c) => {
              const hasPhone = (c.telefone?.replace(/\D/g, '') || '').length >= 10;
              return (
                <button
                  key={c.id}
                  type="button"
                  className="wa-contact-picker-item"
                  disabled={!hasPhone}
                  onClick={() => openNewAttendanceFromContact(c)}
                  role="listitem"
                >
                  <div className="wa-avatar">{initials(c.nome)}</div>
                  <div className="wa-contact-picker-body">
                    <div className="wa-contact-picker-name">{c.nome}</div>
                    <div className="wa-contact-picker-meta">
                      {c.telefone || 'Sem telefone'}
                      {c.email ? ` · ${c.email}` : ''}
                    </div>
                  </div>
                  <i className="ti ti-chevron-right" aria-hidden="true" />
                </button>
              );
            })}
            {pickerContacts.length === 0 ? (
              <div className="kanban-empty">Nenhum contato encontrado.</div>
            ) : null}
          </div>
        </div>
      </Modal>

      <Modal
        open={transferOpen}
        title="Transferir conversa"
        description={active ? `Escolha quem vai assumir o atendimento de ${active.nome}.` : undefined}
        onClose={() => setTransferOpen(false)}
      >
        <div className="wa-contact-picker-list" role="list">
          {active?.assignedTo ? (
            <button
              type="button"
              className="wa-contact-picker-item"
              disabled={transferring}
              onClick={() => void transferChat(null)}
              role="listitem"
            >
              <div className="wa-avatar">
                <i className="ti ti-users" aria-hidden="true" />
              </div>
              <div className="wa-contact-picker-body">
                <div className="wa-contact-picker-name">Devolver para a equipe</div>
                <div className="wa-contact-picker-meta">Remove o responsável — fica visível para todos</div>
              </div>
              <i className="ti ti-chevron-right" aria-hidden="true" />
            </button>
          ) : null}
          {teamMembers
            .filter((m) => String(m.id) !== active?.assignedTo)
            .map((m) => (
              <button
                key={m.id}
                type="button"
                className="wa-contact-picker-item"
                disabled={transferring}
                onClick={() => void transferChat(m.id)}
                role="listitem"
              >
                <div className="wa-avatar">{initials(m.name)}</div>
                <div className="wa-contact-picker-body">
                  <div className="wa-contact-picker-name">
                    {m.name}
                    {m.id === authUser?.id ? ' (você)' : ''}
                  </div>
                </div>
                <i className="ti ti-chevron-right" aria-hidden="true" />
              </button>
            ))}
          {teamMembers.length === 0 ? (
            <div className="kanban-empty">Nenhum outro usuário no workspace ainda.</div>
          ) : null}
        </div>
      </Modal>

      <BulkMessagingModal
        open={bulkMessagingOpen}
        onClose={() => setBulkMessagingOpen(false)}
        onComplete={() => loadChats()}
      />
    </CrmLayout>
  );
};

export default WhatsApp;
