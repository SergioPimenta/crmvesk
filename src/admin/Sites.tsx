import { useCallback, useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import CrmLayout from '../components/crm/CrmLayout';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import BarList from './sites/BarList';
import BrazilTileMap from './sites/BrazilTileMap';
import ClickHeatmap from './sites/ClickHeatmap';
import ContactFunnel from './sites/ContactFunnel';
import InsightsList from './sites/InsightsList';
import { RecentConversions, TopJourneys } from './sites/JourneyPanel';
import SiteSetupModal from './sites/SiteSetupModal';
import TrafficChart from './sites/TrafficChart';
import WeekHourHeatmap from './sites/WeekHourHeatmap';
import {
  delta,
  DEVICE_LABEL,
  fmtDuration,
  fmtNum,
  fmtPct,
  KIND_META,
  MEDIUM_LABEL,
  rate,
  SOURCE_ICON,
  STATE_NAMES,
  timeAgo,
} from './sites/format';
import type { MonitoredSite, PeriodKey, SiteOverview } from './sites/types';
import '../styles/site-analytics.css';

type Tab = 'geral' | 'origem' | 'paginas' | 'calor' | 'jornada' | 'analise';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'geral', label: 'Visão geral', icon: 'ti-chart-line' },
  { id: 'origem', label: 'Origem e regiões', icon: 'ti-world' },
  { id: 'paginas', label: 'Páginas e cliques', icon: 'ti-click' },
  { id: 'calor', label: 'Mapa de calor', icon: 'ti-flame' },
  { id: 'jornada', label: 'Jornada até o contato', icon: 'ti-route' },
  { id: 'analise', label: 'O que melhorar', icon: 'ti-bulb' },
];

const PERIODS: { id: PeriodKey; label: string }[] = [
  { id: '1', label: 'Hoje' },
  { id: '7', label: '7 dias' },
  { id: '30', label: '30 dias' },
  { id: '90', label: '90 dias' },
];

function Delta({ cur, prev, invert = false }: { cur: number; prev: number; invert?: boolean }) {
  const d = delta(cur, prev);
  if (d === null) return <span className="sa-muted">sem comparação</span>;
  const good = invert ? d <= 0 : d >= 0;
  return (
    <span className={good ? 'sa-up' : 'sa-down'}>
      <i className={`ti ${d >= 0 ? 'ti-arrow-up-right' : 'ti-arrow-down-right'}`} aria-hidden="true" />
      {fmtPct(Math.abs(d), 0)} vs. período anterior
    </span>
  );
}

