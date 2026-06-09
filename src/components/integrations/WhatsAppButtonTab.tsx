import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../crm/Modal';
import { useCrmData } from '../../contexts/CrmDataContext';
import { api } from '../../services/api';

type WaWidget = {
  id: string;
  siteUrl: string;
  siteName: string;
  phone: string;
  monitorCode: string;
  message: string;
  pipelineId: string | null;
  stageKey: string;
  pipelineName: string;
  stageTitle: string;
  active: boolean;
  pageViews: number;
  buttonClicks: number;
  lastSeenAt: string | null;
  embedSnippet: string;
  scriptUrl: string;
};

type FormState = {
  siteUrl: string;
  siteName: string;
  phone: string;
  message: string;
  pipelineId: string;
  stageKey: string;
  active: boolean;
};

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const copyText = async (text: string) => {
  await navigator.clipboard.writeText(text);
};

const WhatsAppButtonTab = () => {
  const { pipelines, stages, activePipelineId } = useCrmData();
  const [widgets, setWidgets] = useState<WaWidget[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WaWidget | null>(null);
  const [form, setForm] = useState<FormState>({
    siteUrl: '',
    siteName: '',
    phone: '',
    message: 'Olá, gostaria de um atendimento personalizado?',
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
      phone: '',
      message: 'Olá, gostaria de um atendimento personalizado?',
      pipelineId,
      stageKey: firstStageKey(pipelineId),
      active: true,
    };
  }, [defaultPipelineId, firstStageKey]);

  const loadWidgets = useCallback(async () => {
    const data = await api.get<{ widgets: WaWidget[] }>('/whatsapp-button/widgets');
    setWidgets(data.widgets || []);
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError('');
      try {
        await loadWidgets();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar widgets');
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

  const openEdit = (widget: WaWidget) => {
    setEditing(widget);
    setForm({
      siteUrl: widget.siteUrl,
      siteName: widget.siteName,
      phone: widget.phone,
      message: widget.message || 'Olá, gostaria de um atendimento personalizado?',
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
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await api.put(`/whatsapp-button/widgets/${editing.id}`, form);
      } else {
        await api.post('/whatsapp-button/widgets', form);
      }
      await loadWidgets();
      closeModal();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (widget: WaWidget) => {
    if (!window.confirm(`Excluir o botão do site "${widget.siteName || widget.siteUrl}"?`)) return;
    try {
      await api.delete(`/whatsapp-button/widgets/${widget.id}`);
      await loadWidgets();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir');
    }
  };

  const handleCopy = async (widget: WaWidget, field: 'snippet' | 'code') => {
    const text = field === 'snippet' ? widget.embedSnippet : widget.monitorCode;
    await copyText(text);
    setCopiedId(`${widget.id}-${field}`);
    window.setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <>
      <div className="integration-panel">
        <div className="integration-panel-head">
          <div className="integration-brand whatsapp">
            <i className="ti ti-brand-whatsapp" aria-hidden="true" />
          </div>
          <div style={{ flex: 1 }}>
            <h3 className="integration-panel-title">Botão WhatsApp</h3>
            <p className="integration-panel-desc">
              Cadastre a URL do site e o número do WhatsApp. O script exibe um formulário de captura
              (nome, telefone e e-mail) antes de abrir o WhatsApp. Cada envio cria um lead em{' '}
              <strong>Contatos</strong> e um negócio no pipeline.
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
            Cole o código antes de <code>&lt;/head&gt;</code>. O script carrega de forma assíncrona e não
            bloqueia o carregamento da página.
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
            <p>Nenhum site cadastrado ainda.</p>
            <button type="button" className="crm-btn-primary" onClick={openCreate}>
              Cadastrar primeiro site
            </button>
          </div>
        ) : (
          <div className="wa-widget-grid" style={{ marginTop: 16 }}>
            {widgets.map((widget) => (
              <div key={widget.id} className="crm-card wa-widget-card">
                <div className="wa-widget-card-head">
                  <div>
                    <div className="wa-widget-site">{widget.siteName || widget.siteUrl}</div>
                    <a
                      href={widget.siteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="wa-widget-url"
                    >
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
                    <strong>{widget.buttonClicks}</strong>
                    <span>Cliques</span>
                  </div>
                  <div>
                    <strong>{formatDate(widget.lastSeenAt)}</strong>
                    <span>Último ping</span>
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
      </div>

      <Modal
        open={modalOpen}
        title={editing ? 'Editar botão WhatsApp' : 'Novo botão WhatsApp'}
        description="Informe o site externo e o número que receberá as mensagens."
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
            <label htmlFor="wa_site_url">URL do site</label>
            <input
              id="wa_site_url"
              type="url"
              required
              placeholder="https://meusite.com.br"
              value={form.siteUrl}
              onChange={(e) => setForm((f) => ({ ...f, siteUrl: e.target.value }))}
            />
          </div>

          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="wa_site_name">Nome do site (opcional)</label>
            <input
              id="wa_site_name"
              type="text"
              placeholder="Ex.: Loja Virtual"
              value={form.siteName}
              onChange={(e) => setForm((f) => ({ ...f, siteName: e.target.value }))}
            />
          </div>

          <div className="crm-field">
            <label htmlFor="wa_phone">WhatsApp (DDI + DDD + número)</label>
            <input
              id="wa_phone"
              type="tel"
              required
              placeholder="5511999999999"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>

          <div className="crm-field">
            <label htmlFor="wa_message">Mensagem de boas-vindas (popup e WhatsApp)</label>
            <input
              id="wa_message"
              type="text"
              placeholder="Olá, gostaria de um atendimento personalizado?"
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            />
          </div>

          <div className="crm-field">
            <label htmlFor="wa_pipeline">Funil</label>
            <select
              id="wa_pipeline"
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
            <label htmlFor="wa_stage">Etapa inicial</label>
            <select
              id="wa_stage"
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

          <div className="integration-hint" style={{ gridColumn: '1 / -1' }}>
            <i className="ti ti-info-circle" aria-hidden="true" />
            <span>Leads capturados por este botão entram no funil e etapa selecionados.</span>
          </div>

          {editing ? (
            <label className="crm-checkbox-label" style={{ gridColumn: '1 / -1' }}>
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              Widget ativo no site
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
    </>
  );
};

export default WhatsAppButtonTab;
