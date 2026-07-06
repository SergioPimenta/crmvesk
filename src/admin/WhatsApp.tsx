import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CrmLayout from '../components/crm/CrmLayout';
import Modal from '../components/crm/Modal';
import BulkMessagingModal from '../components/crm/BulkMessagingModal';
import { useCrmData, type Contact } from '../contexts/CrmDataContext';
import { api } from '../services/api';
import {
  buildChatTimeline,
  formatMessageTime,
  type WaMsgStatus,
} from '../utils/waChatFormat';
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

const WaAudioPlayer = ({ src }: { src: string }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onLoaded = () => setDuration(audio.duration || 0);
    const onEnd = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('ended', onEnd);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play();
      setPlaying(true);
    }
  };

  const handleSeek = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    const value = Number(ev.target.value);
    if (audio) audio.currentTime = value;
    setCurrentTime(value);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const timeLabel = currentTime > 0 ? formatAudioTime(currentTime) : formatAudioTime(duration);

  return (
    <div className="wa-audio-player">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        className="wa-audio-play"
        onClick={togglePlay}
        aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}
      >
        <i className={`ti ${playing ? 'ti-player-pause-filled' : 'ti-player-play-filled'}`} aria-hidden="true" />
      </button>
      <div className="wa-audio-body">
        <input
          type="range"
          className="wa-audio-seek"
          min={0}
          max={duration || 0}
          step={0.01}
          value={currentTime}
          onChange={handleSeek}
          style={{ '--wa-audio-progress': `${progress}%` } as React.CSSProperties}
          aria-label="Progresso do áudio"
        />
        <span className="wa-audio-time">{timeLabel}</span>
      </div>
    </div>
  );
};

