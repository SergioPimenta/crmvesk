import { useEffect, useRef, useState } from 'react';
import { fmtNum, fmtPct, rate } from './format';
import type { SiteOverview } from './types';

export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function bucketLabel(bucket: string, hourly: boolean, long = false) {
  if (hourly) {
    const [date, hour] = bucket.split('T');
    const [, m, d] = date.split('-');
    return long ? `${d}/${m} às ${Number(hour)}h` : `${Number(hour)}h`;
  }
  const [y, m, d] = bucket.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (long) {
    return dt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
  }
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function niceMax(v: number) {
  if (v <= 4) return 4;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * mag >= v) return step * mag;
  return 10 * mag;
}

const PAD_L = 36;
const PAD_R = 8;
const TOP_H = 170;
const BOTTOM_H = 64;
const GAP = 26;
const AXIS_H = 20;

// Visitas (área) e contatos (barras) em dois painéis com o mesmo eixo de tempo: escalas diferentes, nunca eixo duplo.
const TrafficChart = ({ data }: { data: SiteOverview }) => {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const { series, range } = data;
  const n = series.length;
  const w = Math.max(width, 280);
  const plotW = w - PAD_L - PAD_R;
  const step = n > 1 ? plotW / (n - 1) : plotW;
  const xAt = (i: number) => PAD_L + (n > 1 ? i * step : plotW / 2);

  const maxS = niceMax(Math.max(1, ...series.map((s) => s.sessions)));
  const maxC = niceMax(Math.max(1, ...series.map((s) => s.conversions)));
  const yS = (v: number) => TOP_H - (v / maxS) * (TOP_H - 8);
  const bottomTop = TOP_H + GAP;
  const yC = (v: number) => bottomTop + BOTTOM_H - (v / maxC) * BOTTOM_H;
  const totalH = bottomTop + BOTTOM_H + AXIS_H;

  const line = series.map((s, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)},${yS(s.sessions).toFixed(1)}`).join(' ');
  const area = n ? `${line} L${xAt(n - 1).toFixed(1)},${TOP_H} L${xAt(0).toFixed(1)},${TOP_H} Z` : '';
  const barW = Math.max(2, Math.min(18, step * 0.6));

  const tickEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 70))));
  const ticks = series.map((s, i) => ({ i, s })).filter(({ i }) => i % tickEvery === 0);

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const box = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const x = e.clientX - box.left;
    const i = Math.round((x - (n > 1 ? 0 : plotW / 2)) / (n > 1 ? step : 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const h = hover != null ? series[hover] : null;
  const tipLeft = hover != null ? Math.min(Math.max(xAt(hover), 90), w - 90) : 0;

  return (
    <div className="sa-chart" ref={wrapRef}>
      <div className="sa-legend">
        <span><i className="sa-key sa-key-visits" aria-hidden="true" />Visitas</span>
        <span><i className="sa-key sa-key-contacts" aria-hidden="true" />Contatos (formulário, WhatsApp, telefone)</span>
      </div>
      {width > 0 ? (
        <svg width={w} height={totalH} role="img" aria-label="Visitas e contatos ao longo do período">
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line className="sa-gridline" x1={PAD_L} x2={w - PAD_R} y1={yS(maxS * f)} y2={yS(maxS * f)} />
              <text className="sa-axis" x={PAD_L - 6} y={yS(maxS * f) + 3} textAnchor="end">{fmtNum(maxS * f)}</text>
            </g>
          ))}
          <path d={area} className="sa-area-visits" />
          <path d={line} className="sa-line-visits" />

          <line className="sa-gridline" x1={PAD_L} x2={w - PAD_R} y1={yC(0)} y2={yC(0)} />
          <text className="sa-axis" x={PAD_L - 6} y={yC(maxC) + 8} textAnchor="end">{fmtNum(maxC)}</text>
          <text className="sa-axis" x={PAD_L - 6} y={yC(0) + 3} textAnchor="end">0</text>
          {series.map((s, i) =>
            s.conversions > 0 ? (
              <rect
                key={s.bucket}
                className="sa-bar-contacts"
                x={xAt(i) - barW / 2}
                y={yC(s.conversions)}
                width={barW}
                height={Math.max(2, yC(0) - yC(s.conversions))}
                rx={Math.min(4, barW / 2)}
              />
            ) : null
          )}

          {ticks.map(({ i, s }) => (
            <text key={s.bucket} className="sa-axis" x={xAt(i)} y={totalH - 4} textAnchor="middle">
              {bucketLabel(s.bucket, range.hourly)}
            </text>
          ))}

          {hover != null ? (
            <g>
              <line className="sa-crosshair" x1={xAt(hover)} x2={xAt(hover)} y1={0} y2={yC(0)} />
              <circle className="sa-dot-visits" cx={xAt(hover)} cy={yS(series[hover].sessions)} r={4.5} />
            </g>
          ) : null}
          <rect
            x={PAD_L}
            y={0}
            width={plotW}
            height={yC(0)}
            fill="transparent"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          />
        </svg>
      ) : (
        <div style={{ height: totalH }} />
      )}
      {h ? (
        <div className="sa-tip" style={{ left: tipLeft, top: 18 }}>
          <div className="sa-tip-title">{bucketLabel(h.bucket, range.hourly, true)}</div>
          <div><i className="sa-key sa-key-visits" />{fmtNum(h.sessions)} visitas</div>
          <div><i className="sa-key sa-key-contacts" />{fmtNum(h.conversions)} contatos · {fmtPct(rate(h.conversions, h.sessions))}</div>
        </div>
      ) : null}
    </div>
  );
};

export default TrafficChart;
