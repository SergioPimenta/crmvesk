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

type FieldConfig = {
  enabled: boolean;
  selector: string;
  required: boolean;
};

type FieldConfigState = Record<CrmField, FieldConfig>;

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
  fieldConfig: FieldConfigState;
  pipelineId: string;
  stageKey: string;
  active: boolean;
};

const CRM_FIELD_DEFS: {
  crmField: CrmField;
  label: string;
  icon: string;
  hint: string;
  required?: boolean;
  defaultEnabled?: boolean;
}[] = [
  {
    crmField: 'nome',
    label: 'Nome',
    icon: 'ti-user',
    hint: 'Nome completo ou primeiro nome do visitante',
    required: true,
    defaultEnabled: true,
  },
  {
    crmField: 'email',
    label: 'E-mail',
    icon: 'ti-mail',
    hint: 'Endereço de e-mail para contato',
    defaultEnabled: true,
  },
  {
    crmField: 'telefone',
    label: 'Telefone',
    icon: 'ti-phone',
    hint: 'Telefone ou celular com DDD',
    defaultEnabled: true,
  },
  {
    crmField: 'mensagem',
    label: 'Mensagem',
    icon: 'ti-message',
    hint: 'Texto livre ou observações do formulário',
    defaultEnabled: true,
  },
  {
    crmField: 'empresa',
    label: 'Empresa',
    icon: 'ti-building',
    hint: 'Nome da empresa ou organização',
    defaultEnabled: false,
  },
];

