import { useState } from 'react';
import { fmtNum, fmtPct, rate, STATE_NAMES } from './format';

// Mapa em grade: cada estado é um quadrado na posição aproximada (coluna, linha). Lê melhor que um mapa
// geográfico quando estados pequenos (DF, SE, AL) importam tanto quanto os grandes.
const GRID: Record<string, [number, number]> = {
  RR: [1, 0], AP: [2, 0],
  AM: [1, 1], PA: [2, 1], MA: [3, 1], CE: [4, 1], RN: [5, 1],
  AC: [0, 2], RO: [1, 2], TO: [2, 2], PI: [3, 2], PE: [4, 2], PB: [5, 2],
  MT: [1, 3], GO: [2, 3], DF: [3, 3], BA: [4, 3], AL: [5, 3],
  MS: [1, 4], SP: [2, 4], MG: [3, 4], ES: [4, 4], SE: [5, 4],
  PR: [2, 5], RJ: [3, 5],
  SC: [2, 6],
  RS: [2, 7],
};

type Region = { country: string; region: string; sessions: number; conversions: number };

const STEPS = 5;

const BrazilTileMap = ({ regions }: { regions: Region[] }) => {
  const [hover, setHover] = useState<string | null>(null);
  const br = new Map(regions.filter((r) => r.country === 'BR' && GRID[r.region]).map((r) => [r.region, r]));
  const max = Math.max(1, ...[...br.values()].map((r) => r.sessions));
  // Faixas em escala raiz quadrada: um estado dominante não apaga todos os outros.
  const step = (v: number) => (v <= 0 ? -1 : Math.min(STEPS - 1, Math.floor(Math.sqrt(v / max) * STEPS)));

  const hovered = hover ? br.get(hover) : null;

  return (
    <div className="sa-tilemap-wrap">
      <div className="sa-tilemap" role="img" aria-label="Mapa do Brasil com visitas por estado">
        {Object.entries(GRID).map(([uf, [col, row]]) => {
          const r = br.get(uf);
          const s = step(r?.sessions || 0);
          return (
            <div
              key={uf}
              className={`sa-tile sa-tile-${s < 0 ? 'none' : s}${hover === uf ? ' hover' : ''}`}
              style={{ gridColumn: col + 1, gridRow: row + 1 }}
              onMouseEnter={() => setHover(uf)}
              onMouseLeave={() => setHover(null)}
              aria-label={`${STATE_NAMES[uf]}: ${fmtNum(r?.sessions || 0)} visitas`}
            >
              <span className="sa-tile-uf">{uf}</span>
              {r ? <span className="sa-tile-n">{fmtNum(r.sessions)}</span> : null}
            </div>
          );
        })}
        <div className="sa-tilemap-info">
          {hover ? (
            <>
              <div className="sa-tip-title">{STATE_NAMES[hover]}</div>
              <div>{fmtNum(hovered?.sessions || 0)} visitas</div>
              <div>
                {fmtNum(hovered?.conversions || 0)} contatos · {fmtPct(rate(hovered?.conversions || 0, hovered?.sessions || 0))}
              </div>
            </>
          ) : (
            <div className="sa-muted">Passe o mouse sobre um estado</div>
          )}
        </div>
      </div>
      <div className="sa-scale" aria-hidden="true">
        <span>menos</span>
        {Array.from({ length: STEPS }, (_, i) => (
          <i key={i} className={`sa-tile-${i}`} />
        ))}
        <span>mais visitas</span>
      </div>
    </div>
  );
};

export default BrazilTileMap;
