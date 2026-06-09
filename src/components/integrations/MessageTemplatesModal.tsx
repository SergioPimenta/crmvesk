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
          <div className="crm-card wa-templates-list">
            <table className="crm-table" aria-label={`Modelos ${TAB_LABELS[activeTab]}`}>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Idioma</th>
                  <th>Categoria</th>
                  <th>Conteúdo</th>
                  {activeTab === 'rejected' ? <th>Motivo</th> : null}
                </tr>
              </thead>
              <tbody>
                {list.map((template) => (
                  <tr key={`${template.id}-${template.language}`}>
                    <td style={{ fontWeight: 600 }}>{template.name}</td>
                    <td style={{ color: 'var(--vesk-muted)' }}>{template.language}</td>
                    <td>
                      <span className="pill-stage">{categoryLabel(template.category)}</span>
                    </td>
                    <td style={{ color: 'var(--vesk-muted)', maxWidth: 320 }}>
                      <span className="wa-template-body">{template.body || '—'}</span>
                    </td>
                    {activeTab === 'rejected' ? (
                      <td style={{ color: '#e05252', maxWidth: 220 }}>{template.rejectedReason || '—'}</td>
                    ) : null}
                  </tr>
                ))}
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={activeTab === 'rejected' ? 5 : 4} style={{ color: 'var(--vesk-muted)', padding: 14 }}>
                      Nenhum modelo {TAB_LABELS[activeTab].toLowerCase()}.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
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
