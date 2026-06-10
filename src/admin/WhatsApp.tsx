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
import { computeMessagingWindow } from '../utils/whatsappWindow';

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
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState('');
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [openingChat, setOpeningChat] = useState(false);
  const [newAttendanceOpen, setNewAttendanceOpen] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newTemplateId, setNewTemplateId] = useState('');
  const [approvedTemplates, setApprovedTemplates] = useState<MetaApprovedTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [startingAttendance, setStartingAttendance] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevActiveIdRef = useRef<string | null>(null);
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
  const outsideWindow = !isClosed && waStatus === 'connected' && !messagingWindow.withinWindow;

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
    setNewPhone('');
    setNewTemplateId(approvedTemplates[0] ? templateKey(approvedTemplates[0]) : '');
  };

  const startNewAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = newPhone.replace(/\D/g, '');
    if (phone.length < 10) {
      alert('Informe um telefone válido com DDI + DDD + número.');
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
      setContactPickerOpen(false);
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
                    setContactPickerOpen(true);
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
                    Atendimento finalizado.
                  </div>
                ) : outsideWindow ? (
                  <div className="wa-window-banner">
                    <i className="ti ti-clock-exclamation" aria-hidden="true" />
                    <div>
                      <strong>Fora da janela de 24 horas</strong>
                      <p>
                        Não é possível enviar mensagens. Finalize o atendimento e inicie novamente com um modelo
                        aprovado pela Meta.
                      </p>
                    </div>
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
              <label htmlFor="wa_new_phone">Telefone (DDI + DDD + número)</label>
              <div className="wa-new-attendance-phone">
                <i className="ti ti-phone" aria-hidden="true" />
                <input
                  id="wa_new_phone"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="Ex: 5511999998888"
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
        description="Selecione um contato para abrir ou criar a conversa."
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
