import test from 'node:test';
import assert from 'node:assert/strict';
import { installDb, startApp, findCall, findCalls, signToken, userRow } from './helpers.js';
import { classifySource, geoFromHeaders, parseUserAgent } from '../services/siteTraffic.js';
import { buildJourneys, parseRange, recordCollect } from '../services/siteAnalyticsService.js';
import { buildInsights } from '../services/siteInsights.js';
import siteAnalyticsRouter from '../routes/siteAnalytics.js';

const IG_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0';
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// ---------- origem ----------
test('origem: UTM vence o referrer e aceita apelidos (ig, fb)', () => {
  const r = classifySource({ referrer: 'https://www.google.com/', landingUrl: 'https://vesk.com.br/?utm_source=ig&utm_medium=bio&utm_campaign=promo' });
  assert.deepEqual([r.source, r.medium, r.campaign], ['Instagram', 'social', 'promo']);
  assert.equal(classifySource({ landingUrl: 'https://x.com/?utm_source=facebook&utm_medium=cpc' }).medium, 'paid');
});

test('origem: referrer de busca, rede social e indicação', () => {
  assert.deepEqual(
    [classifySource({ referrer: 'https://www.google.com.br/' }).source, classifySource({ referrer: 'https://www.google.com.br/' }).medium],
    ['Google', 'organic']
  );
  assert.equal(classifySource({ referrer: 'https://l.instagram.com/?u=x' }).source, 'Instagram');
  assert.equal(classifySource({ referrer: 'https://lm.facebook.com/' }).source, 'Facebook');
  const ref = classifySource({ referrer: 'https://blogparceiro.com.br/post' });
  assert.deepEqual([ref.source, ref.medium], ['blogparceiro.com.br', 'referral']);
});

test('origem: navegador do Instagram sem referrer conta como Instagram; navegação interna não é origem', () => {
  assert.equal(classifySource({ userAgent: IG_UA }).source, 'Instagram');
  assert.equal(classifySource({ landingUrl: 'https://vesk.com.br/?igshid=abc' }).source, 'Instagram');
  assert.equal(classifySource({ landingUrl: 'https://vesk.com.br/?gclid=1' }).medium, 'paid');
  const self = classifySource({ referrer: 'https://www.vesk.com.br/servicos', siteHost: 'vesk.com.br' });
  assert.deepEqual([self.source, self.medium], ['Direto', 'direct']);
});

test('dispositivo e robôs pelo user agent', () => {
  assert.deepEqual(parseUserAgent(IG_UA), { device: 'mobile', browser: 'Instagram (app)', os: 'iOS', bot: false });
  assert.equal(parseUserAgent(CHROME_UA).device, 'desktop');
  assert.equal(parseUserAgent(CHROME_UA, 400).device, 'mobile');
  assert.equal(parseUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1)').bot, true);
});

test('região vem dos cabeçalhos da Vercel (sem guardar IP)', () => {
  assert.deepEqual(
    geoFromHeaders({ 'x-vercel-ip-country': 'BR', 'x-vercel-ip-country-region': 'PR', 'x-vercel-ip-city': 'S%C3%A3o%20Jos%C3%A9' }),
    { country: 'BR', region: 'PR', city: 'São José' }
  );
  assert.deepEqual(geoFromHeaders({}), { country: '', region: '', city: '' });
});

// ---------- período ----------
test('período: "hoje" começa à meia-noite de Brasília e compara com ontem', () => {
  const now = Date.UTC(2026, 9, 25, 15, 0); // 12h em Brasília
  const r = parseRange({ days: '1' }, now);
  assert.equal(r.from.toISOString(), '2026-10-25T03:00:00.000Z');
  assert.equal(r.to.toISOString(), '2026-10-26T03:00:00.000Z');
  assert.equal(r.prevFrom.toISOString(), '2026-10-24T03:00:00.000Z');
  assert.equal(r.hourly, true);
  const month = parseRange({ days: '30' }, now);
  assert.equal(month.days, 30);
  assert.equal(month.hourly, false);
  assert.equal(parseRange({ from: '2026-10-01', to: '2026-10-07' }, now).days, 7);
});

// ---------- coleta ----------
function collectDb() {
  installDb((sql) => {
    if (/FROM site_analytics_sites WHERE monitor_code/.test(sql)) return [{ id: 3, user_id: 1, host: 'vesk.com.br', active: true }];
    if (/INSERT INTO site_sessions/.test(sql)) return [{ id: 55 }];
    return undefined;
  });
}

const KEY = 'c'.repeat(32);

