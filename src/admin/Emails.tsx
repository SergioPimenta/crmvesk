import { useEffect, useMemo, useState } from 'react';
import CrmLayout from '../components/crm/CrmLayout';
import Modal from '../components/crm/Modal';
import { useCrmData, type EmailStatus } from '../contexts/CrmDataContext';

const Emails = () => {
  const { emails, contacts, companies, addEmail, refreshEmails, getContactName, getCompanyName } = useCrmData();
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);

  useEffect(() => {
    void refreshEmails().catch(() => {});
  }, [refreshEmails]);
  const [compose, setCompose] = useState({
    para: '',
    assunto: '',
    mensagem: '',
    contatoId: '',
    empresaId: '',
  });

  const selectedContact = useMemo(() => contacts.find((c) => c.id === compose.contatoId) ?? null, [compose.contatoId, contacts]);
  const allowedCompanies = useMemo(() => {
    if (!compose.contatoId) return companies;
    if (!selectedContact?.empresaId) return [];
    return companies.filter((co) => co.id === selectedContact.empresaId);
  }, [companies, compose.contatoId, selectedContact?.empresaId]);

  const unreadOrPending = useMemo(
    () => emails.filter((m) => m.status === 'Não lido' || m.status === 'Aguardando resposta').length,
    [emails]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return emails;
    return emails.filter(
      (m) =>
        m.de.toLowerCase().includes(q) ||
        m.assunto.toLowerCase().includes(q) ||
        m.preview.toLowerCase().includes(q) ||
        getContactName(m.contatoId).toLowerCase().includes(q) ||
        getCompanyName(m.empresaId).toLowerCase().includes(q)
    );
  }, [emails, getCompanyName, getContactName, query]);

  const active = useMemo(() => filtered.find((m) => m.id === activeId) ?? filtered[0] ?? null, [activeId, filtered]);

  const statusPill = (s: EmailStatus) => {
    if (s === 'Não lido') return <span className="pill-status warn">Não lido</span>;
    if (s === 'Aguardando resposta') return <span className="pill-status wait">Aguardando</span>;
    return <span className="pill-status ok">Respondido</span>;
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
            E-mails <span>({unreadOrPending})</span>
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
            <span className="pipeline-badge">
              {unreadOrPending} pendentes
            </span>
          </div>

          <div className="inbox-items" role="list">
            {filtered.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`inbox-item${(active?.id ?? null) === m.id ? ' active' : ''}`}
                onClick={() => setActiveId(m.id)}
                role="listitem"
              >
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
            ))}
            {filtered.length === 0 ? <div className="kanban-empty">Nenhum e-mail encontrado.</div> : null}
          </div>
        </div>

        <div className="inbox-view crm-card" aria-label="Leitura do e-mail selecionado">
          <div className="crm-card-header">
            <i className="ti ti-message" style={{ color: 'var(--vesk-orange)', fontSize: 16 }} aria-hidden="true" />
            <div className="crm-card-title">Mensagem</div>
            <button type="button" className="crm-card-action">
              Vincular a contato/negócio →
            </button>
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
                <button type="button" className="crm-btn-secondary">
                  <i className="ti ti-flag" style={{ fontSize: 13 }} aria-hidden="true" />
                  Marcar
                </button>
                <button type="button" className="crm-btn-primary" style={{ marginLeft: 'auto' }}>
                  <i className="ti ti-check" style={{ fontSize: 13 }} aria-hidden="true" />
                  Resolver
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

