import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../components/crm/Modal';
import CrmLayout from '../components/crm/CrmLayout';
import { useAuth } from '../contexts/AuthContext';
import { useCrmData } from '../contexts/CrmDataContext';

const formatDate = () => {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
};

const firstName = (name?: string) => {
  if (!name) return 'usuário';
  return name.trim().split(/\s+/)[0];
};

const Dashboard = () => {
  const { user } = useAuth();
  const {
    contacts,
    companies,
    deals,
    activities,
    pipelines,
    stages,
    activePipelineId,
    setActivePipelineId,
    getCompanyName,
  } = useCrmData();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Todos');
  const tabs = ['Todos', 'Leads', 'Clientes', 'Inativos'];
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const activePipeline = useMemo(
    () => pipelines.find((p) => p.id === activePipelineId) ?? pipelines[0] ?? null,
    [pipelines, activePipelineId]
  );

  const stagesForActive = useMemo(
    () =>
      stages
        .filter((s) => s.pipelineId === (activePipelineId ?? activePipeline?.id))
        .sort((a, b) => a.pos - b.pos),
    [stages, activePipelineId, activePipeline?.id]
  );

  const dealsForActive = useMemo(() => {
    const pid = activePipelineId ?? activePipeline?.id;
    if (!pid) return deals;
    return deals.filter((d) => d.pipelineId === pid);
  }, [deals, activePipelineId, activePipeline?.id]);

  const openDeals = dealsForActive.filter((d) => d.stageKey !== 'fechado');
  const closedDeals = dealsForActive.filter((d) => d.stageKey === 'fechado');
  const pendingContacts = contacts.filter((c) => c.precisaFollowUp).length;

  return (
    <CrmLayout>
      <div className="crm-page-header">
        <div>
          <div className="crm-page-title">
            Bom dia, <span>{firstName(user?.name)}</span> 👋
          </div>
          <div style={{ fontSize: 12, color: 'var(--vesk-muted)', marginTop: 2 }}>
            {formatDate()} · 3 tarefas pendentes
          </div>
        </div>
        <div className="crm-page-actions">
          <button type="button" className="crm-btn-secondary" onClick={() => setIsFilterOpen(true)}>
            <i className="ti ti-filter" style={{ fontSize: 13 }} aria-hidden="true" />
            Filtrar
          </button>
          <button type="button" className="crm-btn-primary" onClick={() => navigate('/admin/pipeline?newDeal=1')}>
            <i className="ti ti-plus" style={{ fontSize: 13 }} aria-hidden="true" />
            Novo negócio
          </button>
        </div>
      </div>

      <div className="crm-metrics">
        <div className="crm-metric">
          <div className="crm-metric-accent" />
          <i className="ti ti-trending-up crm-metric-icon" aria-hidden="true" />
          <div className="crm-metric-label">Empresas</div>
          <div className="crm-metric-value">{companies.length}</div>
          <div className="crm-metric-delta up">Cadastradas</div>
        </div>
        <div className="crm-metric">
          <div className="crm-metric-accent" style={{ background: '#378add' }} />
          <i className="ti ti-users crm-metric-icon" style={{ color: '#378add' }} aria-hidden="true" />
          <div className="crm-metric-label">Contatos</div>
          <div className="crm-metric-value">{contacts.length}</div>
          <div className="crm-metric-delta up">{pendingContacts} pendentes</div>
        </div>
        <div className="crm-metric">
          <div className="crm-metric-accent" style={{ background: '#4caf82' }} />
          <i className="ti ti-trophy crm-metric-icon" style={{ color: '#4caf82' }} aria-hidden="true" />
          <div className="crm-metric-label">Negócios fechados</div>
          <div className="crm-metric-value">{closedDeals.length}</div>
          <div className="crm-metric-delta up">No período</div>
        </div>
        <div className="crm-metric">
          <div className="crm-metric-accent" style={{ background: '#ef9f27' }} />
          <i className="ti ti-clock crm-metric-icon" style={{ color: '#ef9f27' }} aria-hidden="true" />
          <div className="crm-metric-label">Negócios em aberto</div>
          <div className="crm-metric-value">{openDeals.length}</div>
          <div className="crm-metric-delta down">Acompanhar</div>
        </div>
      </div>

      <div className="crm-card">
        <div className="crm-card-header">
          <i className="ti ti-layout-kanban" style={{ color: 'var(--vesk-orange)', fontSize: 16 }} aria-hidden="true" />
          <div className="crm-card-title">Pipeline de vendas</div>
          {pipelines.length > 0 ? (
            <select
              className="crm-btn-secondary dashboard-pipeline-select"
              value={activePipelineId ?? ''}
              onChange={(e) => setActivePipelineId(e.target.value || null)}
              aria-label="Selecionar funil"
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          ) : null}
          <span className="pipeline-badge">{openDeals.length} em aberto</span>
          <button type="button" className="crm-card-action" onClick={() => navigate('/admin/pipeline')}>
            Ver tudo →
          </button>
        </div>
        {pipelines.length === 0 ? (
          <div className="kanban-empty">
            Nenhum funil cadastrado.{' '}
            <button type="button" className="crm-card-action" onClick={() => navigate('/admin/pipeline')}>
              Criar funil →
            </button>
          </div>
        ) : stagesForActive.length === 0 ? (
          <div className="kanban-empty">
            Este funil ainda não tem etapas.{' '}
            <button type="button" className="crm-card-action" onClick={() => navigate('/admin/pipeline')}>
              Configurar etapas →
            </button>
          </div>
        ) : (
          <div
            className="pipeline-cols pipeline-cols-dynamic"
            style={{ gridTemplateColumns: `repeat(${stagesForActive.length}, minmax(0, 1fr))` }}
          >
            {stagesForActive.map((stage) => {
              const items = dealsForActive.filter((d) => d.stageKey === stage.stageKey).slice(0, 2);
              const total = dealsForActive.filter((d) => d.stageKey === stage.stageKey).length;
              return (
                <div key={stage.stageKey}>
                  <div className="pipeline-col-head">
                    <span className="pipeline-dot" style={{ background: stage.cor }} />
                    {stage.titulo} ({total})
                  </div>
                  {items.length === 0 ? <div className="kanban-empty">Sem cards</div> : null}
                  {items.map((d) => (
                    <div key={d.id} className="pipeline-deal">
                      <div className="pipeline-deal-name">{d.titulo}</div>
                      <div className="pipeline-deal-co">{getCompanyName(d.empresaId)}</div>
                      <div className="pipeline-deal-bottom">
                        <span className="pipeline-deal-val">{d.valor || '—'}</span>
                        <span className="pipeline-deal-prob">{d.prob || '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
        {dealsForActive.length === 0 && stagesForActive.length > 0 ? (
          <div className="kanban-empty" style={{ marginTop: 8 }}>
            Sem negócios neste funil.{' '}
            <button type="button" className="crm-card-action" onClick={() => navigate('/admin/pipeline?newDeal=1')}>
              Novo negócio →
            </button>
          </div>
        ) : null}
      </div>

      <div className="crm-two-col">
        <div className="crm-card">
          <div className="crm-card-header">
            <i className="ti ti-users" style={{ color: 'var(--vesk-orange)', fontSize: 16 }} aria-hidden="true" />
            <div className="crm-card-title">Contatos recentes</div>
            <button type="button" className="crm-card-action" onClick={() => navigate('/admin/contatos')}>
              Ver todos →
            </button>
          </div>
          <div className="crm-tabs">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                className={`crm-tab${activeTab === tab ? ' active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          <table className="crm-table" aria-label="Lista de contatos">
            <thead>
              <tr>
                <th>Contato</th>
                <th>Empresa</th>
                <th>Status</th>
                <th>Potencial</th>
              </tr>
            </thead>
            <tbody>
              {contacts.slice(0, 4).map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="contact-name-cell">
                      <div className="contact-av" style={{ background: '#e85d2422', color: 'var(--vesk-orange)' }}>
                        {c.nome
                          .trim()
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((p) => p[0]?.toUpperCase())
                          .join('')}
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{c.nome}</div>
                        <div style={{ fontSize: 10, color: 'var(--vesk-muted)' }}>{c.email || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ color: 'var(--vesk-muted)' }}>{getCompanyName(c.empresaId)}</td>
                  <td style={{ color: 'var(--vesk-muted)' }}>{c.tipo}</td>
                  <td>
                    <span className="pill-stage">{c.etapa}</span>
                  </td>
                </tr>
              ))}
              {contacts.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ color: 'var(--vesk-muted)', padding: 14 }}>
                    Nenhum contato cadastrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="crm-card">
          <div className="crm-card-header">
            <i className="ti ti-activity" style={{ color: 'var(--vesk-orange)', fontSize: 16 }} aria-hidden="true" />
            <div className="crm-card-title">Atividades</div>
            <button type="button" className="crm-card-action" aria-label="Nova atividade" onClick={() => navigate('/admin/agenda')}>
              +
            </button>
          </div>
          <div className="activity-list" role="log" aria-label="Feed de atividades recentes">
            {activities.slice(0, 6).map((a) => (
              <div key={a.id} className="activity-item">
                <div className={`activity-icon ${a.tipo === 'Ligação' ? 'call' : a.tipo === 'Reunião' ? 'deal' : a.tipo === 'Follow-up' ? 'email' : 'note'}`}>
                  <i className={a.tipo === 'Ligação' ? 'ti ti-phone' : a.tipo === 'Reunião' ? 'ti ti-users' : a.tipo === 'Follow-up' ? 'ti ti-refresh' : 'ti ti-checkbox'} aria-hidden="true" />
                </div>
                <div className="activity-body">
                  <div className="activity-text">
                    <strong>{a.titulo}</strong>
                  </div>
                  <div className="activity-time">{a.quando || '—'}</div>
                </div>
              </div>
            ))}
            {activities.length === 0 ? <div className="kanban-empty">Nenhuma atividade cadastrada.</div> : null}
          </div>
        </div>
      </div>

      <Modal
        open={isFilterOpen}
        title="Filtros (em breve)"
        description="Este protótipo ainda não aplica filtros reais no dashboard."
        onClose={() => setIsFilterOpen(false)}
      >
        <div style={{ color: 'var(--vesk-muted)', fontSize: 12 }}>
          Próximo passo: escolher período, vendedor, status do funil e origem do lead.
        </div>
        <div className="crm-form-actions" style={{ marginTop: 12 }}>
          <button type="button" className="crm-btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setIsFilterOpen(false)}>
            Entendi
          </button>
        </div>
      </Modal>
    </CrmLayout>
  );
};

export default Dashboard;