const FORM_SELECTOR_PRESETS = [
  { label: 'Qualquer formulário', value: 'form' },
  { label: '#contact-form', value: '#contact-form' },
  { label: '.contact-form', value: '.contact-form' },
  { label: '#form-contato', value: '#form-contato' },
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

const CRM_FIELD_LABEL: Record<CrmField, string> = {
  nome: 'Nome',
  email: 'E-mail',
  telefone: 'Telefone',
  mensagem: 'Mensagem',
  empresa: 'Empresa',
};

function defaultFieldConfig(def: (typeof CRM_FIELD_DEFS)[number]): FieldConfig {
  const defaultMapping = DEFAULT_FIELD_MAPPINGS.find((m) => m.crmField === def.crmField);
  return {
    enabled: def.defaultEnabled !== false,
    selector: defaultMapping?.selector || '',
    required: Boolean(def.required),
  };
}

function defaultFieldState(): FieldConfigState {
  return CRM_FIELD_DEFS.reduce((acc, def) => {
    acc[def.crmField] = defaultFieldConfig(def);
    return acc;
  }, {} as FieldConfigState);
}

function mappingsToFieldState(mappings: FieldMapping[]): FieldConfigState {
  const state = defaultFieldState();
  for (const def of CRM_FIELD_DEFS) {
    const mapping = mappings.find((m) => m.crmField === def.crmField);
    if (!mapping?.selector?.trim()) {
      if (def.defaultEnabled === false) {
        state[def.crmField].enabled = false;
      }
      continue;
    }
    state[def.crmField] = {
      enabled: true,
      selector: mapping.selector,
      required: Boolean(mapping.required ?? def.required),
    };
  }
  return state;
}

function fieldStateToMappings(state: FieldConfigState): FieldMapping[] {
  return CRM_FIELD_DEFS.flatMap((def) => {
    const cfg = state[def.crmField];
    if (!cfg.enabled) return [];
    const selector = cfg.selector.trim();
    if (!selector) return [];
    return [
      {
        crmField: def.crmField,
        selector,
        required: cfg.required,
        label: def.label,
      },
    ];
  });
}

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
    fieldConfig: defaultFieldState(),
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
      fieldConfig: defaultFieldState(),
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

  const updateFieldConfig = (crmField: CrmField, patch: Partial<FieldConfig>) => {
    setForm((prev) => ({
      ...prev,
      fieldConfig: {
        ...prev.fieldConfig,
        [crmField]: { ...prev.fieldConfig[crmField], ...patch },
      },
    }));
  };

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
      fieldConfig: widget.fieldMappings?.length
        ? mappingsToFieldState(widget.fieldMappings)
        : defaultFieldState(),
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.pipelineId || !form.stageKey) {
      setError('Selecione o funil e a etapa para os leads.');
      return;
    }

    const nomeCfg = form.fieldConfig.nome;
    if (!nomeCfg.enabled || !nomeCfg.selector.trim()) {
      setError('O campo Nome precisa estar ativo com um seletor CSS — é usado para identificar o lead.');
      return;
    }

    const mappings = fieldStateToMappings(form.fieldConfig);
    if (mappings.length === 0) {
      setError('Ative e configure ao menos um campo para rastrear.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = { ...form, fieldMappings: mappings };
      delete (payload as { fieldConfig?: FieldConfigState }).fieldConfig;
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
            Cadastre sites externos e indique como cada campo do formulário do site corresponde aos dados do CRM.
            Cada envio cria um lead em <strong>Contatos</strong> e um negócio no pipeline.
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
          Na maioria dos sites basta informar o atributo <code>name</code> de cada campo (ex.:{' '}
          <code>email</code>, <code>telefone</code>). Cole o script antes de <code>&lt;/head&gt;</code>.
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
                <label>Formulário rastreado</label>
                <code className="form-track-selector">{widget.formSelector || 'form'}</code>
              </div>

              <div className="wa-widget-field">
                <label>Campos mapeados</label>
                <div className="form-track-fields-summary">
                  {(widget.fieldMappings || [])
                    .filter((f) => f.selector?.trim())
                    .map((f) => (
                      <span key={f.crmField} className="form-track-field-chip">
                        <i className="ti ti-check" aria-hidden="true" />
                        {CRM_FIELD_LABEL[f.crmField] || f.label}
                      </span>
                    ))}
                </div>
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

      <Modal
        open={modalOpen}
        wide
        title={editing ? 'Editar rastreador de formulário' : 'Novo rastreador de formulário'}
        description="Informe o site, o formulário e o seletor CSS de cada campo do CRM."
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

          <div className="form-section-label">1 · Site</div>

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

          <div className="form-section-label">2 · Formulário no site</div>

          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="cf_form_selector">Qual formulário rastrear?</label>
            <input
              id="cf_form_selector"
              type="text"
              required
              placeholder="form"
              value={form.formSelector}
              onChange={(e) => setForm((f) => ({ ...f, formSelector: e.target.value }))}
            />
            <div className="form-selector-presets">
              {FORM_SELECTOR_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  className={`form-preset-chip${form.formSelector === preset.value ? ' active' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, formSelector: preset.value }))}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-field-map">
            <div className="form-section-label" style={{ marginTop: 0 }}>
              3 · Campos do formulário
            </div>
            <p className="form-field-map-intro">
              Para cada dado do CRM, informe o seletor CSS do campo no site. Separe múltiplos seletores por vírgula.
            </p>

            {CRM_FIELD_DEFS.map((def) => {
              const cfg = form.fieldConfig[def.crmField];
              const defaultSelector = DEFAULT_FIELD_MAPPINGS.find((m) => m.crmField === def.crmField)?.selector || '';

              return (
                <div key={def.crmField} className={`form-field-card${cfg.enabled ? '' : ' disabled'}`}>
                  <div className="form-field-card-top">
                    <div className="form-field-crm">
                      <span className="form-field-icon">
                        <i className={`ti ${def.icon}`} aria-hidden="true" />
                      </span>
                      <div>
                        <strong>
                          {def.label}
                          {def.required ? <span className="form-field-req">Obrigatório</span> : null}
                        </strong>
                        <span className="form-field-hint">{def.hint}</span>
                      </div>
                    </div>
                    {!def.required ? (
                      <label className="form-field-toggle">
                        <input
                          type="checkbox"
                          checked={cfg.enabled}
                          onChange={(e) => updateFieldConfig(def.crmField, { enabled: e.target.checked })}
                        />
                        Rastrear
                      </label>
                    ) : null}
                  </div>

                  {cfg.enabled ? (
                    <div className="crm-field">
                      <label htmlFor={`cf_sel_${def.crmField}`}>Seletor CSS</label>
                      <input
                        id={`cf_sel_${def.crmField}`}
                        type="text"
                        placeholder={defaultSelector}
                        value={cfg.selector}
                        onChange={(e) => updateFieldConfig(def.crmField, { selector: e.target.value })}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="form-section-label">4 · Destino no CRM</div>

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
