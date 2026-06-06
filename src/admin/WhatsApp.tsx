import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CrmLayout from '../components/crm/CrmLayout';
import { useCrmData } from '../contexts/CrmDataContext';
import { api } from '../services/api';

type WaMessage = {
  id: string;
  text: string;
  at: string;
  fromMe: boolean;
};

type WaConversation = {
  id: string;
  contatoId?: string;
  nome: string;
  phone: string;
  lastMessage: string;
  when: string;
  unread: number;
};

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
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
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      return;
    }
    void loadMessages(activeId);
  }, [activeId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeId]);

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
    if (!text || !active) return;
    setSending(true);
    try {
      const data = await api.post<{ messages: WaMessage[] }>(`/whatsapp/chats/${active.id}/messages`, { text });
      setMessages(data.messages || []);
      setDraft('');
      await loadChats();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Não foi possível enviar a mensagem');
    } finally {
      setSending(false);
    }
  };

  const contactCompany = active?.contatoId
    ? getCompanyName(contacts.find((c) => c.id === active.contatoId)?.empresaId)
    : null;

  return (
    <CrmLayout>
      <div className="crm-page-header">
        <div>
          <div className="crm-page-title">
            WhatsApp <span>({totalUnread} não lidas)</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--vesk-muted)', marginTop: 2 }}>
            {waStatus === 'connected' ? (
              'Conectado à Evolution API'
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
            Conecte sua instância da Evolution API para ver e enviar mensagens.
          </p>
          <Link to="/admin/integracoes?tab=whatsapp" className="crm-btn-primary" style={{ display: 'inline-flex', marginTop: 12 }}>
            Ir para Integrações
          </Link>
        </div>
      ) : (
        <div className="wa-layout inbox" aria-label="Chat WhatsApp">
          <div className="wa-list crm-card inbox-list" aria-label="Lista de conversas">
            <div className="crm-card-header" style={{ marginBottom: 10 }}>
              <i className="ti ti-brand-whatsapp" style={{ color: '#25d366', fontSize: 18 }} aria-hidden="true" />
              <div className="crm-card-title">Conversas</div>
              <span className="pipeline-badge">{filtered.length} chats</span>
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
                    <div className="wa-chat-name">{active.nome}</div>
                    <div className="wa-chat-phone">{active.phone}</div>
                    {contactCompany && contactCompany !== '—' ? (
                      <div className="wa-chat-meta">
                        <i className="ti ti-building" aria-hidden="true" />
                        {contactCompany}
                      </div>
                    ) : null}
                  </div>
                  <div className="wa-chat-head-actions">
                    {active.contatoId ? (
                      <Link to="/admin/contatos" className="crm-btn-secondary" style={{ padding: '6px 10px', fontSize: 11 }}>
                        Ver contato
                      </Link>
                    ) : null}
                  </div>
                </div>

                <div className="wa-messages" role="log" aria-live="polite">
                  {messages.map((m) => (
                    <div key={m.id} className={`wa-bubble-wrap${m.fromMe ? ' out' : ' in'}`}>
                      <div className={`wa-bubble${m.fromMe ? ' out' : ' in'}`}>
                        <p>{m.text}</p>
                        <time dateTime={m.at}>{m.at}</time>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

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
    </CrmLayout>
  );
};

export default WhatsApp;