test('coleta: grava a visita com origem, região e conversão, e os eventos válidos', async () => {
  collectDb();
  const ok = await recordCollect(
    KEY,
    {
      v: 'visitor123',
      s: 'session123',
      n: true,
      r: '',
      u: 'https://vesk.com.br/?utm_source=instagram&utm_medium=stories',
      vw: 390,
      dur: 42,
      e: [
        { t: 'pageview', p: '/', ti: 'Home' },
        { t: 'click', k: 'whatsapp', l: 'Fale conosco', h: 'https://wa.me/55', x: 0.5, y: 900, ph: 4000 },
        { t: 'whatsapp_click', l: 'Fale conosco' },
        { t: 'page_exit', p: '/', sc: 77, ms: 42000 },
        { t: 'invalido' },
      ],
    },
    { 'user-agent': IG_UA, 'x-vercel-ip-country': 'BR', 'x-vercel-ip-country-region': 'PR' }
  );
  assert.equal(ok, true);
  const session = findCall(/INSERT INTO site_sessions/);
  const p = session.params;
  assert.equal(p[0], 3);
  assert.equal(p[7], 'Instagram');
  assert.equal(p[8], 'social');
  assert.equal(p[10], 'mobile');
  assert.equal(p[14], 'PR');
  assert.equal(p[16], 1); // páginas vistas
  assert.equal(p[19], 77); // rolagem máxima
  assert.equal(p[23], true); // contato por WhatsApp
  assert.match(session.sql, /converted_at\) VALUES .* NOW\(\)\)/);
  const events = findCall(/INSERT INTO site_events/);
  assert.equal(events.params.length, 4 * 13, 'evento inválido é descartado');
  assert.equal(events.params[1], 55);
});

test('coleta: robôs e identificadores inválidos são ignorados', async () => {
  collectDb();
  const body = { v: 'visitor123', s: 'session123', e: [{ t: 'pageview', p: '/' }] };
  assert.equal(await recordCollect(KEY, body, { 'user-agent': 'Googlebot/2.1' }), false);
  assert.equal(await recordCollect(KEY, { ...body, s: 'x' }, { 'user-agent': CHROME_UA }), false);
  assert.equal(await recordCollect('nao-hex', body, { 'user-agent': CHROME_UA }), false);
  assert.equal(findCalls(/INSERT INTO site_/).length, 0);
});

// ---------- jornadas e análise ----------
test('jornada: páginas até o primeiro contato, sem repetir página seguida', () => {
  const rows = [
    { session_id: 1, type: 'pageview', path: '/' },
    { session_id: 1, type: 'pageview', path: '/' },
    { session_id: 1, type: 'pageview', path: '/servicos' },
    { session_id: 1, type: 'whatsapp_lead', path: '/servicos' },
    { session_id: 1, type: 'pageview', path: '/contato' },
    { session_id: 2, type: 'pageview', path: '/' },
    { session_id: 2, type: 'pageview', path: '/servicos' },
    { session_id: 2, type: 'whatsapp_click', path: '/servicos' },
  ];
  assert.deepEqual(buildJourneys(rows), [{ steps: ['/', '/servicos', '★ WhatsApp'], sessions: 2 }]);
});

const baseTotals = {
  sessions: 200, visitors: 180, newVisitors: 150, pageviews: 300, avgDuration: 60, bounceRate: 0.3, engaged: 120,
  intent: 30, conversions: 10, conversionRate: 0.05, convForm: 4, convWhatsapp: 5, convPhone: 1, formStarted: 20,
  whatsappOpened: 6,
};

test('análise: formulário abandonado e celular convertendo menos viram prioridade', () => {
  const insights = buildInsights({
    totals: baseTotals,
    previous: { ...baseTotals, sessions: 190 },
    devices: [
      { device: 'mobile', sessions: 140, conversions: 3 },
      { device: 'desktop', sessions: 60, conversions: 7 },
    ],
    sources: [],
    eventTypes: { whatsapp_lead: { sessions: 5 } },
  });
  const ids = insights.map((i) => i.id);
  assert.ok(ids.includes('form-abandon'));
  assert.ok(ids.includes('mobile-gap'));
  assert.equal(insights[0].severity, 'critical');
});

test('análise: sem visitas orienta a instalar o script; pouco volume não gera conclusões', () => {
  assert.deepEqual(buildInsights({ totals: { ...baseTotals, sessions: 0 } }).map((i) => i.id), ['no-data']);
  const few = buildInsights({ totals: { ...baseTotals, sessions: 8, conversionRate: 0, bounceRate: 0.9, formStarted: 0, whatsappOpened: 0 } });
  assert.equal(few.length, 0);
});

// ---------- acesso ----------
test('relatórios de sites são só para administradores e do próprio workspace', async () => {
  installDb((sql) => (/FROM users WHERE id/.test(sql) ? [userRow({ role: 'user' })] : undefined));
  const app = await startApp({ '/api/site-analytics': siteAnalyticsRouter });
  try {
    const res = await fetch(`${app.url}/api/site-analytics/sites`, { headers: { Authorization: `Bearer ${signToken()}` } });
    assert.equal(res.status, 403);

    installDb((sql) => (/FROM users WHERE id/.test(sql) ? [userRow({ role: 'admin' })] : undefined));
    const other = await fetch(`${app.url}/api/site-analytics/sites/9/overview`, {
      headers: { Authorization: `Bearer ${signToken({ role: 'admin' })}` },
    });
    assert.equal(other.status, 404);
    assert.deepEqual(findCall(/FROM site_analytics_sites WHERE id = \?/).params, [9, 1]);
  } finally {
    await app.close();
  }
});
