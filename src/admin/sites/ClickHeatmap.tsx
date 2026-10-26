import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../services/api';
import { fmtNum, fmtPct, KIND_META } from './format';
import { useElementWidth } from './TrafficChart';
import type { HeatmapDevice, SiteHeatmap } from './types';

const DEVICES: { id: HeatmapDevice; label: string; icon: string; width: number; viewH: number; radius: number }[] = [
  { id: 'desktop', label: 'Computador', icon: 'ti-device-desktop', width: 1280, viewH: 800, radius: 26 },
  { id: 'tablet', label: 'Tablet', icon: 'ti-device-tablet', width: 820, viewH: 1000, radius: 26 },
  { id: 'mobile', label: 'Celular', icon: 'ti-device-mobile', width: 390, viewH: 760, radius: 22 },
];

// Resolução do mapa de densidade (1/4 do tamanho real basta para manchas suaves).
const DOWNSCALE = 4;

type Mode = 'live' | 'static';

function buildDensity(points: SiteHeatmap['points'], width: number, docH: number, radius: number) {
  const w = Math.max(1, Math.round(width / DOWNSCALE));
  const h = Math.max(1, Math.round(docH / DOWNSCALE));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const r = radius / DOWNSCALE;
  for (const p of points) {
    if (p.rage) continue;
    const x = p.x * w;
    const y = p.y * h;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Densidade → cor: um único tom (laranja da marca), mais opaco e mais escuro onde há mais cliques.
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let max = 1;
  for (let i = 3; i < d.length; i += 4) if (d[i] > max) max = d[i];
  for (let i = 0; i < d.length; i += 4) {
    const t = d[i + 3] / max;
    if (t <= 0.02) {
      d[i + 3] = 0;
      continue;
    }
    const dark = Math.max(0, (t - 0.55) / 0.45);
    d[i] = Math.round(242 - 120 * dark);
    d[i + 1] = Math.round(131 - 89 * dark);
    d[i + 2] = Math.round(79 - 62 * dark);
    d[i + 3] = Math.round(255 * (0.25 + 0.7 * t));
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

type Props = { siteId: string; siteUrl: string; days: string };

const ClickHeatmap = ({ siteId, siteUrl, days }: Props) => {
  const [device, setDevice] = useState<HeatmapDevice>('desktop');
  const [path, setPath] = useState('');
  const [data, setData] = useState<SiteHeatmap | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSite, setShowSite] = useState(true);
  const [mode, setMode] = useState<Mode>('live');
  const [scrollY, setScrollY] = useState(0);
  const [liveDocH, setLiveDocH] = useState(0);
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; count: number } | null>(null);
  const [wrapRef, wrapW] = useElementWidth<HTMLDivElement>();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gotMessage = useRef(false);

  const dev = DEVICES.find((d) => d.id === device)!;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    const qs = new URLSearchParams({ days, device });
    if (path) qs.set('path', path);
    api
      .get<SiteHeatmap>(`/site-analytics/sites/${siteId}/heatmap?${qs}`)
      .then((res) => {
        if (!alive) return;
        setData(res);
        if (!path && res.path) setPath(res.path);
      })
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : 'Erro ao carregar mapa de calor'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [siteId, days, device, path]);

  const docH = mode === 'live' && liveDocH ? liveDocH : data?.pageHeight || 3000;
  const scale = wrapW > 0 ? Math.min(1, wrapW / dev.width) : 1;
  const maxScroll = Math.max(0, docH - dev.viewH);

  // A página dentro do iframe informa a rolagem e a altura reais (script de monitoramento em modo de prévia).
  useEffect(() => {
    gotMessage.current = false;
    setMode(showSite ? 'live' : 'static');
    setScrollY(0);
    setLiveDocH(0);
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const m = e.data as { veskPreview?: string; y?: number; h?: number };
      if (m?.veskPreview !== 'scroll') return;
      gotMessage.current = true;
      setScrollY(Number(m.y) || 0);
      if (m.h) setLiveDocH(Number(m.h));
    };
    window.addEventListener('message', onMessage);
    // Sem resposta (site antigo ou que bloqueia), a página é exibida inteira e rolada pelo próprio CRM.
    const timer = window.setTimeout(() => {
      if (!gotMessage.current) setMode('static');
    }, 4000);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
    };
  }, [path, device, showSite]);

  const density = useMemo(
    () => (data ? buildDensity(data.points, dev.width, docH, dev.radius) : null),
    [data, dev.width, dev.radius, docH]
  );

  const foldLines = useMemo(() => {
    if (!data?.scrollSessions) return [];
    return [75, 50, 25]
      .map((target) => {
        // Profundidade em que a fração de visitas que ainda está lendo cai para `target`%.
        const reach = data.scrollReach;
        for (let i = 1; i < reach.length; i++) {
          if (reach[i].share * 100 < target) {
            const a = reach[i - 1];
            const b = reach[i];
            const f = (a.share * 100 - target) / Math.max(0.0001, (a.share - b.share) * 100);
            return { target, depth: (a.depth + f * (b.depth - a.depth)) / 100 };
          }
        }
        return null;
      })
      .filter(Boolean) as { target: number; depth: number }[];
  }, [data]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !density) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = dev.width;
    canvas.height = dev.viewH;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    const sy = scrollY / DOWNSCALE;
    const sh = dev.viewH / DOWNSCALE;
    ctx.drawImage(density, 0, sy, density.width, sh, 0, 0, dev.width, dev.viewH);

    const css = getComputedStyle(canvas);
    const critical = css.getPropertyValue('--sa-critical').trim() || '#e05252';
    for (const p of data?.points || []) {
      if (!p.rage) continue;
      const y = p.y * docH - scrollY;
      if (y < -20 || y > dev.viewH + 20) continue;
      ctx.beginPath();
      ctx.arc(p.x * dev.width, y, 9, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = critical;
      ctx.stroke();
    }

    // Texto em tamanho legível depois da redução do quadro.
    const fs = Math.round(12 / scale);
    ctx.font = `600 ${fs}px "DM Sans", system-ui, sans-serif`;
    for (const line of foldLines) {
      const y = line.depth * docH - scrollY;
      if (y < 0 || y > dev.viewH) continue;
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(20,20,22,0.85)';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(dev.width, y);
      ctx.stroke();
      ctx.setLineDash([]);
      const label = `${line.target}% dos visitantes chegam até aqui`;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(20,20,22,0.88)';
      ctx.fillRect(8, y - fs * 1.9, tw + fs * 1.2, fs * 1.7);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, 8 + fs * 0.6, y - fs * 0.65);
    }
  }, [density, dev.width, dev.viewH, scrollY, data, docH, foldLines, scale]);

  useEffect(draw, [draw]);

  const scrollBy = (dy: number) => {
    if (mode === 'live') {
      iframeRef.current?.contentWindow?.postMessage({ veskPreview: 'scrollBy', dy }, '*');
    } else {
      setScrollY((y) => Math.max(0, Math.min(maxScroll, y + dy)));
    }
  };

  // Roda do mouse sobre o quadro rola o site lá dentro; nas pontas, devolve a rolagem para a página do CRM.
  const stageRef = useRef<HTMLDivElement>(null);
  const scrollState = useRef({ scrollY, maxScroll, scrollBy });
  scrollState.current = { scrollY, maxScroll, scrollBy };
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const { scrollY: y, maxScroll: max, scrollBy: by } = scrollState.current;
      if (max <= 0) return;
      if ((y <= 0 && e.deltaY < 0) || (y >= max - 1 && e.deltaY > 0)) return;
      e.preventDefault();
      by(e.deltaY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!data) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - box.left) / scale;
    const y = (e.clientY - box.top) / scale + scrollY;
    const R = 40;
    let count = 0;
    for (const p of data.points) {
      const dx = p.x * dev.width - x;
      const dy = p.y * docH - y;
      if (dx * dx + dy * dy <= R * R) count += 1;
    }
    setHoverInfo({ x: (e.clientX - box.left) / scale, y: (e.clientY - box.top) / scale, count });
  };

  const pageUrl = useMemo(() => {
    try {
      const u = new URL(path || '/', siteUrl);
      u.searchParams.set('vesk_preview', '1');
      return u.toString();
    } catch {
      return '';
    }
  }, [siteUrl, path]);

  const clicksTotal = data?.points.filter((p) => !p.rage).length || 0;
  const rageTotal = data?.points.filter((p) => p.rage).length || 0;

  return (
    <div className="sa-heatmap">
      <div className="sa-heatmap-controls">
        <div className="crm-field sa-heatmap-page">
          <label htmlFor="sa-heatmap-page">Página</label>
          <select id="sa-heatmap-page" value={path} onChange={(e) => setPath(e.target.value)}>
            {(data?.pages.length ? data.pages : [{ path: path || '/', views: 0, clicks: 0 }]).map((p) => (
              <option key={p.path} value={p.path}>
                {p.path} — {fmtNum(p.views)} visualizações
              </option>
            ))}
          </select>
        </div>
        <div className="sa-segmented" role="group" aria-label="Dispositivo">
          {DEVICES.map((d) => (
            <button
              key={d.id}
              type="button"
              className={device === d.id ? 'active' : ''}
              onClick={() => setDevice(d.id)}
              aria-pressed={device === d.id}
            >
              <i className={`ti ${d.icon}`} aria-hidden="true" /> {d.label}
            </button>
          ))}
        </div>
        <label className="crm-checkbox-label sa-heatmap-toggle">
          <input type="checkbox" checked={showSite} onChange={(e) => setShowSite(e.target.checked)} />
          Mostrar o site ao fundo
        </label>
        {pageUrl ? (
          <a className="crm-btn-secondary" href={pageUrl.replace(/[?&]vesk_preview=1/, '')} target="_blank" rel="noreferrer">
            <i className="ti ti-external-link" aria-hidden="true" /> Abrir página
          </a>
        ) : null}
      </div>

      {error ? <div className="sa-error">{error}</div> : null}

      <div className="sa-heatmap-body">
        <div className="sa-heatmap-stage-wrap" ref={wrapRef}>
          <div
            ref={stageRef}
            className={`sa-heatmap-stage${loading ? ' loading' : ''}`}
            style={{ width: dev.width * scale, height: dev.viewH * scale }}
          >
            <div
              className="sa-heatmap-inner"
              style={{ width: dev.width, height: dev.viewH, transform: `scale(${scale})` }}
            >
              {showSite && pageUrl ? (
                <iframe
                  key={`${pageUrl}-${device}`}
                  ref={iframeRef}
                  title="Prévia da página"
                  src={pageUrl}
                  width={dev.width}
                  height={mode === 'live' ? dev.viewH : docH}
                  style={mode === 'static' ? { transform: `translateY(${-scrollY}px)` } : undefined}
                  sandbox="allow-scripts allow-same-origin"
                  scrolling={mode === 'live' ? 'yes' : 'no'}
                  tabIndex={-1}
                />
              ) : (
                <div className="sa-heatmap-wire" style={{ transform: `translateY(${-scrollY}px)`, height: docH }} />
              )}
              <canvas
                ref={canvasRef}
                className="sa-heatmap-canvas"
                width={dev.width}
                height={dev.viewH}
                onMouseMove={onMove}
                onMouseLeave={() => setHoverInfo(null)}
              />
              {hoverInfo ? (
                <div
                  className="sa-tip"
                  style={{ left: Math.min(hoverInfo.x + 14, dev.width - 170), top: hoverInfo.y + 14, transform: `scale(${1 / scale})`, transformOrigin: 'top left' }}
                >
                  {fmtNum(hoverInfo.count)} cliques nesta área
                </div>
              ) : null}
            </div>
            {maxScroll > 0 ? (
              <div className="sa-heatmap-scrollbar" aria-hidden="true">
                <div
                  style={{
                    top: `${(scrollY / docH) * 100}%`,
                    height: `${Math.max(4, (dev.viewH / docH) * 100)}%`,
                  }}
                />
              </div>
            ) : null}
          </div>
          <div className="sa-heatmap-legend">
            <span><i className="sa-key sa-key-heat" aria-hidden="true" />{fmtNum(clicksTotal)} cliques</span>
            <span><i className="sa-key sa-key-rage" aria-hidden="true" />{fmtNum(rageTotal)} cliques de frustração (3+ seguidos)</span>
            <span className="sa-muted">Role sobre o quadro para descer a página</span>
          </div>
          {showSite ? (
            <div className="sa-muted sa-small">
              {mode === 'static'
                ? 'Exibindo a página inteira: pontos alinhados pela altura média registrada. Se o site não aparecer, ele bloqueia exibição dentro de outros sites — os pontos continuam valendo.'
                : 'Site ao vivo, sincronizado com a rolagem.'}
            </div>
          ) : null}
        </div>

        <div className="sa-heatmap-side">
          <div className="sa-side-block">
            <div className="sa-side-title">Até onde rolam</div>
            {data?.scrollSessions ? (
              <div className="sa-reach">
                {data.scrollReach.filter((r) => r.depth > 0).map((r) => (
                  <div key={r.depth} className="sa-reach-row" title={`${fmtPct(r.share)} chegam a ${r.depth}% da página`}>
                    <span>{r.depth}%</span>
                    <div className="sa-reach-track">
                      <div style={{ width: `${r.share * 100}%` }} />
                    </div>
                    <strong>{fmtPct(r.share, 0)}</strong>
                  </div>
                ))}
                <div className="sa-muted sa-small">{fmtNum(data.scrollSessions)} visitas nesta página</div>
              </div>
            ) : (
              <div className="sa-empty">Sem dados de rolagem.</div>
            )}
          </div>
          <div className="sa-side-block">
            <div className="sa-side-title">Mais clicados nesta página</div>
            {data?.elements.length ? (
              <ul className="sa-elements">
                {data.elements.map((el) => (
                  <li key={`${el.kind}-${el.href}-${el.label}`}>
                    <i className={`ti ${KIND_META[el.kind]?.icon || 'ti-click'}`} title={KIND_META[el.kind]?.label} aria-hidden="true" />
                    <span className="sa-ellipsis" title={el.href || el.label}>
                      {el.label || el.href || '(sem texto)'}
                    </span>
                    <strong>{fmtNum(el.clicks)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="sa-empty">Nenhum clique registrado.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClickHeatmap;
