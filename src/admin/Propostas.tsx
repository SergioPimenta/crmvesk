import { useEffect, useMemo, useState } from 'react';
import CrmLayout from '../components/crm/CrmLayout';
import Modal from '../components/crm/Modal';
import ProposalTemplatesModal, { type ProposalTemplate } from '../components/crm/ProposalTemplatesModal';
import { useCrmData } from '../contexts/CrmDataContext';
import { api } from '../services/api';

type ProposalForm = {
  titulo: string;
  contatoId: string;
  empresaId: string;
  dealId: string;
  valor: string;
  templateId: string;
  fieldValues: Record<string, string>;
};

const emptyForm: ProposalForm = {
  titulo: '',
  contatoId: '',
  empresaId: '',
  dealId: '',
  valor: '',
  templateId: '',
  fieldValues: {},
};

const Propostas = () => {
  const { proposals, contacts, companies, deals, addProposal, updateProposal, getContactName, getCompanyName, getDealTitle } = useCrmData();
  const [query, setQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProposalForm>(emptyForm);
  const [templates, setTemplates] = useState<ProposalTemplate[]>([]);
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);
  const [emailFeedback, setEmailFeedback] = useState<{ id: string; ok: boolean; message: string } | null>(null);
  const [localEmailSentAt, setLocalEmailSentAt] = useState<Record<string, string>>({});

  const loadTemplates = () => {
    void api
      .get<ProposalTemplate[]>('/crm/proposal-templates')
      .then((data) => setTemplates((data || []).map((t) => ({ ...t, id: String(t.id) }))))
      .catch(() => setTemplates([]));
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  // Recarrega a lista de modelos ao fechar o gerenciador, para refletir criações/edições.
  const closeTemplatesModal = () => {
    setIsTemplatesOpen(false);
    loadTemplates();
  };

  const templateById = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);
  const selectedTemplate = form.templateId ? templateById.get(form.templateId) : undefined;

  const selectTemplate = (templateId: string) => {
    const tpl = templateId ? templateById.get(templateId) : undefined;
    setForm((p) => {
      const nextValues: Record<string, string> = {};
      (tpl?.fields || []).forEach((f) => {
        nextValues[f] = p.fieldValues[f] ?? '';
      });
      return { ...p, templateId, fieldValues: nextValues };
    });
  };

  const setFieldValue = (field: string, value: string) => {
    setForm((p) => ({ ...p, fieldValues: { ...p.fieldValues, [field]: value } }));
  };

  const selectedContact = useMemo(() => contacts.find((c) => c.id === form.contatoId) ?? null, [contacts, form.contatoId]);
  const allowedCompanies = useMemo(() => {
    if (!form.contatoId) return companies;
    if (!selectedContact?.empresaId) return [];
    return companies.filter((co) => co.id === selectedContact.empresaId);
  }, [companies, form.contatoId, selectedContact?.empresaId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return proposals;
    return proposals.filter(
      (p) =>
        p.titulo.toLowerCase().includes(q) ||
        getContactName(p.contatoId).toLowerCase().includes(q) ||
        getCompanyName(p.empresaId).toLowerCase().includes(q) ||
        getDealTitle(p.dealId).toLowerCase().includes(q)
    );
  }, [getCompanyName, getContactName, getDealTitle, proposals, query]);

  const statusPill = (s: (typeof proposals)[number]['status']) => {
    if (s === 'Aceita') return <span className="pill-status ok">Aceita</span>;
    if (s === 'Recusada') return <span className="pill-status bad">Recusada</span>;
    if (s === 'Visualizada') return <span className="pill-status mid">Visualizada</span>;
    return <span className="pill-status wait">Enviada</span>;
  };

  const openCreate = () => {
    setForm(emptyForm);
    setIsCreateOpen(true);
  };

  const openEdit = (id: string) => {
    const p = proposals.find((x) => x.id === id);
    if (!p) return;
    setEditingId(id);
    setForm({
      titulo: p.titulo,
      contatoId: p.contatoId ?? '',
      empresaId: p.empresaId ?? '',
      dealId: p.dealId ?? '',
      valor: p.valor ?? '',
      templateId: p.templateId ?? '',
      fieldValues: p.fieldValues ?? {},
    });
    setIsEditOpen(true);
  };

  const createProposal = (e: React.FormEvent) => {
    e.preventDefault();
    addProposal({
      titulo: form.titulo.trim(),
      contatoId: form.contatoId || undefined,
      empresaId: form.empresaId || undefined,
      dealId: form.dealId || undefined,
      valor: form.valor.trim() || 'R$0',
      status: 'Enviada',
      enviadaEm: 'Agora',
      templateId: form.templateId || undefined,
      fieldValues: Object.keys(form.fieldValues).length > 0 ? form.fieldValues : undefined,
    });
    setIsCreateOpen(false);
  };

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    const current = proposals.find((x) => x.id === editingId);
    if (!current) return;
    updateProposal(editingId, {
      ...current,
      titulo: form.titulo.trim(),
      contatoId: form.contatoId || undefined,
      empresaId: form.empresaId || undefined,
      dealId: form.dealId || undefined,
      valor: form.valor.trim() || 'R$0',
      templateId: form.templateId || undefined,
      fieldValues: Object.keys(form.fieldValues).length > 0 ? form.fieldValues : undefined,
    });
    setIsEditOpen(false);
    setEditingId(null);
  };

  const handleSendEmail = async (p: (typeof proposals)[number]) => {
    if (sendingEmailId) return;
    setSendingEmailId(p.id);
    setEmailFeedback(null);
    try {
      const result = await api.post<{ ok: boolean; to: string; emailSentAt: string }>(
        `/crm/proposals/${p.id}/send-email`
      );
      setLocalEmailSentAt((prev) => ({ ...prev, [p.id]: result.emailSentAt }));
      setEmailFeedback({ id: p.id, ok: true, message: `Enviado para ${result.to}` });
    } catch (err) {
      setEmailFeedback({
        id: p.id,
        ok: false,
        message: err instanceof Error ? err.message : 'Erro ao enviar e-mail',
      });
    } finally {
      setSendingEmailId(null);
    }
  };

  const templateFieldInputs = (idPrefix: string) => {
    if (!selectedTemplate || !selectedTemplate.fields || selectedTemplate.fields.length === 0) return null;
    return (
      <div className="proposal-field-values" style={{ gridColumn: '1 / -1' }}>
        <div className="proposal-field-values-title">Campos de "{selectedTemplate.nome}"</div>
        <div className="proposal-field-values-grid">
          {selectedTemplate.fields.map((f) => (
            <div className="crm-field" key={f}>
              <label htmlFor={`${idPrefix}_${f}`}>{f}</label>
              <input
                id={`${idPrefix}_${f}`}
                value={form.fieldValues[f] ?? ''}
                onChange={(e) => setFieldValue(f, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <CrmLayout>
      <div className="crm-page-header">
        <div>
          <div className="crm-page-title">
            Propostas <span>({filtered.length})</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--vesk-muted)', marginTop: 2 }}>
            Crie, envie, acompanhe status e vincule ao contato/negócio do pipeline
          </div>
        </div>
        <div className="crm-page-actions">
          <div className="crm-inline-search" role="search">
            <i className="ti ti-search si" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por proposta, contato, empresa ou negócio…"
              aria-label="Buscar propostas"
            />
          </div>
          <button type="button" className="crm-btn-primary" onClick={openCreate}>
            <i className="ti ti-file-plus" style={{ fontSize: 13 }} aria-hidden="true" />
            Nova proposta
          </button>
        </div>
      </div>

      <div className="crm-card">
        <div className="crm-card-header">
          <i className="ti ti-file-text" style={{ color: 'var(--vesk-orange)', fontSize: 16 }} aria-hidden="true" />
          <div className="crm-card-title">Gestão</div>
          <span className="pipeline-badge">enviada · visualizada · aceita · recusada</span>
          <button type="button" className="crm-card-action" onClick={() => setIsTemplatesOpen(true)}>
            Modelos →
          </button>
        </div>

        <table className="crm-table" aria-label="Lista de propostas comerciais">
          <thead>
            <tr>
              <th>Proposta</th>
              <th>Contato</th>
              <th>Empresa</th>
              <th>Negócio</th>
              <th>Valor</th>
              <th>Status</th>
              <th>Enviada em</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const contactEmail = contacts.find((c) => c.id === p.contatoId)?.email?.trim();
              const emailSentAt = p.emailSentAt || localEmailSentAt[p.id];
              const sending = sendingEmailId === p.id;
              const feedback = emailFeedback?.id === p.id ? emailFeedback : null;
              const disabledReason = !p.contatoId
                ? 'Vincule um contato à proposta para enviar por e-mail'
                : !contactEmail
                  ? 'O contato não tem e-mail cadastrado'
                  : '';

              return (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>
                    {p.titulo}
                    {p.templateId && templateById.get(p.templateId) ? (
                      <div style={{ fontWeight: 400, fontSize: 11, color: 'var(--vesk-muted)', marginTop: 2 }}>
                        <i className="ti ti-file-text" style={{ fontSize: 11 }} aria-hidden="true" />{' '}
                        {templateById.get(p.templateId)?.nome}
                      </div>
                    ) : null}
                    {emailSentAt ? (
                      <div style={{ fontWeight: 400, fontSize: 11, color: '#4caf82', marginTop: 2 }}>
                        <i className="ti ti-mail-check" style={{ fontSize: 11 }} aria-hidden="true" /> Enviado por e-mail em{' '}
                        {new Date(emailSentAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </div>
                    ) : null}
                    {feedback && !feedback.ok ? (
                      <div style={{ fontWeight: 400, fontSize: 11, color: '#e05252', marginTop: 2 }}>
                        <i className="ti ti-alert-circle" style={{ fontSize: 11 }} aria-hidden="true" /> {feedback.message}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ color: 'var(--vesk-muted)' }}>{getContactName(p.contatoId)}</td>
                  <td style={{ color: 'var(--vesk-muted)' }}>{getCompanyName(p.empresaId)}</td>
                  <td style={{ color: 'var(--vesk-muted)' }}>{p.dealId ? getDealTitle(p.dealId) : '—'}</td>
                  <td style={{ fontFamily: 'var(--font-head)', color: 'var(--vesk-orange)' }}>{p.valor}</td>
                  <td>{statusPill(p.status)}</td>
                  <td style={{ color: 'var(--vesk-muted)' }}>{p.enviadaEm}</td>
                  <td>
                    <div className="crm-row-actions">
                      <button
                        type="button"
                        className="crm-action-btn"
                        onClick={() => void handleSendEmail(p)}
                        disabled={sending || !!disabledReason}
                        title={disabledReason || (emailSentAt ? 'Reenviar por e-mail' : 'Enviar por e-mail')}
                        aria-label={`Enviar ${p.titulo} por e-mail`}
                      >
                        <i className={`ti ${sending ? 'ti-loader-2 wa-spin' : 'ti-send'}`} aria-hidden="true" />
                        {sending ? 'Enviando…' : emailSentAt ? 'Reenviar' : 'Enviar e-mail'}
                      </button>
                      <button type="button" className="crm-action-btn" onClick={() => openEdit(p.id)} aria-label={`Editar ${p.titulo}`}>
                        <i className="ti ti-pencil" aria-hidden="true" />
                        Editar
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ color: 'var(--vesk-muted)', padding: 14 }}>
                  Nenhuma proposta encontrada.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Modal
        open={isCreateOpen}
        wide
        title="Nova proposta"
        description="Crie uma proposta e vincule a um contato/negócio."
        onClose={() => setIsCreateOpen(false)}
      >
        <form className="crm-form" onSubmit={createProposal}>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="p_titulo">Título</label>
            <input id="p_titulo" value={form.titulo} onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))} required />
          </div>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="p_tpl">Modelo (opcional)</label>
            <select id="p_tpl" value={form.templateId} onChange={(e) => selectTemplate(e.target.value)}>
              <option value="">— Sem modelo —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </div>
          {templateFieldInputs('p_field')}
          <div className="crm-field">
            <label htmlFor="p_cont">Contato</label>
            <select
              id="p_cont"
              value={form.contatoId}
              onChange={(e) => {
                const contatoId = e.target.value;
                const c = contacts.find((x) => x.id === contatoId);
                setForm((p) => ({
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
            <label htmlFor="p_emp">Empresa</label>
            <select id="p_emp" value={form.empresaId} onChange={(e) => setForm((p) => ({ ...p, empresaId: e.target.value }))}>
              <option value="">— Selecione —</option>
              {allowedCompanies.map((co) => (
                <option key={co.id} value={co.id}>
                  {co.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="p_neg">Negócio (pipeline)</label>
            <select id="p_neg" value={form.dealId} onChange={(e) => setForm((p) => ({ ...p, dealId: e.target.value }))}>
              <option value="">— Selecione —</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.titulo} · {getCompanyName(d.empresaId)}
                </option>
              ))}
            </select>
          </div>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="p_val">Valor</label>
            <input id="p_val" value={form.valor} onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))} placeholder="Ex: R$95.000" />
          </div>

          <div className="crm-form-actions" style={{ gridColumn: '1 / -1' }}>
            <button type="button" className="crm-btn-secondary" onClick={() => setIsCreateOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="crm-btn-primary" style={{ marginLeft: 'auto' }}>
              Criar proposta
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={isEditOpen}
        wide
        title="Editar proposta"
        description="Atualize campos e vínculos da proposta."
        onClose={() => setIsEditOpen(false)}
      >
        <form className="crm-form" onSubmit={saveEdit}>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="ep_titulo">Título</label>
            <input id="ep_titulo" value={form.titulo} onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))} required />
          </div>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="ep_tpl">Modelo (opcional)</label>
            <select id="ep_tpl" value={form.templateId} onChange={(e) => selectTemplate(e.target.value)}>
              <option value="">— Sem modelo —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </div>
          {templateFieldInputs('ep_field')}
          <div className="crm-field">
            <label htmlFor="ep_cont">Contato</label>
            <select
              id="ep_cont"
              value={form.contatoId}
              onChange={(e) => {
                const contatoId = e.target.value;
                const c = contacts.find((x) => x.id === contatoId);
                setForm((p) => ({
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
            <label htmlFor="ep_emp">Empresa</label>
            <select id="ep_emp" value={form.empresaId} onChange={(e) => setForm((p) => ({ ...p, empresaId: e.target.value }))}>
              <option value="">— Selecione —</option>
              {allowedCompanies.map((co) => (
                <option key={co.id} value={co.id}>
                  {co.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="ep_neg">Negócio (pipeline)</label>
            <select id="ep_neg" value={form.dealId} onChange={(e) => setForm((p) => ({ ...p, dealId: e.target.value }))}>
              <option value="">— Selecione —</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.titulo} · {getCompanyName(d.empresaId)}
                </option>
              ))}
            </select>
          </div>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="ep_val">Valor</label>
            <input id="ep_val" value={form.valor} onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))} />
          </div>

          <div className="crm-form-actions" style={{ gridColumn: '1 / -1' }}>
            <button type="button" className="crm-btn-secondary" onClick={() => setIsEditOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="crm-btn-primary" style={{ marginLeft: 'auto' }}>
              Salvar alterações
            </button>
          </div>
        </form>
      </Modal>

      <ProposalTemplatesModal open={isTemplatesOpen} onClose={closeTemplatesModal} />
    </CrmLayout>
  );
};

export default Propostas;
