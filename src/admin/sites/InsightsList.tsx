import type { Insight, InsightSeverity } from './types';

const META: Record<InsightSeverity, { icon: string; label: string }> = {
  critical: { icon: 'ti-alert-octagon', label: 'Prioridade' },
  warning: { icon: 'ti-alert-triangle', label: 'Atenção' },
  tip: { icon: 'ti-bulb', label: 'Oportunidade' },
  positive: { icon: 'ti-circle-check', label: 'Funcionando' },
};

const InsightsList = ({ insights, limit }: { insights: Insight[]; limit?: number }) => {
  const list = limit ? insights.slice(0, limit) : insights;
  if (!list.length) return <div className="sa-empty">Nada a destacar neste período.</div>;
  return (
    <ul className="sa-insights">
      {list.map((i) => (
        <li key={i.id} className={`sa-insight sa-insight-${i.severity}`}>
          <i className={`ti ${META[i.severity].icon}`} aria-hidden="true" />
          <div>
            <div className="sa-insight-tag">{META[i.severity].label}</div>
            <div className="sa-insight-title">{i.title}</div>
            <div className="sa-insight-detail">{i.detail}</div>
            <div className="sa-insight-action">
              <strong>O que fazer:</strong> {i.action}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
};

export default InsightsList;
