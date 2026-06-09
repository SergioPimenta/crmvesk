import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CrmLayout from '../components/crm/CrmLayout';
import Modal from '../components/crm/Modal';
import { useCrmData, type Contact } from '../contexts/CrmDataContext';
import { api } from '../services/api';
import {
  buildChatTimeline,
  formatMessageTime,
  type WaMsgStatus,
} from '../utils/waChatFormat';

type WaMessage = {
  id: string;
  text: string;
  messageAt: string;
  fromMe: boolean;
  status?: WaMsgStatus;
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
  const { contacts, getCompanyName } = useCrmData();
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [conversations, setConversations] = useState<WaConversation[]>([]);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [waStatus, setWaStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [configured, setConfigured] = useState(false);
  const [waProvider, setWaProvider] = useState<'meta' | 'evolution'>('meta');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState('');
  const [contactPicker, setContactPicker] = useState<'list' | 'new' | null>(null);
  const [contactSearch, setContactSearch] = useState('');
  const [openingChat, setOpeningChat] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevActiveIdRef = useRef<string | null>(null);
  const scrollOnNextMessagesRef = useRef(false);

  const loadChats = useCallback(async () => {
    try {
      const data = await api.get<{
        configured: boolean;
        status: typeof waStatus;
        provider?: 'meta' | 'evolution';
        chats: WaConversation[];
      }>('/whatsapp/chats');
      setConfigured(data.configured);
      setWaStatus(data.status || 'disconnected');
      setWaProvider(data.provider === 'evolution' ? 'evolution' : 'meta');
      setConversations(data.chats || []);
      setError('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar conversas');
    }
  }, []);

  const loadMessages = useCallback(async (chatId: string) => {
    const data = await api.get<{ messages: WaMessage[] }>(`/whatsapp/chats/${chatId}/messages`);
    setMessages(data.messages || []);
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
    if (!activeId) {
      setMessages([]);
      return undefined;
    }
    void loadMessages(activeId);
    const id = window.setInterval(() => void loadMessages(activeId), 8000);
    return () => window.clearInterval(id);
  }, [activeId, loadMessages]);

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
  const isClosed = active?.attendanceStatus === 'closed';

  useEffect(() => {
    if (!activeId && filtered[0]) setActiveId(filtered[0].id);
  }, [filtered, activeId]);

  const totalUnread = useMemo(() => conversations.reduce((n, c) => n + c.unread, 0), [conversations]);

  const selectConversation = (id: string) => {
    setActiveId(id);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !active || isClosed) return;
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

  const toggleAttendance = async () => {
    if (!active) return;
    const next = isClosed ? 'open' : 'closed';
    setFinishing(true);
    try {
      await api.post(`/whatsapp/chats/${active.id}/attendance`, { status: next });
      setConversations((prev) =>
        prev.map((c) => (c.id === active.id ? { ...c, attendanceStatus: next } : c))
      );
      await loadChats();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Não foi possível atualizar o atendimento');
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

  const openContactChat = async (contact: Contact) => {
    const phone = contact.telefone?.replace(/\D/g, '') || '';
    if (phone.length < 10) {
      alert('Este contato não possui telefone válido para WhatsApp.');
      return;
    }
    setOpeningChat(true);
    try {
      const data = await api.post<{ chat: WaConversation }>('/whatsapp/chats', {
        phone,
        contactId: contact.id,
        name: contact.nome,
      });
      await loadChats();
      setActiveId(data.chat.id);
      setContactPicker(null);
      setContactSearch('');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Não foi possível abrir a conversa');
    } finally {
      setOpeningChat(false);
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
            {waStatus === 'connected' ? (
              waProvider === 'meta' ? 'Conectado à API oficial Meta' : 'Conectado à Evolution API'
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

      {!configured || waStatus !== 'connected' ? (
        <div className="crm-card" style={{ padding: 24, textAlign: 'center' }}>
          <i className="ti ti-brand-whatsapp" style={{ fontSize: 40, color: '#25d36655' }} aria-hidden="true" />
          <p style={{ color: 'var(--vesk-muted)', fontSize: 13, marginTop: 12 }}>
            Conecte o WhatsApp em Integrações (API Meta ou Evolution) para ver e enviar mensagens.
          </p>
          <Link to="/admin/integracoes?tab=whatsapp" className="crm-btn-primary" style={{ display: 'inline-flex', marginTop: 12 }}>
            Ir para Integrações
          </Link>
        </div>
      ) : (
        <div className="wa-layout inbox" aria-label="Chat WhatsApp">
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
                    setContactPicker('list');
                  }}
                >
                  <i className="ti ti-address-book" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="crm-icon-btn wa-list-icon-btn wa-list-icon-btn--primary"
                  title="Iniciar novo atendimento"
                  aria-label="Iniciar novo atendimento"
                  onClick={() => {
                    setContactSearch('');
                    setContactPicker('new');
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
                      className={`crm-btn-secondary wa-finish-btn${isClosed ? ' reopened' : ''}`}
                      onClick={() => void toggleAttendance()}
                      disabled={finishing}
                    >
                      <i className={`ti ${isClosed ? 'ti-message-circle' : 'ti-circle-check'}`} aria-hidden="true" />
                      {finishing ? 'Salvando…' : isClosed ? 'Reabrir atendimento' : 'Finalizar atendimento'}
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
                          <p>{item.message.text}</p>
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
                    Atendimento finalizado. Reabra para enviar novas mensagens.
                  </div>
                ) : (
                  <form className="wa-compose" onSubmit={(e) => void sendMessage(e)}>
                    <button type="button" className="crm-icon-btn" title="Anexo" aria-label="Anexar arquivo" disabled>
                      <i className="ti ti-paperclip" aria-hidden="true" />
                    </button>
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Digite uma mensagem…"
                      rows={1}
                      aria-label="Mensagem"
                      disabled={sending}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void sendMessage(e);
                        }
                      }}
                    />
                    <button type="submit" className="wa-send-btn" disabled={!draft.trim() || sending} aria-label="Enviar">
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
        open={contactPicker !== null}
        title={contactPicker === 'new' ? 'Novo atendimento' : 'Contatos'}
        description={
          contactPicker === 'new'
            ? 'Selecione um contato para iniciar um atendimento pelo WhatsApp.'
            : 'Selecione um contato para abrir ou criar a conversa.'
        }
        wide
        onClose={() => {
          setContactPicker(null);
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
                  disabled={!hasPhone || openingChat}
                  onClick={() => void openContactChat(c)}
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
    </CrmLayout>
  );
};

export default WhatsApp;
