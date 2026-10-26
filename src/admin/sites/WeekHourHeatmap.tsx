import { useState } from 'react';
import { DOW_SHORT, fmtNum } from './format';

type Cell = { dow: number; hour: number; sessions: number; conversions: number };

const STEPS = 5;

// Dia da semana × hora: quando o site recebe mais visitas (Brasília).
const WeekHourHeatmap = ({ cells }: { cells: Cell[] }) => {
  const [hover, setHover] = useState<Cell | null>(null);
  const map = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c]));
  const max = Math.max(1, ...cells.map((c) => c.sessions));
  const step = (v: number) => (v <= 0 ? 'none' : String(Math.min(STEPS - 1, Math.floor((v / max) * STEPS))));
  const order = [1, 2, 3, 4, 5, 6, 0];

  return (
    <div className="sa-weekhour">
      <div className="sa-weekhour-grid" role="img" aria-label="Visitas por dia da semana e hora">
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="sa-weekhour-hour">{h % 3 === 0 ? `${h}h` : ''}</span>
        ))}
        {order.map((dow) => (
          <div key={dow} className="sa-weekhour-row">
            <span className="sa-weekhour-dow">{DOW_SHORT[dow]}</span>
            {Array.from({ length: 24 }, (_, hour) => {
              const c = map.get(`${dow}-${hour}`) || { dow, hour, sessions: 0, conversions: 0 };
              return (
                <span
                  key={hour}
                  className={`sa-wh-cell sa-tile-${step(c.sessions)}${hover?.dow === dow && hover?.hour === hour ? ' hover' : ''}`}
                  onMouseEnter={() => setHover(c)}
                  onMouseLeave={() => setHover(null)}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="sa-weekhour-foot">
        {hover ? (
          <span>
            <strong>{DOW_SHORT[hover.dow]} {hover.hour}h–{hover.hour + 1}h</strong> · {fmtNum(hover.sessions)} visitas ·{' '}
            {fmtNum(hover.conversions)} contatos
          </span>
        ) : (
          <span className="sa-muted">Passe o mouse para ver cada horário</span>
        )}
        <span className="sa-scale" aria-hidden="true">
          <span>menos</span>
          {Array.from({ length: STEPS }, (_, i) => (
            <i key={i} className={`sa-tile-${i}`} />
          ))}
          <span>mais</span>
        </span>
      </div>
    </div>
  );
};

export default WeekHourHeatmap;
