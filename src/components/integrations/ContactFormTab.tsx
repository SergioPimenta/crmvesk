import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../crm/Modal';
import { useCrmData } from '../../contexts/CrmDataContext';
import { api } from '../../services/api';

type CrmField = 'nome' | 'email' | 'telefone' | 'mensagem' | 'empresa';

type FieldMapping = {
  crmField: CrmField;
  selector: string;
  required?: boolean;
  label: string;
};

type FormWidget = {
  id: string;
  siteUrl: string;
  siteName: string;
  monitorCode: string;
  formSelector: string;
  fieldMappings: FieldMapping[];
  pipelineId: string | null;
  stageKey: string;
  pipelineName: string;
  stageTitle: string;
  active: boolean;
  pageViews: number;
  formSubmissions: number;
  lastSeenAt: string | null;
  embedSnippet: string;
  scriptUrl: string;
};

type FormState = {
  siteUrl: string;
  siteName: string;
  formSelector: string;
  fieldMappings: FieldMapping[];
  pipelineId: string;
  stageKey: string;
  active: boolean;
};

const CRM_FIELD_OPTIONS: { value: CrmField; label: string }[] = [
  { value: 'nome', label: 'Nome' },
  { value: 'email', label: 'E-mail' },
  { value: 'telefone', label: 'Telefone' },
  { value: 'mensagem', label: 'Mensagem' },
  { value: 'empresa', label: 'Empresa' },
];

const DEFAULT_FIELD_MAPPINGS: FieldMapping[] = [
  { crmField: 'nome', selector: "input[name='nome'], input[name='name']", required: true, label: 'Nome' },
  { crmField: 'email', selector: "input[name='email'], input[type='email']", label: 'E-mail' },
  {
    crmField: 'telefone',
    selector: "input[name='telefone'], input[name='phone'], input[type='tel']",
    label: 'Telefone',
  },
  {
    crmField: 'mensagem',
    selector: "textarea[name='mensagem'], textarea[name='message'], textarea",
    label: 'Mensagem',
  },
  { crmField: 'empresa', selector: "input[name='empresa'], input[name='company']", label: 'Empresa' },
];

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const copyText = async (text: string) => {
  await navigator.clipboard.writeText(text);
};