const MessageContent = ({ message }: { message: WaMessage }) => {
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
        <WaAudioPlayer src={media.url} />
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

const MessageChecks = ({ status }: { status?: WaMsgStatus }) => {
  if (!status || status === 'failed') return null;
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
  const [error, setError] = useState('');
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

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await loadChats();
      setLoading(false);
    })();
  }, [loadChats]);

  useEffect(() => {
    if (waStatus !== 'connected') return undefined;
    const id = window.setInterval(() => void loadChats(), 12000);
    return () => window.clearInterval(id);
  }, [waStatus, loadChats]);

  useEffect(() => {
    activeChatIdRef.current = activeId;

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

  const active = useMemo(
    () => filtered.find((c) => c.id === activeId) ?? filtered[0] ?? null,
    [activeId, filtered]
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

  useEffect(() => {
    // No mobile a lista aparece primeiro; o usuário toca para abrir a conversa.
    // No desktop (2 painéis) mantemos a primeira conversa selecionada por padrão.
    const isMobile =
      typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) return;
    if (!activeId && filtered[0]) setActiveId(filtered[0].id);
  }, [filtered, activeId]);

  const totalUnread = useMemo(() => conversations.reduce((n, c) => n + c.unread, 0), [conversations]);

  useEffect(() => {
    setWhatsappUnread(totalUnread);
  }, [totalUnread, setWhatsappUnread]);

  const selectConversation = (id: string) => {
    setActiveId(id);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
  };

  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Não foi possível ler o arquivo'));
      reader.readAsDataURL(file);
    });

  const sendMediaFile = async (file: File) => {
    if (!active || isClosed || outsideWindow || sending) return;
    if (file.size > 8 * 1024 * 1024) {
      alert('Arquivo muito grande. O limite é 8 MB.');
      return;
    }
    setSending(true);
    setAttachOpen(false);
    try {
      const caption = draft.trim();
      const payload = {
        data: await fileToBase64(file),
        mimeType: file.type || 'application/octet-stream',
        filename: file.name || 'arquivo',
        caption,
      };
      const data = await api.post<{ messages: WaMessage[] }>(`/whatsapp/chats/${active.id}/media`, payload);
      scrollOnNextMessagesRef.current = true;
      setMessages(data.messages || []);
      setDraft('');
      await loadChats();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Não foi possível enviar o arquivo');
    } finally {
      setSending(false);
    }
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void sendMediaFile(file);
  };

  const startRecording = async () => {
    if (!active || isClosed || outsideWindow || sending || recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        recordStreamRef.current = null;
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
        const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: mimeType });
        void sendMediaFile(file);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      alert('Não foi possível acessar o microfone. Verifique as permissões do navegador.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    setRecording(false);
  };

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
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      recordStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !active || isClosed || outsideWindow) return;
    setSending(true);
    try {
      const data = await api.post<{ messages: WaMessage[] }>(`/whatsapp/chats/${active.id}/messages`, { text });
      scrollOnNextMessagesRef.current = true;
      setMessages(data.messages || []);
      setDraft('');
      await loadChats();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Não foi possível enviar a mensagem');
    } finally {
      setSending(false);
    }
  };

  const finishAttendance = async () => {
    if (!active || isClosed) return;
    const closedId = active.id;

    setConversations((prev) => prev.filter((c) => c.id !== closedId));
    setActiveId(null);
    setMessages([]);

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

            {loading ? <div className="kanban-empty">Carregando…</div> : null}

            <div className="inbox-items" role="list">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`inbox-item wa-conv-item${active?.id === c.id ? ' active' : ''}`}
                  onClick={() => selectConversation(c.id)}
                  role="listitem"
                >
                  <div className="wa-conv-row">
                    <div className="wa-avatar">{initials(c.nome)}</div>
                    <div className="wa-conv-body">
                      <div className="inbox-row">
                        <div className="inbox-from">{c.nome}</div>
                        <div className="inbox-when">{c.when}</div>
                      </div>
                      <div className="wa-conv-preview">
                        <span className="inbox-preview">{c.lastMessage}</span>
                        {c.unread > 0 ? <span className="wa-unread">{c.unread}</span> : null}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
              {!loading && filtered.length === 0 ? (
                <div className="kanban-empty">
                  Nenhuma conversa. Envie ou receba mensagens no WhatsApp e clique em Atualizar.
                </div>
              ) : null}
            </div>
          </div>

          <div className="wa-chat crm-card inbox-view" aria-label="Mensagens da conversa">
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
                  </div>
                  <div className="wa-chat-head-actions">
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
                        <div className={`wa-bubble${item.message.fromMe ? ' out' : ' in'}`}>
                          <MessageContent message={item.message} />
                          <div className="wa-bubble-meta">
                            <time dateTime={item.message.messageAt}>{formatMessageTime(item.message.messageAt)}</time>
                            {item.message.fromMe ? <MessageChecks status={item.message.status} /> : null}
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
                ) : outsideWindow ? (
                  <div className="wa-window-banner">
                    <i className="ti ti-clock-exclamation" aria-hidden="true" />
                    <div>
                      <strong>Fora da janela de 24 horas</strong>
                      <p>
                        Passaram mais de 24 horas desde a última mensagem do cliente. A janela é reiniciada a cada
                        nova mensagem dele — aguarde o contato ou finalize o atendimento e inicie novamente com um
                        modelo aprovado pela Meta.
                      </p>
                    </div>
                  </div>
                ) : (
                  <form className="wa-compose" onSubmit={(e) => void sendMessage(e)}>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={onFileSelected}
                    />
                    <input
                      ref={videoInputRef}
                      type="file"
                      accept="video/*"
                      hidden
                      onChange={onFileSelected}
                    />
                    <input
                      ref={documentInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,application/*"
                      hidden
                      onChange={onFileSelected}
                    />
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
                    {recording ? (
                      <button
                        type="button"
                        className="wa-record-btn wa-record-btn--active"
                        title="Parar gravação"
                        aria-label="Parar gravação de áudio"
                        onClick={stopRecording}
                      >
                        <i className="ti ti-player-stop" aria-hidden="true" />
                      </button>
                    ) : (
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
                    )}
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={recording ? 'Gravando áudio…' : 'Digite uma mensagem…'}
                      rows={1}
                      aria-label="Mensagem"
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
                  </form>
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

      <BulkMessagingModal
        open={bulkMessagingOpen}
        onClose={() => setBulkMessagingOpen(false)}
        onComplete={() => loadChats()}
      />
    </CrmLayout>
  );
};

export default WhatsApp;
