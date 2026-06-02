import { useMemo } from 'react';
import CrmLayout from '../components/crm/CrmLayout';
import { useCrmData } from '../contexts/CrmDataContext';

type SellerPerf = { nome: string; fechado: number; conversao: number };
type LeadSource = { fonte: string; qtd: number };

const Relatorios = () => {
  const { contacts, deals, proposals } = useCrmData();
  const sellers: SellerPerf[] = useMemo(
    () => [],
    []
  );

  const sources: LeadSource[] = useMemo(
    () => [],
    []
  );

  const closed = deals.filter((d) => d.stageKey === 'fechado').length;
  const totalDeals = deals.length;
  const conversion = totalDeals > 0 ? Math.round((closed / totalDeals) * 100) : 0;
  const maxClosed = Math.max(1, ...sellers.map((s) => s.fechado));
  const maxSource = Math.max(1, ...sources.map((s) => s.qtd));

  return (
    <CrmLayout>
      <div className="crm-page-header">
        <div>
          <div className="crm-page-title">
            Relatórios <span>analytics</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--vesk-muted)', marginTop: 2 }}>
            Indicadores de desempenho para decisões baseadas em dados
          </div>
        </div>
        <div className="crm-page-actions">
          <button type="button" className="crm-btn-secondary">
            <i className="ti ti-download" style={{ fontSize: 13 }} aria-hidden="true" />
            Exportar
          </button>
          <button type="button" className="crm-btn-primary">
            <i className="ti ti-calendar" style={{ fontSize: 13 }} aria-hidden="true" />
            Período
          </button>
        </div>
      </div>

      <div className="crm-metrics">
        <div className="crm-metric">
          <div className="crm-metric-accent" />
          <i className="ti ti-percentage crm-metric-icon" aria-hidden="true" />
          <div className="crm-metric-label">Taxa de conversão</div>
          <div className="crm-metric-value">{conversion}%</div>
          <div className="crm-metric-delta up">{closed} / {totalDeals} negócios</div>
        </div>
        <div className="crm-metric">
          <div className="crm-metric-accent" style={{ background: '#4caf82' }} />
          <i className="ti ti-trophy crm-metric-icon" style={{ color: '#4caf82' }} aria-hidden="true" />
          <div className="crm-metric-label">Negócios fechados</div>
          <div className="crm-metric-value">{closed}</div>
          <div className="crm-metric-delta up">Total</div>
        </div>
        <div className="crm-metric">
          <div className="crm-metric-accent" style={{ background: '#378add' }} />
          <i className="ti ti-user-plus crm-metric-icon" style={{ color: '#378add' }} aria-hidden="true" />
          <div className="crm-metric-label">Leads no período</div>
          <div className="crm-metric-value">{contacts.filter((c) => c.tipo === 'Lead').length}</div>
          <div className="crm-metric-delta down">Contatos do tipo Lead</div>
        </div>
        <div className="crm-metric">
          <div className="crm-metric-accent" style={{ background: '#ef9f27' }} />
          <i className="ti ti-clock crm-metric-icon" style={{ color: '#ef9f27' }} aria-hidden="true" />
          <div className="crm-metric-label">Propostas</div>
          <div className="crm-metric-value">{proposals.length}</div>
          <div className="crm-metric-delta up">Enviadas/geridas</div>
        </div>
      </div>

      <div className="crm-two-col">
        <div className="crm-card">
          <div className="crm-card-header">
            <i className="ti ti-chart-bar" style={{ color: 'var(--vesk-orange)', fontSize: 16 }} aria-hidden="true" />
            <div className="crm-card-title">Performance por vendedor</div>
            <span className="pipeline-badge">fechados · conversão</span>
          </div>

          <div className="chart" role="img" aria-label="Gráfico de barras — performance por vendedor">
            {sellers.length === 0 ? <div className="kanban-empty">Sem dados por vendedor (ainda).</div> : null}
            {sellers.map((s) => (
              <div key={s.nome} className="chart-row">
                <div className="chart-label">{s.nome}</div>
                <div className="chart-bars">
                  <div className="chart-bar" style={{ width: `${Math.round((s.fechado / maxClosed) * 100)}%` }} />
                  <div className="chart-tag">{s.fechado} fechados</div>
                </div>
                <div className="chart-right">{s.conversao}%</div>
              </div>
            ))}
          </div>
        </div>

        <div className="crm-card">
          <div className="crm-card-header">
            <i className="ti ti-radar" style={{ color: 'var(--vesk-orange)', fontSize: 16 }} aria-hidden="true" />
            <div className="crm-card-title">Origem dos leads</div>
            <button type="button" className="crm-card-action">
              Ver detalhes →
            </button>
          </div>

          <div className="chart" role="img" aria-label="Gráfico de barras — origem dos leads">
            {sources.length === 0 ? <div className="kanban-empty">Sem dados de origem (ainda).</div> : null}
            {sources.map((s) => (
              <div key={s.fonte} className="chart-row">
                <div className="chart-label">{s.fonte}</div>
                <div className="chart-bars">
                  <div className="chart-bar alt" style={{ width: `${Math.round((s.qtd / maxSource) * 100)}%` }} />
                  <div className="chart-tag">{s.qtd}</div>
                </div>
                <div className="chart-right"> </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </CrmLayout>
  );
};

export default Relatorios;