const ContactFormTab = () => {
  const { pipelines, stages, activePipelineId } = useCrmData();
  const [widgets, setWidgets] = useState<FormWidget[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FormWidget | null>(null);
  const [form, setForm] = useState<FormState>({
    siteUrl: '',
    siteName: '',
    formSelector: 'form',
    fieldMappings: DEFAULT_FIELD_MAPPINGS,
    pipelineId: '',
    stageKey: 'prospeccao',
    active: true,
  });

  const defaultPipelineId = useMemo(
    () => activePipelineId || pipelines.find((p) => p.isDefault)?.id || pipelines[0]?.id || '',
    [pipelines, activePipelineId]
  );

  const firstStageKey = useCallback(
    (pipelineId: string) => {
      const list = stages.filter((s) => s.pipelineId === pipelineId).sort((a, b) => a.pos - b.pos);
      return list[0]?.stageKey || 'prospeccao';
    },
    [stages]
  );

  const stagesForForm = useMemo(
    () => stages.filter((s) => s.pipelineId === form.pipelineId).sort((a, b) => a.pos - b.pos),
    [stages, form.pipelineId]
  );

  const buildEmptyForm = useCallback((): FormState => {
    const pipelineId = defaultPipelineId;
    return {
      siteUrl: '',
      siteName: '',
      formSelector: 'form',
      fieldMappings: DEFAULT_FIELD_MAPPINGS.map((f) => ({ ...f })),
      pipelineId,
      stageKey: firstStageKey(pipelineId),
      active: true,
    };
  }, [defaultPipelineId, firstStageKey]);

  const loadWidgets = useCallback(async () => {
    const data = await api.get<{ widgets: FormWidget[] }>('/contact-form/widgets');
    setWidgets(data.widgets || []);
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError('');
      try {
        await loadWidgets();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar rastreadores');
      } finally {
        setLoading(false);
      }
    })();
  }, [loadWidgets]);

  const openCreate = () => {
    setEditing(null);
    setForm(buildEmptyForm());
    setError('');
    setModalOpen(true);
  };

  const openEdit = (widget: FormWidget) => {
    setEditing(widget);
    setForm({
      siteUrl: widget.siteUrl,
      siteName: widget.siteName,
      formSelector: widget.formSelector || 'form',
      fieldMappings: widget.fieldMappings?.length
        ? widget.fieldMappings.map((f) => ({ ...f }))
        : DEFAULT_FIELD_MAPPINGS.map((f) => ({ ...f })),
      pipelineId: widget.pipelineId || defaultPipelineId,
      stageKey: widget.stageKey || firstStageKey(widget.pipelineId || defaultPipelineId),
      active: widget.active,
    });
    setError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(buildEmptyForm());
  };

  const updateFieldMapping = (index: number, patch: Partial<FieldMapping>) => {
    setForm((prev) => ({
      ...prev,
      fieldMappings: prev.fieldMappings.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    }));
  };

  const addFieldMapping = () => {
    setForm((prev) => ({
      ...prev,
      fieldMappings: [
        ...prev.fieldMappings,
        { crmField: 'nome', selector: '', label: 'Campo personalizado' },
      ],
    }));
  };

  const removeFieldMapping = (index: number) => {
    setForm((prev) => ({
      ...prev,
      fieldMappings: prev.fieldMappings.filter((_, i) => i !== index),
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.pipelineId || !form.stageKey) {
      setError('Selecione o funil e a etapa para os leads.');
      return;
    }
    const mappings = form.fieldMappings.filter((f) => f.selector.trim());
    if (mappings.length === 0) {
      setError('Configure ao menos um seletor CSS de campo.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, fieldMappings: mappings };
      if (editing) {
        await api.put(`/contact-form/widgets/${editing.id}`, payload);
      } else {
        await api.post('/contact-form/widgets', payload);
      }
      await loadWidgets();
      closeModal();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (widget: FormWidget) => {
    if (!window.confirm(`Excluir o rastreador do site "${widget.siteName || widget.siteUrl}"?`)) return;
    try {
      await api.delete(`/contact-form/widgets/${widget.id}`);
      await loadWidgets();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir');
    }
  };

  const handleCopy = async (widget: FormWidget, field: 'snippet' | 'code') => {
    const text = field === 'snippet' ? widget.embedSnippet : widget.monitorCode;
    await copyText(text);
    setCopiedId(`${widget.id}-${field}`);
    window.setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="integration-panel">
      <div className="integration-panel-head">
        <div className="integration-brand form-track">
          <i className="ti ti-forms" aria-hidden="true" />
        </div>
        <div style={{ flex: 1 }}>
          <h3 className="integration-panel-title">Formulário de contato</h3>
          <p className="integration-panel-desc">
            Cadastre sites externos e mapeie os campos do formulário de contato (nome, e-mail, telefone, etc.).
            Cada envio cria um lead em <strong>Contatos</strong> e um negócio no pipeline — sem alterar o envio
            original do site.
          </p>
        </div>
        <button type="button" className="crm-btn-primary" onClick={openCreate}>
          <i className="ti ti-plus" aria-hidden="true" />
          Novo site
        </button>
      </div>

      <div className="integration-hint">
        <i className="ti ti-info-circle" aria-hidden="true" />
        <span>
          Cole o script antes de <code>&lt;/head&gt;</code>. Use seletores CSS para apontar cada campo do formulário
          (ex.: <code>input[name=&quot;email&quot;]</code>). Vários seletores podem ser separados por vírgula.
        </span>
      </div>

      {error && !modalOpen ? (
        <div className="integration-hint" style={{ marginTop: 12, borderColor: '#e0525240', color: '#e05252' }}>
          <i className="ti ti-alert-circle" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <div className="kanban-empty" style={{ marginTop: 16 }}>
          Carregando…
        </div>
      ) : widgets.length === 0 ? (
        <div className="wa-widget-empty" style={{ marginTop: 16 }}>
          <i className="ti ti-world-www" aria-hidden="true" />
          <p>Nenhum site com rastreamento de formulário cadastrado.</p>
          <button type="button" className="crm-btn-primary" onClick={openCreate}>
            Configurar primeiro site
          </button>
        </div>
      ) : (
        <div className="wa-widget-grid" style={{ marginTop: 16 }}>
          {widgets.map((widget) => (
            <div key={widget.id} className="crm-card wa-widget-card">
              <div className="wa-widget-card-head">
                <div>
                  <div className="wa-widget-site">{widget.siteName || widget.siteUrl}</div>
                  <a href={widget.siteUrl} target="_blank" rel="noopener noreferrer" className="wa-widget-url">
                    {widget.siteUrl}
                  </a>
                </div>
                <span className={`pill-status ${widget.active ? 'ok' : 'muted'}`}>
                  {widget.active ? 'Ativo' : 'Inativo'}
                </span>
              </div>

              <div className="wa-widget-stats">
                <div>
                  <strong>{widget.pageViews}</strong>
                  <span>Visualizações</span>
                </div>
                <div>
                  <strong>{widget.formSubmissions}</strong>
                  <span>Envios</span>
                </div>
                <div>
                  <strong>{formatDate(widget.lastSeenAt)}</strong>
                  <span>Último ping</span>
                </div>
              </div>

              <div className="wa-widget-field">
                <label>Seletor do formulário</label>
                <code className="form-track-selector">{widget.formSelector || 'form'}</code>
              </div>

              {(widget.pipelineName || widget.stageTitle) && (
                <div className="wa-widget-field">
                  <label>Destino no CRM</label>
                  <div className="wa-widget-funnel">
                    {widget.pipelineName || 'Funil padrão'} · {widget.stageTitle || widget.stageKey}
                  </div>
                </div>
              )}

              <div className="wa-widget-field">
                <label>Código de monitoramento</label>
                <div className="wa-widget-copy-row">
                  <code>{widget.monitorCode}</code>
                  <button
                    type="button"
                    className="crm-btn-secondary wa-widget-btn"
                    onClick={() => void handleCopy(widget, 'code')}
                  >
                    <i className="ti ti-copy" aria-hidden="true" />
                    {copiedId === `${widget.id}-code` ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>

              <div className="wa-widget-field">
                <label>Código para o &lt;head&gt; do site</label>
                <pre className="wa-widget-snippet">{widget.embedSnippet}</pre>
                <button
                  type="button"
                  className="crm-btn-secondary wa-widget-btn"
                  onClick={() => void handleCopy(widget, 'snippet')}
                >
                  <i className="ti ti-copy" aria-hidden="true" />
                  {copiedId === `${widget.id}-snippet` ? 'Copiado!' : 'Copiar código'}
                </button>
              </div>

              <div className="wa-widget-actions crm-row-actions">
                <button type="button" className="crm-action-btn" onClick={() => openEdit(widget)}>
                  <i className="ti ti-pencil" aria-hidden="true" />
                  Editar
                </button>
                <button
                  type="button"
                  className="crm-action-btn crm-action-btn-danger"
                  onClick={() => void handleDelete(widget)}
                >
                  <i className="ti ti-trash" aria-hidden="true" />
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="integration-features" style={{ marginTop: 20 }}>
        <div className="integration-feature">
          <i className="ti ti-forms" aria-hidden="true" />
          <div>
            <strong>Mapeamento de campos</strong>
            <span>CSS selectors por campo do CRM</span>
          </div>
        </div>
        <div className="integration-feature">
          <i className="ti ti-user-plus" aria-hidden="true" />
          <div>
            <strong>Lead automático</strong>
            <span>Contato + negócio a cada envio</span>
          </div>
        </div>
        <div className="integration-feature">
          <i className="ti ti-send" aria-hidden="true" />
          <div>
            <strong>Sem interferência</strong>
            <span>O formulário do site continua funcionando</span>
          </div>
        </div>
      </div>

      <Modal
        open={modalOpen}
        title={editing ? 'Editar rastreador de formulário' : 'Novo rastreador de formulário'}
        description="Configure o site e o mapeamento dos campos do formulário de contato."
        onClose={closeModal}
      >
        <form className="crm-form integration-form" onSubmit={(e) => void handleSave(e)}>
          {error ? (
            <div
              className="integration-hint"
              style={{ gridColumn: '1 / -1', marginBottom: 0, borderColor: '#e0525240', color: '#e05252' }}
            >
              <i className="ti ti-alert-circle" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="cf_site_url">URL do site</label>
            <input
              id="cf_site_url"
              type="url"
              required
              placeholder="https://meusite.com.br/contato"
              value={form.siteUrl}
              onChange={(e) => setForm((f) => ({ ...f, siteUrl: e.target.value }))}
            />
          </div>

          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="cf_site_name">Nome do site (opcional)</label>
            <input
              id="cf_site_name"
              type="text"
              placeholder="Ex.: Site institucional"
              value={form.siteName}
              onChange={(e) => setForm((f) => ({ ...f, siteName: e.target.value }))}
            />
          </div>

          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="cf_form_selector">Seletor CSS do formulário</label>
            <input
              id="cf_form_selector"
              type="text"
              required
              placeholder="form, #contact-form, .contact-form"
              value={form.formSelector}
              onChange={(e) => setForm((f) => ({ ...f, formSelector: e.target.value }))}
            />
          </div>

          <div className="form-field-map" style={{ gridColumn: '1 / -1' }}>
            <div className="form-field-map-head">
              <label>Mapeamento de campos</label>
              <button type="button" className="crm-btn-secondary wa-widget-btn" onClick={addFieldMapping}>
                <i className="ti ti-plus" aria-hidden="true" />
                Campo
              </button>
            </div>
            <div className="form-field-map-table">
              <div className="form-field-map-row form-field-map-header">
                <span>Campo CRM</span>
                <span>Seletor CSS</span>
                <span>Obrig.</span>
                <span />
              </div>
              {form.fieldMappings.map((mapping, index) => (
                <div key={`${mapping.crmField}-${index}`} className="form-field-map-row">
                  <select
                    value={mapping.crmField}
                    onChange={(e) =>
                      updateFieldMapping(index, {
                        crmField: e.target.value as CrmField,
                        label: CRM_FIELD_OPTIONS.find((o) => o.value === e.target.value)?.label || e.target.value,
                      })
                    }
                  >
                    {CRM_FIELD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="input[name='email']"
                    value={mapping.selector}
                    onChange={(e) => updateFieldMapping(index, { selector: e.target.value })}
                  />
                  <label className="crm-checkbox-label form-field-map-check">
                    <input
                      type="checkbox"
                      checked={Boolean(mapping.required)}
                      onChange={(e) => updateFieldMapping(index, { required: e.target.checked })}
                    />
                  </label>
                  <button
                    type="button"
                    className="crm-action-btn crm-action-btn-danger"
                    onClick={() => removeFieldMapping(index)}
                    aria-label="Remover campo"
                    disabled={form.fieldMappings.length <= 1}
                  >
                    <i className="ti ti-trash" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="crm-field">
            <label htmlFor="cf_pipeline">Funil</label>
            <select
              id="cf_pipeline"
              required
              value={form.pipelineId}
              onChange={(e) => {
                const pipelineId = e.target.value;
                setForm((f) => ({
                  ...f,
                  pipelineId,
                  stageKey: firstStageKey(pipelineId),
                }));
              }}
            >
              {pipelines.length === 0 ? (
                <option value="">Nenhum funil cadastrado</option>
              ) : (
                pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="crm-field">
            <label htmlFor="cf_stage">Etapa inicial</label>
            <select
              id="cf_stage"
              required
              value={form.stageKey}
              disabled={!form.pipelineId || stagesForForm.length === 0}
              onChange={(e) => setForm((f) => ({ ...f, stageKey: e.target.value }))}
            >
              {stagesForForm.length === 0 ? (
                <option value="">Sem etapas neste funil</option>
              ) : (
                stagesForForm.map((s) => (
                  <option key={s.id} value={s.stageKey}>
                    {s.titulo}
                  </option>
                ))
              )}
            </select>
          </div>

          {editing ? (
            <label className="crm-checkbox-label" style={{ gridColumn: '1 / -1' }}>
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              Rastreador ativo no site
            </label>
          ) : null}

          <div className="crm-form-actions" style={{ gridColumn: '1 / -1' }}>
            <button type="button" className="crm-btn-secondary" onClick={closeModal}>
              Cancelar
            </button>
            <button type="submit" className="crm-btn-primary" disabled={saving} style={{ marginLeft: 'auto' }}>
              {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Gerar código'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ContactFormTab;
