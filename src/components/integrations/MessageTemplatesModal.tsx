import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../crm/Modal';
import { api } from '../../services/api';

type TemplateTab = 'approved' | 'rejected' | 'pending';

type WaMessageTemplate = {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  body: string;
  rejectedReason: string;
  qualityScore: string | null;
};

type TemplatesResponse = {
  wabaId: string;
  total: number;
  groups: {
    approved: WaMessageTemplate[];
    rejected: WaMessageTemplate[];
    pending: WaMessageTemplate[];
    other: WaMessageTemplate[];
  };
};

const TAB_LABELS: Record<TemplateTab, string> = {
  approved: 'Aprovados',
  rejected: 'Rejeitados',
  pending: 'Em análise',
};

const categoryLabel = (value: string) => {
  if (value === 'MARKETING') return 'Marketing';
  if (value === 'UTILITY') return 'Utilidade';
  if (value === 'AUTHENTICATION') return 'Autenticação';
  return value || '—';
};

const categoryClass = (value: string) => {
  if (value === 'MARKETING') return 'marketing';
  if (value === 'UTILITY') return 'utility';
  if (value === 'AUTHENTICATION') return 'authentication';
  return 'default';
};

const languageLabel = (value: string) => {
  if (value === 'pt_BR') return 'PT-BR';
  if (value === 'en_US') return 'EN-US';
  if (value === 'es') return 'ES';
  return value.replace('_', '-');
};

type Props = {
  open: boolean;
  onClose: () => void;
};

const MessageTemplatesModal = ({ open, onClose }: Props) => {
  const [activeTab, setActiveTab] = useState<TemplateTab>('approved');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<TemplatesResponse | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<TemplatesResponse>('/whatsapp/templates');
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar modelos');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setActiveTab('approved');
    void loadTemplates();
  }, [open, loadTemplates]);

  const list = useMemo(() => {
    if (!data) return [];
    if (activeTab === 'approved') return data.groups.approved;
    if (activeTab === 'rejected') return data.groups.rejected;
    return data.groups.pending;
  }, [activeTab, data]);

  const counts = useMemo(
    () => ({
      approved: data?.groups.approved.length ?? 0,
      rejected: data?.groups.rejected.length ?? 0,
      pending: data?.groups.pending.length ?? 0,
    }),
    [data]
  );

  return (
    <Modal
      open={open}
      wide
      title="Modelos de mensagem"
      description="Modelos cadastrados na Meta para envio fora da janela de 24 horas."
      onClose={onClose}
    >
      <div className="wa-templates-modal">
        <div className="wa-templates-toolbar">
          <div className="crm-tabs wa-templates-tabs" aria-label="Status dos modelos">
            {(Object.keys(TAB_LABELS) as TemplateTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`crm-tab${activeTab === tab ? ' active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {TAB_LABELS[tab]} ({counts[tab]})
              </button>
            ))}
          </div>
          <button type="button" className="crm-btn-secondary wa-widget-btn" onClick={() => void loadTemplates()} disabled={loading}>
            <i className="ti ti-refresh" aria-hidden="true" />
            {loading ? 'Atualizando…' : 'Atualizar'}
          </button>
        </div>

        {error ? (
          <div className="integration-hint" style={{ marginBottom: 12, borderColor: '#e0525240', color: '#e05252' }}>
            <i className="ti ti-alert-circle" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        {loading && !data ? (
          <div className="kanban-empty" style={{ padding: 24 }}>
            Carregando modelos da Meta…
          </div>
        ) : (
          <div className="wa-templates-list">
            {list.length === 0 ? (
              <div className="wa-templates-empty">
                <i className="ti ti-template-off" aria-hidden="true" />
                <p>Nenhum modelo {TAB_LABELS[activeTab].toLowerCase()}.</p>
              </div>
            ) : (
              list.map((template) => (
                <article key={`${template.id}-${template.language}`} className="wa-template-row">
                  <header className="wa-template-row-head">
                    <div className="wa-template-row-title">
                      <span className="wa-template-row-icon" aria-hidden="true">
                        <i className="ti ti-template" />
                      </span>
                      <div>
                        <strong className="wa-template-row-name">{template.name}</strong>
                        <span className="wa-template-row-id">ID {template.id}</span>
                      </div>
                    </div>
                    <div className="wa-template-row-badges">
                      <span className="wa-template-lang">{languageLabel(template.language)}</span>
                      <span className={`wa-template-cat wa-template-cat--${categoryClass(template.category)}`}>
                        {categoryLabel(template.category)}
                      </span>
                    </div>
                  </header>
                  <div className="wa-template-row-body">
                    <span className="wa-template-row-body-label">Conteúdo</span>
                    <p>{template.body || '—'}</p>
                  </div>
                  {activeTab === 'rejected' && template.rejectedReason ? (
                    <div className="wa-template-row-reject">
                      <i className="ti ti-alert-circle" aria-hidden="true" />
                      <span>{template.rejectedReason}</span>
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </div>
        )}

        {data?.groups.other.length ? (
          <p className="wa-templates-footnote">
            {data.groups.other.length} modelo(s) com outro status ({data.groups.other.map((t) => t.status).join(', ')}) não
            exibidos nas abas acima.
          </p>
        ) : null}
      </div>
    </Modal>
  );
};

export default MessageTemplatesModal;
