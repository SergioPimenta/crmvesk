import { useEffect, useMemo, useState } from 'react';
import CrmLayout from '../components/crm/CrmLayout';
import Modal from '../components/crm/Modal';
import {
  useCrmData,
  type EmailStatus,
  isEmailRead,
  isEmailUnread,
} from '../contexts/CrmDataContext';

type ReadFilter = 'all' | 'unread' | 'read';

const READ_FILTERS: { id: ReadFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'unread', label: 'Não lidos' },
  { id: 'read', label: 'Lidos' },
];

const Emails = () => {
  const {
    emails,
    contacts,
    companies,
    addEmail,
    updateEmail,
    deleteEmail,
    refreshEmails,
    getContactName,
    getCompanyName,
  } = useCrmData();
  const [query, setQuery] = useState('');
  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [compose, setCompose] = useState({
    para: '',
    assunto: '',
    mensagem: '',
    contatoId: '',
    empresaId: '',
  });

  useEffect(() => {
    void refreshEmails().catch(() => {});
  }, [refreshEmails]);

  const selectedContact = useMemo(() => contacts.find((c) => c.id === compose.contatoId) ?? null, [compose.contatoId, contacts]);
  const allowedCompanies = useMemo(() => {
    if (!compose.contatoId) return companies;
    if (!selectedContact?.empresaId) return [];
    return companies.filter((co) => co.id === selectedContact.empresaId);
  }, [companies, compose.contatoId, selectedContact?.empresaId]);

  const unreadCount = useMemo(() => emails.filter((m) => isEmailUnread(m.status)).length, [emails]);

  const filtered = useMemo(() => {
    let list = emails;
    if (readFilter === 'unread') list = list.filter((m) => isEmailUnread(m.status));
    if (readFilter === 'read') list = list.filter((m) => isEmailRead(m.status));

    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (m) =>
        m.de.toLowerCase().includes(q) ||
        m.assunto.toLowerCase().includes(q) ||
        m.preview.toLowerCase().includes(q) ||
        getContactName(m.contatoId).toLowerCase().includes(q) ||
        getCompanyName(m.empresaId).toLowerCase().includes(q)
    );
  }, [emails, getCompanyName, getContactName, query, readFilter]);

  const active = useMemo(() => filtered.find((m) => m.id === activeId) ?? null, [activeId, filtered]);

  const statusPill = (s: EmailStatus) => {
    if (s === 'Não lido') return <span className="pill-status warn">Não lido</span>;
    if (s === 'Aguardando resposta') return <span className="pill-status wait">Aguardando</span>;
    if (s === 'Lido') return <span className="pill-status ok">Lido</span>;
    return <span className="pill-status ok">Respondido</span>;
  };

  const selectEmail = (id: string) => {
    setActiveId(id);
    const email = emails.find((m) => m.id === id);
    if (email && isEmailUnread(email.status)) {
      updateEmail(id, { status: 'Lido' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir esta mensagem da caixa de entrada?')) return;
    try {
      await deleteEmail(id);
      if (activeId === id) {
        const remaining = filtered.filter((m) => m.id !== id);
        setActiveId(remaining[0]?.id ?? null);
      }
    } catch {
      alert('Não foi possível excluir a mensagem.');
      void refreshEmails();
    }
  };

  const resetCompose = () =>
    setCompose({
      para: '',
      assunto: '',
      mensagem: '',
      contatoId: '',
      empresaId: '',
    });

  const openCompose = () => {
    resetCompose();
    setIsComposeOpen(true);
  };

  const sendEmail = (e: React.FormEvent) => {
    e.preventDefault();
    const id = addEmail({
      de: compose.para.trim() || 'destinatario@exemplo.com',
      assunto: compose.assunto.trim() || '(Sem assunto)',
      preview: (compose.mensagem.trim() || 'Mensagem enviada pelo CRM…').slice(0, 80),
      quando: 'Agora',
      contatoId: compose.contatoId || undefined,
      empresaId: compose.empresaId || undefined,
      status: 'Aguardando resposta',
    });
    setActiveId(id);
    setIsComposeOpen(false);
  };

  return (
    <CrmLayout>
      <div className="crm-page-header">
        <div>
          <div className="crm-page-title">
            E-mails <span>({unreadCount})</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--vesk-muted)', marginTop: 2 }}>
            Caixa centralizada: registre conversas vinculadas a contatos e negócios sem sair do CRM
          </div>
        </div>
        <div className="crm-page-actions">
          <div className="crm-inline-search" role="search">
            <i className="ti ti-search si" aria-hidden="true" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar e-mails…" aria-label="Buscar e-mails" />
          </div>
          <button type="button" className="crm-btn-primary" onClick={openCompose}>
            <i className="ti ti-send" style={{ fontSize: 13 }} aria-hidden="true" />
            Novo e-mail
          </button>
        </div>
      </div>

      <div className="inbox" aria-label="Caixa de e-mails">
        <div className="inbox-list crm-card" aria-label="Lista de e-mails">
          <div className="crm-card-header" style={{ marginBottom: 10 }}>
            <i className="ti ti-mail" style={{ color: 'var(--vesk-orange)', fontSize: 16 }} aria-hidden="true" />
            <div className="crm-card-title">Entrada</div>
            <span className="pipeline-badge">{unreadCount} pendentes</span>
          </div>

          <div className="crm-tabs inbox-filters" aria-label="Filtrar por leitura">
            {READ_FILTERS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`crm-tab${readFilter === tab.id ? ' active' : ''}`}
                onClick={() => setReadFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="inbox-items" role="list">
            {filtered.map((m) => {
              const unread = isEmailUnread(m.status);
              return (
                <div
                  key={m.id}
                  className={`inbox-item${active?.id === m.id ? ' active' : ''}${unread ? ' unread' : ''}`}
                  role="listitem"
                >
                  <button type="button" className="inbox-item-main" onClick={() => selectEmail(m.id)}>
                    <div className="inbox-row">
                      <div className="inbox-from">{m.de}</div>
                      <div className="inbox-when">{m.quando}</div>
                    </div>
                    <div className="inbox-subject">{m.assunto}</div>
                    <div className="inbox-preview">{m.preview}</div>
                    <div className="inbox-meta">
                      <span className="pill-stage">
                        <i className="ti ti-user" aria-hidden="true" style={{ fontSize: 12 }} />
                        {getContactName(m.contatoId)}
                      </span>
                      <span className="pill-stage">
                        <i className="ti ti-building" aria-hidden="true" style={{ fontSize: 12 }} />
                        {getCompanyName(m.empresaId)}
                      </span>
                      <span style={{ marginLeft: 'auto' }}>{statusPill(m.status)}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="inbox-item-delete"
                    onClick={() => void handleDelete(m.id)}
                    aria-label="Excluir mensagem"
                    title="Excluir"
                  >
                    <i className="ti ti-trash" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
            {filtered.length === 0 ? <div className="kanban-empty">Nenhum e-mail encontrado.</div> : null}
          </div>
        </div>

        <div className="inbox-view crm-card" aria-label="Leitura do e-mail selecionado">
          <div className="crm-card-header">
            <i className="ti ti-message" style={{ color: 'var(--vesk-orange)', fontSize: 16 }} aria-hidden="true" />
            <div className="crm-card-title">Mensagem</div>
            {active ? (
              <button
                type="button"
                className="inbox-item-delete inbox-item-delete-inline"
                onClick={() => void handleDelete(active.id)}
                aria-label="Excluir mensagem"
                title="Excluir"
              >
                <i className="ti ti-trash" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          {active ? (
            <>
              <div className="email-head">
                <div className="email-subject">{active.assunto}</div>
                <div className="email-line">
                  <span className="email-k">De</span> {active.de} · <span className="email-k">Quando</span> {active.quando}
                </div>
                <div className="email-line">
                  <span className="email-k">Contato</span> {getContactName(active.contatoId)} · <span className="email-k">Empresa</span>{' '}
                  {getCompanyName(active.empresaId)}
                </div>
                <div className="email-line" style={{ marginTop: 6 }}>
                  {statusPill(active.status)}
                </div>
              </div>

              <div className="email-body">
                <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{active.preview || '—'}</p>
                {active.assunto.toLowerCase().includes('formulário') ? (
                  <p style={{ color: 'var(--vesk-muted)', marginTop: 12, fontSize: 12 }}>
                    <i className="ti ti-forms" aria-hidden="true" style={{ marginRight: 4 }} />
                    Recebido via formulário de contato do site
                  </p>
                ) : null}
              </div>

              <div className="email-actions">
                <button type="button" className="crm-btn-secondary">
                  <i className="ti ti-reply" style={{ fontSize: 13 }} aria-hidden="true" />
                  Responder
                </button>
                {isEmailUnread(active.status) ? (
                  <button type="button" className="crm-btn-secondary" onClick={() => updateEmail(active.id, { status: 'Lido' })}>
                    <i className="ti ti-mail-opened" style={{ fontSize: 13 }} aria-hidden="true" />
                    Marcar como lido
                  </button>
                ) : null}
                <button
                  type="button"
                  className="crm-btn-secondary crm-btn-danger"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => void handleDelete(active.id)}
                >
                  <i className="ti ti-trash" style={{ fontSize: 13 }} aria-hidden="true" />
                  Excluir
                </button>
              </div>
            </>
          ) : (
            <div className="kanban-empty">Selecione um e-mail na lista.</div>
          )}
        </div>
      </div>

      <Modal
        open={isComposeOpen}
        title="Novo e-mail"
        description="Envie e registre a mensagem dentro do CRM (protótipo)."
        onClose={() => setIsComposeOpen(false)}
      >
        <form className="crm-form" onSubmit={sendEmail}>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="m_para">Para</label>
            <input id="m_para" type="email" value={compose.para} onChange={(e) => setCompose((p) => ({ ...p, para: e.target.value }))} required />
          </div>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="m_assunto">Assunto</label>
            <input id="m_assunto" value={compose.assunto} onChange={(e) => setCompose((p) => ({ ...p, assunto: e.target.value }))} />
          </div>
          <div className="crm-field">
            <label htmlFor="m_cont">Contato</label>
            <select
              id="m_cont"
              value={compose.contatoId}
              onChange={(e) => {
                const contatoId = e.target.value;
                const c = contacts.find((x) => x.id === contatoId);
                setCompose((p) => ({
                  ...p,
                  contatoId,
                  empresaId: contatoId ? c?.empresaId ?? '' : p.empresaId,
                }));
              }}
            >
              <option value="">— Selecione —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="crm-field">
            <label htmlFor="m_emp">Empresa</label>
            <select id="m_emp" value={compose.empresaId} onChange={(e) => setCompose((p) => ({ ...p, empresaId: e.target.value }))}>
              <option value="">— Selecione —</option>
              {allowedCompanies.map((co) => (
                <option key={co.id} value={co.id}>
                  {co.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="m_msg">Mensagem</label>
            <textarea id="m_msg" value={compose.mensagem} onChange={(e) => setCompose((p) => ({ ...p, mensagem: e.target.value }))} required />
          </div>

          <div className="crm-form-actions" style={{ gridColumn: '1 / -1' }}>
            <button type="button" className="crm-btn-secondary" onClick={() => setIsComposeOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="crm-btn-primary" style={{ marginLeft: 'auto' }}>
              Enviar
            </button>
          </div>
        </form>
      </Modal>
    </CrmLayout>
  );
};

export default Emails;
