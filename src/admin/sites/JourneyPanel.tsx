import { DEVICE_LABEL, fmtDuration, fmtNum, MEDIUM_LABEL, SOURCE_ICON } from './format';
import type { SiteOverview } from './types';

const CHANNEL: Record<string, { label: string; icon: string }> = {
  whatsapp: { label: 'WhatsApp', icon: 'ti-brand-whatsapp' },
  form: { label: 'Formulário', icon: 'ti-forms' },
  phone: { label: 'Telefone', icon: 'ti-phone' },
};

function Steps({ steps }: { steps: string[] }) {
  return (
    <span className="sa-steps">
      {steps.map((s, i) => (
        <span key={`${s}-${i}`} className={`sa-step${s.startsWith('★') ? ' goal' : ''}`}>
          {s.replace(/^★\s*/, '')}
        </span>
      ))}
    </span>
  );
}

export const TopJourneys = ({ data }: { data: SiteOverview }) => {
  if (!data.journeys.length) return <div className="sa-empty">Nenhum contato no período.</div>;
  const max = Math.max(...data.journeys.map((j) => j.sessions));
  return (
    <ul className="sa-journeys">
      {data.journeys.map((j) => (
        <li key={j.steps.join('>')}>
          <Steps steps={j.steps} />
          <span className="sa-journey-bar" aria-hidden="true">
            <span style={{ width: `${(j.sessions / max) * 100}%` }} />
          </span>
          <strong>{fmtNum(j.sessions)}</strong>
        </li>
      ))}
    </ul>
  );
};

export const RecentConversions = ({ data }: { data: SiteOverview }) => {
  if (!data.recentConversions.length) return <div className="sa-empty">Nenhum contato no período.</div>;
  return (
    <div className="sa-table-wrap">
      <table className="sa-table">
        <thead>
          <tr>
            <th>Quando</th>
            <th>Canal</th>
            <th>Origem</th>
            <th>Local</th>
            <th>Caminho até o contato</th>
            <th className="num">Tempo</th>
          </tr>
        </thead>
        <tbody>
          {data.recentConversions.map((c) => (
            <tr key={c.id}>
              <td>{new Date(c.startedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
              <td>
                <i className={`ti ${CHANNEL[c.channel].icon}`} aria-hidden="true" /> {CHANNEL[c.channel].label}
              </td>
              <td>
                <i className={`ti ${SOURCE_ICON[c.source] || 'ti-world'}`} aria-hidden="true" /> {c.source}
                <span className="sa-muted"> · {MEDIUM_LABEL[c.medium] || c.medium}</span>
              </td>
              <td>
                <i className={`ti ${DEVICE_LABEL[c.device]?.icon || 'ti-device-desktop'}`} title={DEVICE_LABEL[c.device]?.label} aria-hidden="true" />{' '}
                {[c.city, c.region].filter(Boolean).join(' · ') || <span className="sa-muted">—</span>}
              </td>
              <td>
                <Steps steps={c.steps.length ? c.steps : [c.landingPath]} />
              </td>
              <td className="num">{fmtDuration(c.duration)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
