import { useState } from 'react';
import { fmtNum } from './format';

export type BarRow = {
  key: string;
  label: string;
  icon?: string;
  sub?: string;
  value: number;
  /** Coluna à direita (ex.: taxa de conversão). */
  aside?: string;
  asideTone?: 'good' | 'bad';
  detail?: string[];
};

type Props = {
  rows: BarRow[];
  empty?: string;
  valueSuffix?: string;
  asideHeader?: string;
  valueHeader?: string;
};

// Lista de barras horizontais (uma cor só: o comprimento é a informação; a identidade está no rótulo).
const BarList = ({ rows, empty = 'Sem dados no período.', valueSuffix = '', asideHeader, valueHeader }: Props) => {
  const [hover, setHover] = useState<string | null>(null);
  if (!rows.length) return <div className="sa-empty">{empty}</div>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="sa-barlist" role="table">
      {asideHeader || valueHeader ? (
        <div className="sa-barlist-head" role="row">
          <span role="columnheader" />
          <span role="columnheader">{valueHeader}</span>
          <span role="columnheader">{asideHeader}</span>
        </div>
      ) : null}
      {rows.map((r) => (
        <div
          key={r.key}
          className={`sa-barlist-row${hover === r.key ? ' hover' : ''}`}
          role="row"
          onMouseEnter={() => setHover(r.key)}
          onMouseLeave={() => setHover(null)}
        >
          <div className="sa-barlist-main" role="cell">
            <div className="sa-barlist-fill" style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }} />
            <span className="sa-barlist-label">
              {r.icon ? <i className={`ti ${r.icon}`} aria-hidden="true" /> : null}
              <span className="sa-ellipsis">{r.label}</span>
              {r.sub ? <span className="sa-barlist-sub">{r.sub}</span> : null}
            </span>
          </div>
          <div className="sa-barlist-value" role="cell">
            {fmtNum(r.value)}
            {valueSuffix}
          </div>
          <div className={`sa-barlist-aside${r.asideTone ? ` ${r.asideTone}` : ''}`} role="cell">
            {r.aside ?? ''}
          </div>
          {hover === r.key && r.detail?.length ? (
            <div className="sa-tip sa-tip-row">
              <div className="sa-tip-title">{r.label}</div>
              {r.detail.map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
};

export default BarList;