const Sites = () => {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [sites, setSites] = useState<MonitoredSite[]>([]);
  const [loadingSites, setLoadingSites] = useState(true);
  const [data, setData] = useState<SiteOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [setupOpen, setSetupOpen] = useState(false);

  const tab = (TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'geral') as Tab;
  const period = (PERIODS.some((p) => p.id === params.get('dias')) ? params.get('dias') : '30') as PeriodKey;
  const siteId = params.get('site') || sites[0]?.id || '';
  const site = sites.find((s) => s.id === siteId) || null;

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  const loadSites = useCallback(async () => {
    try {
      const res = await api.get<{ sites: MonitoredSite[] }>('/site-analytics/sites');
      setSites(res.sites);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar sites');
    } finally {
      setLoadingSites(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') void loadSites();
  }, [user?.role, loadSites]);

  useEffect(() => {
    if (!siteId) return;
    let alive = true;
    setLoading(true);
    setError('');
    api
      .get<SiteOverview>(`/site-analytics/sites/${siteId}/overview?days=${period}`)
      .then((res) => alive && setData(res))
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : 'Erro ao carregar dados do site'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [siteId, period]);

  if (user && user.role !== 'admin') return <Navigate to="/admin" replace />;

  const t = data?.totals;
  const p = data?.previous;
  const insightsBadge = data?.insights.filter((i) => i.severity === 'critical' || i.severity === 'warning').length || 0;

  // Agrega origem (mesma fonte em meios diferentes, ex.: Instagram social + pago).
  const sourceRows = (data?.sources || []).map((s) => ({
    key: `${s.source}-${s.medium}`,
    label: s.source,
    sub: MEDIUM_LABEL[s.medium] || s.medium,
    icon: SOURCE_ICON[s.source] || 'ti-world',
    value: s.sessions,
    aside: fmtPct(rate(s.conversions, s.sessions)),
    asideTone: (t && s.sessions >= 10
      ? rate(s.conversions, s.sessions) >= t.conversionRate
        ? 'good'
        : 'bad'
      : undefined) as 'good' | 'bad' | undefined,
    detail: [
      `${fmtPct(rate(s.sessions, t?.sessions || 0))} das visitas`,
      `${fmtNum(s.conversions)} contatos (${fmtPct(rate(s.conversions, s.sessions))})`,
      `Tempo médio ${fmtDuration(s.avgDuration)}`,
    ],
  }));

  const brRegions = (data?.regions || []).filter((r) => r.country === 'BR' && r.region);
  const foreign = (data?.regions || []).filter((r) => r.country && r.country !== 'BR').reduce((a, r) => a + r.sessions, 0);
  const unknownGeo = (data?.regions || []).filter((r) => !r.country).reduce((a, r) => a + r.sessions, 0);

  return (
    <CrmLayout>
      <div className="sa-root">
        <div className="crm-page-header">
          <div>
            <div className="crm-page-title">
              Sites <span>monitoramento</span>
            </div>
            <div className="sa-subtitle">
              Acessos, origem, regiões, cliques e o caminho até o contato nos sites integrados
            </div>
          </div>
          <div className="crm-page-actions sa-header-actions">
            {sites.length > 1 ? (
              <select
                className="sa-select"
                value={siteId}
                onChange={(e) => setParam('site', e.target.value)}
                aria-label="Site"
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.siteName}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="sa-segmented" role="group" aria-label="Período">
              {PERIODS.map((pp) => (
                <button
                  key={pp.id}
                  type="button"
                  className={period === pp.id ? 'active' : ''}
                  onClick={() => setParam('dias', pp.id)}
                  aria-pressed={period === pp.id}
                >
                  {pp.label}
                </button>
              ))}
            </div>
            <button type="button" className="crm-btn-primary" onClick={() => setSetupOpen(true)}>
              <i className="ti ti-code" aria-hidden="true" />
              Instalar
            </button>
          </div>
        </div>

        {error ? <div className="sa-error">{error}</div> : null}

        {!loadingSites && !sites.length ? (
          <div className="crm-card sa-onboarding">
            <i className="ti ti-world" aria-hidden="true" />
            <div>
              <div className="crm-card-title">Nenhum site monitorado ainda</div>
              <p>
                Instale o botão de WhatsApp ou o formulário de contato em Integrações — o monitoramento vem junto — ou
                cadastre o site e cole o script de monitoramento.
              </p>
              <button type="button" className="crm-btn-primary" onClick={() => setSetupOpen(true)}>
                <i className="ti ti-plus" aria-hidden="true" /> Cadastrar site
              </button>
            </div>
          </div>
        ) : null}

        {site ? (
          <div className="sa-sitebar">
            <span className={`sa-live${data?.quick.online ? ' on' : ''}`}>
              <i aria-hidden="true" />
              {data?.quick.online ? `${fmtNum(data.quick.online)} online agora` : 'ninguém online agora'}
            </span>
            <a href={site.siteUrl} target="_blank" rel="noreferrer" className="sa-host">
              {site.host} <i className="ti ti-external-link" aria-hidden="true" />
            </a>
            <span className="sa-muted">Último dado recebido {timeAgo(site.lastSeenAt)}</span>
            {site.hasButton ? <span className="sa-chip"><i className="ti ti-brand-whatsapp" aria-hidden="true" /> Botão WhatsApp</span> : null}
            {site.hasForm ? <span className="sa-chip"><i className="ti ti-forms" aria-hidden="true" /> Formulário</span> : null}
          </div>
        ) : null}

        {data && t && p ? (
          <div className={`sa-content${loading ? ' loading' : ''}`}>
            <div className="sa-periods" aria-label="Acessos por período">
              {data.quick.periods.map((qp) => (
                <div key={qp.key} className="sa-period">
                  <span className="sa-period-label">Acessos · {qp.label}</span>
                  <strong>{fmtNum(qp.sessions)}</strong>
                  <span className="sa-muted">{fmtNum(qp.conversions)} contatos</span>
                </div>
              ))}
            </div>

            <div className="crm-metrics">
              <div className="crm-metric">
                <div className="crm-metric-accent" />
                <i className="ti ti-eye crm-metric-icon" aria-hidden="true" />
                <div className="crm-metric-label">Visitas</div>
                <div className="crm-metric-value">{fmtNum(t.sessions)}</div>
                <div className="crm-metric-delta"><Delta cur={t.sessions} prev={p.sessions} /></div>
              </div>
              <div className="crm-metric">
                <div className="crm-metric-accent" style={{ background: '#378add' }} />
                <i className="ti ti-users crm-metric-icon" style={{ color: '#378add' }} aria-hidden="true" />
                <div className="crm-metric-label">Visitantes únicos</div>
                <div className="crm-metric-value">{fmtNum(t.visitors)}</div>
                <div className="crm-metric-delta sa-muted">
                  {fmtPct(rate(t.newVisitors, t.sessions), 0)} das visitas são de novos · {fmtNum(t.pageviews)} páginas vistas
                </div>
              </div>
              <div className="crm-metric">
                <div className="crm-metric-accent" style={{ background: '#4caf82' }} />
                <i className="ti ti-message-circle crm-metric-icon" style={{ color: '#4caf82' }} aria-hidden="true" />
                <div className="crm-metric-label">Contatos pelo site</div>
                <div className="crm-metric-value">
                  {fmtNum(t.conversions)} <small className="sa-metric-small">{fmtPct(t.conversionRate)}</small>
                </div>
                <div className="crm-metric-delta"><Delta cur={t.conversions} prev={p.conversions} /></div>
              </div>
              <div className="crm-metric">
                <div className="crm-metric-accent" style={{ background: '#ef9f27' }} />
                <i className="ti ti-clock crm-metric-icon" style={{ color: '#ef9f27' }} aria-hidden="true" />
                <div className="crm-metric-label">Tempo médio</div>
                <div className="crm-metric-value">{fmtDuration(t.avgDuration)}</div>
                <div className="crm-metric-delta">
                  <span className={t.bounceRate > 0.6 ? 'sa-down' : 'sa-muted'}>
                    {fmtPct(t.bounceRate, 0)} saem sem interagir
                  </span>
                </div>
              </div>
            </div>

            <div className="crm-tabs sa-tabs" role="tablist">
              {TABS.map((tb) => (
                <button
                  key={tb.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === tb.id}
                  className={`crm-tab${tab === tb.id ? ' active' : ''}`}
                  onClick={() => setParam('tab', tb.id)}
                >
                  <i className={`ti ${tb.icon}`} aria-hidden="true" /> {tb.label}
                  {tb.id === 'analise' && insightsBadge ? <span className="sa-badge">{insightsBadge}</span> : null}
                </button>
              ))}
            </div>

            {tab === 'geral' ? (
              <div className="sa-grid">
                <div className="crm-card sa-span-2">
                  <div className="crm-card-header">
                    <i className="ti ti-chart-line sa-card-icon" aria-hidden="true" />
                    <div className="crm-card-title">Acessos e contatos</div>
                    <span className="pipeline-badge">{data.range.hourly ? 'por hora' : 'por dia'}</span>
                  </div>
                  <TrafficChart data={data} />
                </div>
                <div className="crm-card">
                  <div className="crm-card-header">
                    <i className="ti ti-filter sa-card-icon" aria-hidden="true" />
                    <div className="crm-card-title">Do acesso ao contato</div>
                  </div>
                  <ContactFunnel data={data} />
                </div>
                <div className="crm-card">
                  <div className="crm-card-header">
                    <i className="ti ti-bulb sa-card-icon" aria-hidden="true" />
                    <div className="crm-card-title">Principais pontos de melhoria</div>
                    <button type="button" className="crm-card-action" onClick={() => setParam('tab', 'analise')}>
                      Ver análise completa →
                    </button>
                  </div>
                  <InsightsList insights={data.insights} limit={3} />
                </div>
                <div className="crm-card">
                  <div className="crm-card-header">
                    <i className="ti ti-world sa-card-icon" aria-hidden="true" />
                    <div className="crm-card-title">De onde vêm</div>
                    <button type="button" className="crm-card-action" onClick={() => setParam('tab', 'origem')}>
                      Detalhes →
                    </button>
                  </div>
                  <BarList rows={sourceRows.slice(0, 6)} valueHeader="Visitas" asideHeader="Conversão" />
                </div>
                <div className="crm-card">
                  <div className="crm-card-header">
                    <i className="ti ti-calendar-time sa-card-icon" aria-hidden="true" />
                    <div className="crm-card-title">Dias e horários de pico</div>
                  </div>
                  <WeekHourHeatmap cells={data.weekHour} />
                </div>
              </div>
            ) : null}

            {tab === 'origem' ? (
              <div className="sa-grid">
                <div className="crm-card">
                  <div className="crm-card-header">
                    <i className="ti ti-world sa-card-icon" aria-hidden="true" />
                    <div className="crm-card-title">Origem das visitas</div>
                    <span className="pipeline-badge">Instagram, Google, direto…</span>
                  </div>
                  <BarList rows={sourceRows} valueHeader="Visitas" asideHeader="Conversão" />
                </div>
                <div className="crm-card">
                  <div className="crm-card-header">
                    <i className="ti ti-map-pin sa-card-icon" aria-hidden="true" />
                    <div className="crm-card-title">Estados</div>
                    <span className="pipeline-badge">aproximado</span>
                  </div>
                  {brRegions.length ? <BrazilTileMap regions={data.regions} /> : <div className="sa-empty">Sem localização no período.</div>}
                  {foreign || unknownGeo ? (
                    <div className="sa-muted sa-small">
                      {foreign ? `${fmtNum(foreign)} visitas do exterior. ` : ''}
                      {unknownGeo ? `${fmtNum(unknownGeo)} sem localização.` : ''}
                    </div>
                  ) : null}
                  <div className="sa-geo-note">
                    <i className="ti ti-info-circle" aria-hidden="true" />
                    <span>
                      Localização aproximada pela conexão de internet do visitante. Muitos provedores registram seus IPs
                      em São Paulo, então SP tende a aparecer acima do real e outros estados abaixo — use o mapa como
                      tendência, não como número exato.
                    </span>
                  </div>
                </div>
                <div className="crm-card">
                  <div className="crm-card-header">
                    <i className="ti ti-list-numbers sa-card-icon" aria-hidden="true" />
                    <div className="crm-card-title">Ranking por estado</div>
                  </div>
                  <BarList
                    valueHeader="Visitas"
                    asideHeader="Conversão"
                    rows={brRegions.slice(0, 10).map((r) => ({
                      key: r.region,
                      label: STATE_NAMES[r.region] || r.region,
                      sub: r.region,
                      value: r.sessions,
                      aside: fmtPct(rate(r.conversions, r.sessions)),
                      detail: [`${fmtNum(r.conversions)} contatos`, `${fmtPct(rate(r.sessions, t.sessions))} das visitas`],
                    }))}
                  />
                </div>
                <div className="crm-card">
                  <div className="crm-card-header">
                    <i className="ti ti-building-community sa-card-icon" aria-hidden="true" />
                    <div className="crm-card-title">Cidades</div>
                    <span className="pipeline-badge">aproximado</span>
                  </div>
                  <BarList
                    valueHeader="Visitas"
                    asideHeader="Contatos"
                    rows={data.cities.map((c) => ({
                      key: `${c.city}-${c.region}`,
                      label: c.city,
                      sub: c.region,
                      value: c.sessions,
                      aside: fmtNum(c.conversions),
                    }))}
                  />
                </div>
                <div className="crm-card">
                  <div className="crm-card-header">
                    <i className="ti ti-devices sa-card-icon" aria-hidden="true" />
                    <div className="crm-card-title">Dispositivos</div>
                  </div>
                  <BarList
                    valueHeader="Visitas"
                    asideHeader="Conversão"
                    rows={data.devices.map((d) => ({
                      key: d.device,
                      label: DEVICE_LABEL[d.device]?.label || d.device,
                      icon: DEVICE_LABEL[d.device]?.icon,
                      value: d.sessions,
                      aside: fmtPct(rate(d.conversions, d.sessions)),
                      detail: [`${fmtPct(rate(d.sessions, t.sessions))} das visitas`, `Tempo médio ${fmtDuration(d.avgDuration)}`],
                    }))}
                  />
                  <div className="sa-side-title sa-mt">Navegadores</div>
                  <BarList rows={data.browsers.map((b) => ({ key: b.browser, label: b.browser, value: b.sessions }))} />
                </div>
                <div className="crm-card">
                  <div className="crm-card-header">
                    <i className="ti ti-speakerphone sa-card-icon" aria-hidden="true" />
                    <div className="crm-card-title">Campanhas (UTM)</div>
                  </div>
                  <BarList
                    empty="Nenhum link com utm_campaign no período. Use UTMs nos links da bio, stories e anúncios."
                    valueHeader="Visitas"
                    asideHeader="Contatos"
                    rows={data.campaigns.map((c) => ({
                      key: `${c.source}-${c.campaign}`,
                      label: c.campaign,
                      sub: c.source,
                      value: c.sessions,
                      aside: fmtNum(c.conversions),
                    }))}
                  />
                </div>
              </div>
            ) : null}

            {tab === 'paginas' ? (
              <div className="sa-grid">
                <div className="crm-card sa-span-2">
                  <div className="crm-card-header">
                    <i className="ti ti-file-text sa-card-icon" aria-hidden="true" />
                    <div className="crm-card-title">Páginas mais vistas</div>
                  </div>
                  {data.pages.length ? (
                    <div className="sa-table-wrap">
                      <table className="sa-table">
                        <thead>
                          <tr>
                            <th>Página</th>
                            <th className="num">Visualizações</th>
                            <th className="num">Tempo médio</th>
                            <th className="num">Rolagem média</th>
                            <th className="num">Saída por aqui</th>
                            <th className="num">Viraram contato</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.pages.map((pg) => (
                            <tr key={pg.path}>
                              <td>
                                <div className="sa-ellipsis sa-path">{pg.path}</div>
                                {pg.title && pg.title !== pg.path ? <div className="sa-muted sa-small sa-ellipsis">{pg.title}</div> : null}
                              </td>
                              <td className="num">{fmtNum(pg.views)}</td>
                              <td className="num">{pg.avgTime != null ? fmtDuration(pg.avgTime) : '—'}</td>
                              <td className="num">{pg.avgScroll != null ? `${pg.avgScroll}%` : '—'}</td>
                              <td className="num">{fmtPct(rate(pg.exits, pg.sessions), 0)}</td>
                              <td className="num">{fmtPct(rate(pg.conversions, pg.sessions))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="sa-empty">Sem páginas no período.</div>
                  )}
                </div>
                <div className="crm-card sa-span-2">
                  <div className="crm-card-header">
                    <i className="ti ti-click sa-card-icon" aria-hidden="true" />
                    <div className="crm-card-title">Links e botões clicados</div>
                  </div>
                  {data.links.length ? (
                    <div className="sa-table-wrap">
                      <table className="sa-table">
                        <thead>
                          <tr>
                            <th>Elemento</th>
                            <th>Tipo</th>
                            <th>Destino</th>
                            <th className="num">Cliques</th>
                            <th className="num">Visitas que clicaram</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.links.map((l) => (
                            <tr key={`${l.kind}-${l.href}-${l.label}`}>
                              <td><div className="sa-ellipsis">{l.label || '(sem texto)'}</div></td>
                              <td>
                                <i className={`ti ${KIND_META[l.kind]?.icon}`} aria-hidden="true" /> {KIND_META[l.kind]?.label}
                              </td>
                              <td><div className="sa-ellipsis sa-muted">{l.href || `em ${l.path}`}</div></td>
                              <td className="num">{fmtNum(l.clicks)}</td>
                              <td className="num">{fmtPct(rate(l.sessions, t.sessions))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="sa-empty">Nenhum clique registrado no período.</div>
                  )}
                </div>
                <div className="crm-card">
                  <div className="crm-card-header">
                    <i className="ti ti-hand-off sa-card-icon" aria-hidden="true" />
                    <div className="crm-card-title">Cliques em algo que não é clicável</div>
                  </div>
                  <BarList
                    empty="Nenhum. Ótimo sinal."
                    rows={data.deadClicks.map((d) => ({ key: `${d.path}-${d.label}`, label: d.label, sub: d.path, value: d.clicks }))}
                  />
                </div>
                <div className="crm-card">
                  <div className="crm-card-header">
                    <i className="ti ti-mood-angry sa-card-icon" aria-hidden="true" />
                    <div className="crm-card-title">Cliques de frustração</div>
                    <span className="pipeline-badge">3+ cliques seguidos</span>
                  </div>
                  <BarList
                    empty="Nenhum. Ótimo sinal."
                    rows={data.rageClicks.map((d) => ({ key: `${d.path}-${d.label}`, label: d.label || '(sem texto)', sub: d.path, value: d.clicks }))}
                  />
                </div>
                <div className="crm-card sa-span-2">
                  <div className="crm-card-header">
                    <i className="ti ti-door-enter sa-card-icon" aria-hidden="true" />
                    <div className="crm-card-title">Páginas de entrada</div>
                  </div>
                  <BarList
                    valueHeader="Visitas"
                    asideHeader="Saem sem interagir"
                    rows={data.landingPages.map((l) => ({
                      key: l.path,
                      label: l.path,
                      value: l.sessions,
                      aside: fmtPct(rate(l.bounces, l.sessions), 0),
                      asideTone: l.sessions >= 10 && rate(l.bounces, l.sessions) > 0.6 ? 'bad' : undefined,
                      detail: [`${fmtNum(l.conversions)} contatos (${fmtPct(rate(l.conversions, l.sessions))})`],
                    }))}
                  />
                </div>
              </div>
            ) : null}

            {tab === 'calor' && site ? (
              <div className="crm-card">
                <div className="crm-card-header">
                  <i className="ti ti-flame sa-card-icon" aria-hidden="true" />
                  <div className="crm-card-title">Mapa de calor de cliques e rolagem</div>
                </div>
                <ClickHeatmap siteId={site.id} siteUrl={site.siteUrl} days={period} />
              </div>
            ) : null}

            {tab === 'jornada' ? (
              <div className="sa-grid">
                <div className="crm-card">
                  <div className="crm-card-header">
                    <i className="ti ti-filter sa-card-icon" aria-hidden="true" />
                    <div className="crm-card-title">Funil do site</div>
                  </div>
                  <ContactFunnel data={data} />
                </div>
                <div className="crm-card">
                  <div className="crm-card-header">
                    <i className="ti ti-route sa-card-icon" aria-hidden="true" />
                    <div className="crm-card-title">Caminhos mais comuns até o contato</div>
                  </div>
                  <TopJourneys data={data} />
                </div>
                <div className="crm-card sa-span-2">
                  <div className="crm-card-header">
                    <i className="ti ti-user-check sa-card-icon" aria-hidden="true" />
                    <div className="crm-card-title">Últimos contatos vindos do site</div>
                  </div>
                  <RecentConversions data={data} />
                </div>
              </div>
            ) : null}

            {tab === 'analise' ? (
              <div className="crm-card">
                <div className="crm-card-header">
                  <i className="ti ti-bulb sa-card-icon" aria-hidden="true" />
                  <div className="crm-card-title">O que pode melhorar</div>
                  <span className="pipeline-badge">gerado a partir dos dados do período</span>
                </div>
                <InsightsList insights={data.insights} />
              </div>
            ) : null}
          </div>
        ) : site && loading ? (
          <div className="crm-card sa-empty">Carregando dados do site…</div>
        ) : null}
      </div>

      <SiteSetupModal
        open={setupOpen}
        site={site}
        onClose={() => setSetupOpen(false)}
        onCreated={(created) => {
          setSetupOpen(false);
          void loadSites().then(() => setParam('site', created.id));
        }}
      />
    </CrmLayout>
  );
};

export default Sites;
