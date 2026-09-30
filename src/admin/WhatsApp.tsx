import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { put } from '@vercel/blob/client';
import CrmLayout from '../components/crm/CrmLayout';
import BulkMessagingModal from '../components/crm/BulkMessagingModal';
import WaAttachPreview from '../components/crm/WaAttachPreview';
import { useCrmData, type Contact } from '../contexts/CrmDataContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { buildChatTimeline } from '../utils/waChatFormat';
import { computeMessagingWindow } from '../utils/whatsappWindow';
import { nationalDigitsFromContactPhone } from '../utils/countryDialCodes';
import ChatHeader from './whatsapp/ChatHeader';
import Composer from './whatsapp/Composer';
import ContactPickerModal from './whatsapp/ContactPickerModal';
import ConversationList from './whatsapp/ConversationList';
import MessageList from './whatsapp/MessageList';
import NewAttendanceModal, { type NewAttendancePrefill } from './whatsapp/NewAttendanceModal';
import TransferModal from './whatsapp/TransferModal';
import {
  MEDIA_BYTES_LIMITS,
  mediaKindFromMime,
  type ListTab,
  type TeamMember,
  type WaConversation,
  type WaMessage,
} from './whatsapp/types';
import { useAudioRecorder } from './whatsapp/useAudioRecorder';
import { usePendingAttachments } from './whatsapp/usePendingAttachments';

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
  const [listTab, setListTab] = useState<ListTab>('aguardando');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [error, setError] = useState('');
  const [sendError, setSendError] = useState('');
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [newAttendanceOpen, setNewAttendanceOpen] = useState(false);
  const [bulkMessagingOpen, setBulkMessagingOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevActiveIdRef = useRef<string | null>(null);
  const scrolledForChatRef = useRef<string | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  const scrollOnNextMessagesRef = useRef(false);

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

  const recorder = useAudioRecorder({
    canRecord: Boolean(active) && !isClosed && !sending,
    onAudio: (file) => sendMediaFile(file),
    onError: setSendError,
  });

  const canAttach = Boolean(active) && !isClosed && messagesReady && !recorder.recording;

  const attachments = usePendingAttachments({
    canAttach,
    resetKey: active?.id,
    draft,
    setDraft,
    sending,
    sendMediaFile,
    setSendError,
    setAttachOpen,
  });

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

  const [newAttendancePrefill, setNewAttendancePrefill] = useState<NewAttendancePrefill | null>(null);

  const openNewAttendance = () => {
    setNewAttendancePrefill(null);
    setNewAttendanceOpen(true);
  };

  const openNewAttendanceFromContact = (contact: Contact) => {
    const phone = contact.telefone?.replace(/\D/g, '') || '';
    if (phone.length < 10) {
      alert('Este contato não possui telefone válido para WhatsApp.');
      return;
    }
    setNewAttendancePrefill({
      national: nationalDigitsFromContactPhone(contact.telefone || ''),
      contactId: contact.id,
      name: contact.nome,
    });
    setContactPickerOpen(false);
    setNewAttendanceOpen(true);
  };

  const onAttendanceStarted = async ({ chat, messages: started }: { chat: WaConversation; messages: WaMessage[] }) => {
    await loadChats();
    setActiveId(chat.id);
    setMessages(started || []);
    scrollOnNextMessagesRef.current = true;
    setNewAttendanceOpen(false);
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
          <ConversationList
            chatCount={filtered.length}
            listTab={listTab}
            onListTabChange={setListTab}
            waitingChats={waitingChats}
            ongoingChats={ongoingChats}
            closedChats={closedChats}
            tabChats={tabChats}
            loading={loading}
            activeId={active?.id}
            authUserId={authUser?.id}
            claimingId={claimingId}
            onSelect={selectConversation}
            onClaim={(id) => void claimChat(id)}
            onOpenContactPicker={() => setContactPickerOpen(true)}
            onOpenBulk={() => setBulkMessagingOpen(true)}
            onOpenNewAttendance={openNewAttendance}
          />

          <div
            className="wa-chat crm-card inbox-view"
            aria-label="Mensagens da conversa"
            onDragEnter={attachments.onChatDragEnter}
            onDragOver={attachments.onChatDragOver}
            onDragLeave={attachments.onChatDragLeave}
            onDrop={attachments.onChatDrop}
          >
            {attachments.dragActive ? (
              <div className="wa-drop-overlay" aria-hidden="true">
                <div className="wa-drop-overlay-box">
                  <i className="ti ti-cloud-upload" />
                  <span>Arraste arquivo aqui</span>
                </div>
              </div>
            ) : null}
            {attachments.pending.length > 0 ? (
              <WaAttachPreview
                items={attachments.pending}
                activeIndex={attachments.pendingIndex}
                sending={sending}
                error={sendError}
                onSelect={attachments.setPendingIndex}
                onCaptionChange={attachments.updateCaption}
                onRemove={attachments.removePending}
                onAddFiles={attachments.addPendingFiles}
                onClose={attachments.clearPending}
                onSend={() => void attachments.sendPending()}
                onDismissError={() => setSendError('')}
              />
            ) : null}
            {active ? (
              <>
                <ChatHeader
                  active={active}
                  isClosed={isClosed}
                  contactCompany={contactCompany}
                  authUserId={authUser?.id}
                  canTransfer={teamMembers.length > 0}
                  finishing={finishing}
                  onBack={() => setActiveId(null)}
                  onTransfer={() => setTransferOpen(true)}
                  onFinish={() => void finishAttendance()}
                />

                <MessageList
                  containerRef={messagesContainerRef}
                  endRef={messagesEndRef}
                  timeline={chatTimeline}
                  authUserName={authUser?.name}
                  contactName={active.nome}
                />

                <Composer
                  isClosed={isClosed}
                  messagesReady={messagesReady}
                  outsideWindow={outsideWindow}
                  sendError={sendError}
                  onDismissError={() => setSendError('')}
                  sending={sending}
                  draft={draft}
                  setDraft={setDraft}
                  sendMessage={sendMessage}
                  onFileSelected={attachments.onFileSelected}
                  onComposerPaste={attachments.onComposerPaste}
                  recorder={recorder}
                  attachOpen={attachOpen}
                  setAttachOpen={setAttachOpen}
                />
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

      <NewAttendanceModal
        open={newAttendanceOpen}
        connected={waStatus === 'connected'}
        prefill={newAttendancePrefill}
        onClose={() => setNewAttendanceOpen(false)}
        onStarted={onAttendanceStarted}
      />

      <ContactPickerModal
        open={contactPickerOpen}
        contacts={contacts}
        onClose={() => setContactPickerOpen(false)}
        onPick={openNewAttendanceFromContact}
      />

      <TransferModal
        open={transferOpen}
        active={active}
        teamMembers={teamMembers}
        transferring={transferring}
        authUserId={authUser?.id}
        onClose={() => setTransferOpen(false)}
        onTransfer={(target) => void transferChat(target)}
      />

      <BulkMessagingModal
        open={bulkMessagingOpen}
        onClose={() => setBulkMessagingOpen(false)}
        onComplete={() => loadChats()}
      />
    </CrmLayout>
  );
};

export default WhatsApp;
