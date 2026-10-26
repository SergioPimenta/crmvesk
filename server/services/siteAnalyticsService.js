import crypto from 'crypto';
import pool from '../db.js';
import { classifySource, geoFromHeaders, hostOf, parseUserAgent } from './siteTraffic.js';
import { buildInsights } from './siteInsights.js';
import { buildAnalyticsEmbedSnippet } from './siteTrackerScript.js';
import { getPublicApiBase } from './whatsappButtonService.js';

// Dias e horas dos relatórios seguem o horário de Brasília (sem horário de verão desde 2019).
const TZ = 'America/Sao_Paulo';
const TZ_OFFSET_MS = 3 * 3600 * 1000;
const DAY_MS = 86400 * 1000;

const CONVERTED = '(converted_form OR converted_whatsapp OR converted_phone)';

const EVENT_TYPES = new Set([
  'pageview',
  'page_exit',
  'click',
  'rage_click',
  'form_start',
  'form_submit',
  'whatsapp_open',
  'whatsapp_click',
  'whatsapp_lead',
  'phone_click',
  'email_click',
]);
const CLICK_KINDS = new Set(['link', 'external', 'button', 'dead', 'whatsapp', 'phone', 'email']);
const MAX_EVENTS_PER_BATCH = 40;

const DEVICE_WIDTHS = {
  mobile: [0, 767],
  tablet: [768, 1023],
  desktop: [1024, 100000],
  all: [0, 100000],
};

function normalizeSiteUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withProto).origin;
  } catch {
    return '';
  }
}

const str = (value, max) => String(value ?? '').slice(0, max);
const int = (value) => (Number.isFinite(Number(value)) ? Math.round(Number(value)) : null);
const num = (value) => Number(value) || 0;

// ---------------------------------------------------------------- sites

function mapSite(row, base) {
  return {
    id: String(row.id),
    host: row.host,
    siteUrl: row.site_url,
    siteName: row.site_name || row.host,
    active: row.active !== false,
    monitorCode: row.monitor_code,
    lastSeenAt: row.last_seen_at || null,
    createdAt: row.created_at || null,
    sessions7d: num(row.sessions_7d),
    conversions7d: num(row.conversions_7d),
    hasForm: Boolean(row.has_form),
    hasButton: Boolean(row.has_button),
    embedSnippet: buildAnalyticsEmbedSnippet(base, row.monitor_code),
  };
}

async function ensureSite(userId, siteUrl, siteName = '') {
  const origin = normalizeSiteUrl(siteUrl);
  const host = hostOf(origin);
  if (!host) return null;
  await pool.query(
    `INSERT INTO site_analytics_sites (user_id, host, site_url, site_name, monitor_code)
     VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, host) DO NOTHING RETURNING id`,
    [userId, host, origin, str(siteName, 160), crypto.randomBytes(16).toString('hex')]
  );
  const [rows] = await pool.query(
    'SELECT id, user_id, host, active FROM site_analytics_sites WHERE user_id = ? AND host = ? LIMIT 1',
    [userId, host]
  );
  return rows[0] || null;
}

// Sites que já têm botão de WhatsApp ou formulário instalados aparecem sozinhos (o script deles carrega o monitoramento).
async function syncSitesFromWidgets(userId) {
  const [rows] = await pool.query(
    `SELECT 'button' AS widget, site_url, site_name FROM whatsapp_button_widgets WHERE user_id = ? AND active = TRUE
     UNION ALL
     SELECT 'form' AS widget, site_url, site_name FROM contact_form_widgets WHERE user_id = ? AND active = TRUE`,
    [userId, userId]
  );
  const formHosts = new Set();
  const buttonHosts = new Set();
  for (const row of rows) {
    const host = hostOf(normalizeSiteUrl(row.site_url));
    if (!host) continue;
    if (!formHosts.has(host) && !buttonHosts.has(host)) await ensureSite(userId, row.site_url, row.site_name);
    (row.widget === 'form' ? formHosts : buttonHosts).add(host);
  }
  return { formHosts, buttonHosts };
}

export async function listSites(userId) {
  const { formHosts, buttonHosts } = await syncSitesFromWidgets(userId);
  const [rows] = await pool.query(
    `SELECT s.id, s.host, s.site_url, s.site_name, s.active, s.monitor_code, s.last_seen_at, s.created_at,
            COUNT(ss.id)::int AS sessions_7d,
            COUNT(ss.id) FILTER (WHERE ss.converted_form OR ss.converted_whatsapp OR ss.converted_phone)::int AS conversions_7d
     FROM site_analytics_sites s
     LEFT JOIN site_sessions ss ON ss.site_id = s.id AND ss.started_at >= NOW() - INTERVAL '7 days'
     WHERE s.user_id = ?
     GROUP BY s.id ORDER BY s.last_seen_at DESC NULLS LAST, s.id ASC`,
    [userId]
  );
  const base = getPublicApiBase();
  return rows.map((r) =>
    mapSite({ ...r, has_form: formHosts.has(r.host), has_button: buttonHosts.has(r.host) }, base)
  );
}

export async function createSite(userId, { siteUrl, siteName = '' } = {}) {
  const origin = normalizeSiteUrl(siteUrl);
  if (!origin || !hostOf(origin)) throw new Error('URL do site inválida');
  const site = await ensureSite(userId, origin, siteName);
  if (!site) throw new Error('URL do site inválida');
  if (siteName) {
    await pool.query('UPDATE site_analytics_sites SET site_name = ? WHERE id = ? AND user_id = ?', [
      str(siteName, 160),
      site.id,
      userId,
    ]);
  }
  const sites = await listSites(userId);
  return sites.find((s) => s.id === String(site.id));
}

export async function updateSite(userId, id, { siteName, active } = {}) {
  const [result] = await pool.query(
    `UPDATE site_analytics_sites SET site_name = COALESCE(?, site_name), active = COALESCE(?, active)
     WHERE id = ? AND user_id = ?`,
    [siteName !== undefined ? str(siteName, 160) : null, active !== undefined ? Boolean(active) : null, Number(id), userId]
  );
  if (!result.affectedRows) throw new Error('Site não encontrado');
  keyCache.clear();
  const sites = await listSites(userId);
  return sites.find((s) => s.id === String(id));
}

export async function deleteSite(userId, id) {
  const [result] = await pool.query('DELETE FROM site_analytics_sites WHERE id = ? AND user_id = ?', [Number(id), userId]);
  if (!result.affectedRows) throw new Error('Site não encontrado');
  keyCache.clear();
}

async function getOwnedSite(userId, id) {
  const [rows] = await pool.query(
    'SELECT id, host, site_url, site_name FROM site_analytics_sites WHERE id = ? AND user_id = ? LIMIT 1',
    [Number(id), userId]
  );
  if (!rows[0]) {
    const err = new Error('Site não encontrado');
    err.statusCode = 404;
    throw err;
  }
  return rows[0];
}

// ---------------------------------------------------------------- coleta (pública)

// Código do script → site. Aceita o código do próprio monitoramento ou o de um botão/formulário já instalado.
const keyCache = new Map();
const KEY_CACHE_MS = 5 * 60 * 1000;
const lastTouch = new Map();

export async function resolveCollectKey(key) {
  if (!/^[a-f0-9]{32}$/i.test(String(key || ''))) return null;
  const cached = keyCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.site;

  let site = null;
  const [own] = await pool.query(
    'SELECT id, user_id, host, active FROM site_analytics_sites WHERE monitor_code = ? LIMIT 1',
    [key]
  );
  if (own[0]) {
    site = own[0];
  } else {
    const [widgets] = await pool.query(
      `SELECT user_id, site_url, site_name FROM whatsapp_button_widgets WHERE monitor_code = ? AND active = TRUE
       UNION ALL
       SELECT user_id, site_url, site_name FROM contact_form_widgets WHERE monitor_code = ? AND active = TRUE
       LIMIT 1`,
      [key, key]
    );
    if (widgets[0]) site = await ensureSite(Number(widgets[0].user_id), widgets[0].site_url, widgets[0].site_name);
  }
  const resolved = site && site.active !== false ? { id: Number(site.id), host: site.host } : null;
  keyCache.set(key, { site: resolved, expires: Date.now() + KEY_CACHE_MS });
  return resolved;
}

function sanitizeEvent(raw, batchVw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = String(raw.t || '');
  if (!EVENT_TYPES.has(type)) return null;
  const kind = CLICK_KINDS.has(String(raw.k)) ? String(raw.k) : '';
  const x = Number(raw.x);
  return {
    type,
    path: str(raw.p || '/', 300) || '/',
    label: str(raw.l ?? raw.ti, 160).replace(/\s+/g, ' ').trim(),
    href: str(raw.h, 400),
    kind,
    x: Number.isFinite(x) && x >= 0 && x <= 1.5 ? x : null,
    y: int(raw.y),
    pageH: int(raw.ph),
    vw: int(raw.vw) ?? int(batchVw),
    scroll: raw.sc != null ? Math.max(0, Math.min(100, int(raw.sc) ?? 0)) : null,
    timeMs: raw.ms != null ? Math.max(0, Math.min(6 * 3600 * 1000, int(raw.ms) ?? 0)) : null,
  };
}

/**
 * Grava um lote enviado pelo script do site: cria/atualiza a visita e insere os eventos.
 * @returns {Promise<boolean>} false quando o código é inválido ou o lote é descartado (robô, vazio).
 */
export async function recordCollect(key, body = {}, headers = {}) {
  const site = await resolveCollectKey(key);
  if (!site) return false;

  const sessionKey = str(body.s, 40);
  const visitorKey = str(body.v, 40);
  if (!/^[a-z0-9]{6,40}$/i.test(sessionKey) || !/^[a-z0-9]{6,40}$/i.test(visitorKey)) return false;

  const userAgent = str(headers['user-agent'], 512);
  const ua = parseUserAgent(userAgent, int(body.vw) || 0);
  if (ua.bot) return false;

  const rawEvents = Array.isArray(body.e) ? body.e.slice(0, MAX_EVENTS_PER_BATCH) : [];
  const events = rawEvents.map((e) => sanitizeEvent(e, body.vw)).filter(Boolean);
  if (!events.length) return false;

  const has = (...types) => events.some((e) => types.includes(e.type));
  const firstPage = events.find((e) => e.type === 'pageview') || events[0];
  const traffic = classifySource({
    referrer: str(body.r, 1000),
    landingUrl: str(body.u, 1000),
    userAgent,
    siteHost: site.host,
  });
  const geo = geoFromHeaders(headers);
  const maxScroll = Math.max(0, ...events.map((e) => e.scroll ?? 0));
  const converted = has('form_submit', 'whatsapp_click', 'whatsapp_lead', 'phone_click');

  const [, sessionRows] = await pool.query(
    `INSERT INTO site_sessions (site_id, session_key, visitor_key, is_new_visitor, landing_path, exit_path, referrer_host,
       source, medium, campaign, device, browser, os, country, region, city, pageviews, events, duration_sec, max_scroll,
       form_started, whatsapp_opened, converted_form, converted_whatsapp, converted_phone, converted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${converted ? 'NOW()' : 'NULL'})
     ON CONFLICT (site_id, session_key) DO UPDATE SET
       last_seen_at = NOW(),
       exit_path = EXCLUDED.exit_path,
       pageviews = site_sessions.pageviews + EXCLUDED.pageviews,
       events = site_sessions.events + EXCLUDED.events,
       duration_sec = GREATEST(site_sessions.duration_sec, EXCLUDED.duration_sec),
       max_scroll = GREATEST(site_sessions.max_scroll, EXCLUDED.max_scroll),
       form_started = site_sessions.form_started OR EXCLUDED.form_started,
       whatsapp_opened = site_sessions.whatsapp_opened OR EXCLUDED.whatsapp_opened,
       converted_form = site_sessions.converted_form OR EXCLUDED.converted_form,
       converted_whatsapp = site_sessions.converted_whatsapp OR EXCLUDED.converted_whatsapp,
       converted_phone = site_sessions.converted_phone OR EXCLUDED.converted_phone,
       converted_at = COALESCE(site_sessions.converted_at, EXCLUDED.converted_at)
     RETURNING id`,
    [
      site.id,
      sessionKey,
      visitorKey,
      body.n === true,
      firstPage.path,
      events[events.length - 1].path,
      str(traffic.referrerHost, 255),
      str(traffic.source, 80),
      str(traffic.medium, 24),
      str(traffic.campaign, 120),
      ua.device,
      ua.browser,
      ua.os,
      geo.country,
      geo.region,
      geo.city,
      events.filter((e) => e.type === 'pageview').length,
      events.length,
      Math.max(0, Math.min(6 * 3600, int(body.dur) ?? 0)),
      maxScroll,
      has('form_start'),
      has('whatsapp_open'),
      has('form_submit'),
      has('whatsapp_click', 'whatsapp_lead'),
      has('phone_click'),
    ]
  );
  const sessionId = sessionRows?.[0]?.id;
  if (!sessionId) return false;

  const placeholders = [];
  const params = [];
  for (const e of events) {
    placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    params.push(site.id, sessionId, e.type, e.path, e.label, e.href, e.kind, e.x, e.y, e.pageH, e.vw, e.scroll, e.timeMs);
  }
  await pool.query(
    `INSERT INTO site_events (site_id, session_id, type, path, label, href, kind, x, y, page_h, vw, scroll_pct, time_ms)
     VALUES ${placeholders.join(', ')} RETURNING id`,
    params
  );

  if ((lastTouch.get(site.id) || 0) < Date.now() - 60_000) {
    lastTouch.set(site.id, Date.now());
    await pool.query('UPDATE site_analytics_sites SET last_seen_at = NOW() WHERE id = ?', [site.id]);
  }
  return true;
}

// ---------------------------------------------------------------- períodos

function spDateParts(ms) {
  const d = new Date(ms - TZ_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}
function spMidnight({ y, m, d }) {
  return Date.UTC(y, m, d) + TZ_OFFSET_MS;
}

/**
 * Período dos relatórios: ?days=1|7|30|90 (1 = hoje) ou ?from=AAAA-MM-DD&to=AAAA-MM-DD. Sempre compara com o
 * período imediatamente anterior, do mesmo tamanho.
 */
export function parseRange(query = {}, nowMs = Date.now()) {
  const todayStart = spMidnight(spDateParts(nowMs));
  let from;
  let to;
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (dateRe.test(String(query.from || '')) && dateRe.test(String(query.to || ''))) {
    const [fy, fm, fd] = String(query.from).split('-').map(Number);
    const [ty, tm, td] = String(query.to).split('-').map(Number);
    from = spMidnight({ y: fy, m: fm - 1, d: fd });
    to = spMidnight({ y: ty, m: tm - 1, d: td }) + DAY_MS;
    if (!(to > from)) throw Object.assign(new Error('Período inválido'), { statusCode: 400 });
    if (to - from > 366 * DAY_MS) from = to - 366 * DAY_MS;
  } else {
    const days = [1, 7, 30, 90, 180, 365].includes(Number(query.days)) ? Number(query.days) : 30;
    from = todayStart - (days - 1) * DAY_MS;
    to = todayStart + DAY_MS;
  }
  const span = to - from;
  return {
    from: new Date(from),
    to: new Date(to),
    prevFrom: new Date(from - span),
    prevTo: new Date(from),
    hourly: span <= 2 * DAY_MS,
    days: Math.round(span / DAY_MS),
  };
}

// ---------------------------------------------------------------- relatórios

const TOTALS_SQL = `
  SELECT COUNT(*)::int AS sessions,
         COUNT(DISTINCT visitor_key)::int AS visitors,
         COUNT(*) FILTER (WHERE is_new_visitor)::int AS new_visitors,
         COALESCE(SUM(pageviews), 0)::int AS pageviews,
         COALESCE(AVG(duration_sec), 0)::float AS avg_duration,
         COUNT(*) FILTER (WHERE pageviews <= 1 AND duration_sec < 15 AND max_scroll < 50
                          AND NOT (form_started OR whatsapp_opened OR ${CONVERTED}))::int AS bounces,
         COUNT(*) FILTER (WHERE duration_sec >= 30 OR pageviews >= 2 OR max_scroll >= 50 OR form_started OR whatsapp_opened OR ${CONVERTED})::int AS engaged,
         COUNT(*) FILTER (WHERE form_started OR whatsapp_opened OR ${CONVERTED})::int AS intent,
         COUNT(*) FILTER (WHERE ${CONVERTED})::int AS conversions,
         COUNT(*) FILTER (WHERE converted_form)::int AS conv_form,
         COUNT(*) FILTER (WHERE converted_whatsapp)::int AS conv_whatsapp,
         COUNT(*) FILTER (WHERE converted_phone)::int AS conv_phone,
         COUNT(*) FILTER (WHERE form_started)::int AS form_started,
         COUNT(*) FILTER (WHERE whatsapp_opened)::int AS whatsapp_opened
  FROM site_sessions WHERE site_id = ? AND started_at >= ? AND started_at < ?`;

function mapTotals(row = {}) {
  const sessions = num(row.sessions);
  return {
    sessions,
    visitors: num(row.visitors),
    newVisitors: num(row.new_visitors),
    pageviews: num(row.pageviews),
    avgDuration: Math.round(num(row.avg_duration)),
    bounceRate: sessions ? num(row.bounces) / sessions : 0,
    engaged: num(row.engaged),
    intent: num(row.intent),
    conversions: num(row.conversions),
    conversionRate: sessions ? num(row.conversions) / sessions : 0,
    convForm: num(row.conv_form),
    convWhatsapp: num(row.conv_whatsapp),
    convPhone: num(row.conv_phone),
    formStarted: num(row.form_started),
    whatsappOpened: num(row.whatsapp_opened),
  };
}

function bucketKeys(range) {
  const keys = [];
  if (range.hourly) {
    for (let t = range.from.getTime(); t < range.to.getTime(); t += 3600 * 1000) {
      const d = new Date(t - TZ_OFFSET_MS);
      keys.push(`${d.toISOString().slice(0, 10)}T${String(d.getUTCHours()).padStart(2, '0')}`);
    }
  } else {
    for (let t = range.from.getTime(); t < range.to.getTime(); t += DAY_MS) {
      keys.push(new Date(t - TZ_OFFSET_MS).toISOString().slice(0, 10));
    }
  }
  return keys;
}

const STEP_LABEL = {
  form_submit: 'Formulário enviado',
  whatsapp_click: 'WhatsApp',
  whatsapp_lead: 'WhatsApp',
  phone_click: 'Ligação',
};

// Caminho de páginas até o primeiro contato, sem repetir páginas seguidas.
export function buildJourneys(eventRows) {
  const bySession = new Map();
  for (const row of eventRows) {
    const id = String(row.session_id);
    if (!bySession.has(id)) bySession.set(id, { steps: [], done: false });
    const s = bySession.get(id);
    if (s.done) continue;
    if (row.type === 'pageview') {
      if (s.steps[s.steps.length - 1] !== row.path) s.steps.push(row.path);
    } else if (STEP_LABEL[row.type]) {
      s.steps.push(`★ ${STEP_LABEL[row.type]}`);
      s.done = true;
    }
  }
  const counts = new Map();
  for (const { steps, done } of bySession.values()) {
    if (!done) continue;
    const trimmed = steps.length > 5 ? [steps[0], '…', ...steps.slice(-3)] : steps;
    const key = trimmed.join(' → ');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([path, sessions]) => ({ steps: path.split(' → '), sessions }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 8);
}

export async function getOverview(userId, siteId, query = {}) {
  const site = await getOwnedSite(userId, siteId);
  const range = parseRange(query);
  const id = Number(site.id);
  const cur = [id, range.from, range.to];

  const now = Date.now();
  const todayStart = new Date(spMidnight(spDateParts(now)));
  const daysAgo = (n) => new Date(todayStart.getTime() - (n - 1) * DAY_MS);

  const bucketExpr = range.hourly
    ? `to_char(date_trunc('hour', started_at AT TIME ZONE '${TZ}'), 'YYYY-MM-DD"T"HH24')`
    : `to_char((started_at AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD')`;

  const q = (sql, params) => pool.query(sql, params).then(([rows]) => rows);
  const [
    totalsRows,
    prevRows,
    quickRows,
    seriesRows,
    sourceRows,
    campaignRows,
    regionRows,
    cityRows,
    deviceRows,
    browserRows,
    weekHourRows,
    landingRows,
    pageRows,
    linkRows,
    deadRows,
    rageRows,
    eventTypeRows,
    convertedRows,
  ] = await Promise.all([
    q(TOTALS_SQL, cur),
    q(TOTALS_SQL, [id, range.prevFrom, range.prevTo]),
    q(
      `SELECT COUNT(*) FILTER (WHERE started_at >= ?)::int AS today,
              COUNT(*) FILTER (WHERE started_at >= ?)::int AS d7,
              COUNT(*) FILTER (WHERE started_at >= ?)::int AS d30,
              COUNT(*)::int AS d90,
              COUNT(*) FILTER (WHERE started_at >= ? AND ${CONVERTED})::int AS today_conv,
              COUNT(*) FILTER (WHERE started_at >= ? AND ${CONVERTED})::int AS d7_conv,
              COUNT(*) FILTER (WHERE started_at >= ? AND ${CONVERTED})::int AS d30_conv,
              COUNT(*) FILTER (WHERE ${CONVERTED})::int AS d90_conv,
              COUNT(*) FILTER (WHERE last_seen_at >= NOW() - INTERVAL '5 minutes')::int AS online
       FROM site_sessions WHERE site_id = ? AND started_at >= ?`,
      [todayStart, daysAgo(7), daysAgo(30), todayStart, daysAgo(7), daysAgo(30), id, daysAgo(90)]
    ),
    q(
      `SELECT ${bucketExpr} AS bucket, COUNT(*)::int AS sessions, COUNT(*) FILTER (WHERE ${CONVERTED})::int AS conversions
       FROM site_sessions WHERE site_id = ? AND started_at >= ? AND started_at < ? GROUP BY 1 ORDER BY 1`,
      cur
    ),
    q(
      `SELECT source, medium, COUNT(*)::int AS sessions, COUNT(*) FILTER (WHERE ${CONVERTED})::int AS conversions,
              COALESCE(AVG(duration_sec), 0)::float AS avg_duration
       FROM site_sessions WHERE site_id = ? AND started_at >= ? AND started_at < ?
       GROUP BY source, medium ORDER BY sessions DESC LIMIT 12`,
      cur
    ),
    q(
      `SELECT source, campaign, COUNT(*)::int AS sessions, COUNT(*) FILTER (WHERE ${CONVERTED})::int AS conversions
       FROM site_sessions WHERE site_id = ? AND started_at >= ? AND started_at < ? AND campaign <> ''
       GROUP BY source, campaign ORDER BY sessions DESC LIMIT 10`,
      cur
    ),
    q(
      `SELECT country, region, COUNT(*)::int AS sessions, COUNT(*) FILTER (WHERE ${CONVERTED})::int AS conversions
       FROM site_sessions WHERE site_id = ? AND started_at >= ? AND started_at < ?
       GROUP BY country, region ORDER BY sessions DESC`,
      cur
    ),
    q(
      `SELECT city, region, country, COUNT(*)::int AS sessions, COUNT(*) FILTER (WHERE ${CONVERTED})::int AS conversions
       FROM site_sessions WHERE site_id = ? AND started_at >= ? AND started_at < ? AND city <> ''
       GROUP BY city, region, country ORDER BY sessions DESC LIMIT 10`,
      cur
    ),
    q(
      `SELECT device, COUNT(*)::int AS sessions, COUNT(*) FILTER (WHERE ${CONVERTED})::int AS conversions,
              COALESCE(AVG(duration_sec), 0)::float AS avg_duration
       FROM site_sessions WHERE site_id = ? AND started_at >= ? AND started_at < ? GROUP BY device ORDER BY sessions DESC`,
      cur
    ),
    q(
      `SELECT browser, COUNT(*)::int AS sessions FROM site_sessions
       WHERE site_id = ? AND started_at >= ? AND started_at < ? GROUP BY browser ORDER BY sessions DESC LIMIT 6`,
      cur
    ),
    q(
      `SELECT EXTRACT(DOW FROM started_at AT TIME ZONE '${TZ}')::int AS dow,
              EXTRACT(HOUR FROM started_at AT TIME ZONE '${TZ}')::int AS hour,
              COUNT(*)::int AS sessions, COUNT(*) FILTER (WHERE ${CONVERTED})::int AS conversions
       FROM site_sessions WHERE site_id = ? AND started_at >= ? AND started_at < ? GROUP BY 1, 2`,
      cur
    ),
    q(
      `SELECT landing_path AS path, COUNT(*)::int AS sessions,
              COUNT(*) FILTER (WHERE pageviews <= 1 AND duration_sec < 15 AND max_scroll < 50
                               AND NOT (form_started OR whatsapp_opened OR ${CONVERTED}))::int AS bounces,
              COUNT(*) FILTER (WHERE ${CONVERTED})::int AS conversions
       FROM site_sessions WHERE site_id = ? AND started_at >= ? AND started_at < ?
       GROUP BY landing_path ORDER BY sessions DESC LIMIT 10`,
      cur
    ),
    q(
      `WITH per AS (
         SELECT path, session_id,
                COUNT(*) FILTER (WHERE type = 'pageview') AS views,
                MAX(scroll_pct) FILTER (WHERE type = 'page_exit') AS scroll,
                SUM(time_ms) FILTER (WHERE type = 'page_exit') AS ms,
                MAX(label) FILTER (WHERE type = 'pageview') AS title
         FROM site_events WHERE site_id = ? AND created_at >= ? AND created_at < ? AND type IN ('pageview', 'page_exit')
         GROUP BY path, session_id
       )
       SELECT per.path, MAX(per.title) AS title, SUM(per.views)::int AS views,
              COUNT(*) FILTER (WHERE per.views > 0)::int AS sessions,
              AVG(per.scroll)::float AS avg_scroll, AVG(per.ms)::float AS avg_ms,
              COUNT(*) FILTER (WHERE per.views > 0 AND s.exit_path = per.path)::int AS exits,
              COUNT(*) FILTER (WHERE per.views > 0 AND (s.converted_form OR s.converted_whatsapp OR s.converted_phone))::int AS conversions
       FROM per JOIN site_sessions s ON s.id = per.session_id
       GROUP BY per.path ORDER BY views DESC LIMIT 15`,
      cur
    ),
    q(
      `SELECT kind, MAX(label) AS label, href, COUNT(*)::int AS clicks, COUNT(DISTINCT session_id)::int AS sessions,
              MIN(path) AS path
       FROM site_events WHERE site_id = ? AND created_at >= ? AND created_at < ? AND type = 'click' AND kind <> 'dead'
       GROUP BY kind, href, CASE WHEN href = '' THEN label ELSE '' END
       ORDER BY clicks DESC LIMIT 20`,
      cur
    ),
    q(
      `SELECT path, label, COUNT(*)::int AS clicks FROM site_events
       WHERE site_id = ? AND created_at >= ? AND created_at < ? AND type = 'click' AND kind = 'dead' AND label <> ''
       GROUP BY path, label ORDER BY clicks DESC LIMIT 6`,
      cur
    ),
    q(
      `SELECT path, label, COUNT(*)::int AS clicks FROM site_events
       WHERE site_id = ? AND created_at >= ? AND created_at < ? AND type = 'rage_click'
       GROUP BY path, label ORDER BY clicks DESC LIMIT 6`,
      cur
    ),
    q(
      `SELECT type, COUNT(*)::int AS events, COUNT(DISTINCT session_id)::int AS sessions FROM site_events
       WHERE site_id = ? AND created_at >= ? AND created_at < ?
         AND type IN ('form_start', 'form_submit', 'whatsapp_open', 'whatsapp_click', 'whatsapp_lead', 'phone_click', 'email_click')
       GROUP BY type`,
      cur
    ),
    q(
      `SELECT id, started_at, source, medium, device, region, city, country, landing_path, duration_sec, pageviews,
              converted_form, converted_whatsapp, converted_phone
       FROM site_sessions WHERE site_id = ? AND started_at >= ? AND started_at < ? AND ${CONVERTED}
       ORDER BY started_at DESC LIMIT 300`,
      cur
    ),
  ]);

  let journeys = [];
  const recent = convertedRows.slice(0, 12);
  const recentSteps = new Map();
  if (convertedRows.length) {
    const ids = convertedRows.map((r) => Number(r.id));
    const journeyEvents = await q(
      `SELECT session_id, type, path FROM site_events
       WHERE site_id = ? AND session_id = ANY(?::bigint[])
         AND type IN ('pageview', 'form_submit', 'whatsapp_click', 'whatsapp_lead', 'phone_click')
       ORDER BY session_id, id`,
      [id, ids]
    );
    journeys = buildJourneys(journeyEvents);
    const recentIds = new Set(recent.map((r) => String(r.id)));
    for (const ev of journeyEvents) {
      const key = String(ev.session_id);
      if (!recentIds.has(key) || ev.type !== 'pageview') continue;
      const list = recentSteps.get(key) || [];
      if (list[list.length - 1] !== ev.path) list.push(ev.path);
      recentSteps.set(key, list);
    }
  }

  const seriesMap = new Map(seriesRows.map((r) => [r.bucket, r]));
  const series = bucketKeys(range).map((key) => ({
    bucket: key,
    sessions: num(seriesMap.get(key)?.sessions),
    conversions: num(seriesMap.get(key)?.conversions),
  }));

  const quick = quickRows[0] || {};
  const eventTypes = Object.fromEntries(
    eventTypeRows.map((r) => [r.type, { events: num(r.events), sessions: num(r.sessions) }])
  );

  const result = {
    site: { id: String(site.id), host: site.host, siteUrl: site.site_url, siteName: site.site_name || site.host },
    range: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      days: range.days,
      hourly: range.hourly,
    },
    totals: mapTotals(totalsRows[0]),
    previous: mapTotals(prevRows[0]),
    quick: {
      online: num(quick.online),
      periods: [
        { key: 'today', label: 'Hoje', sessions: num(quick.today), conversions: num(quick.today_conv) },
        { key: '7d', label: '7 dias', sessions: num(quick.d7), conversions: num(quick.d7_conv) },
        { key: '30d', label: '30 dias', sessions: num(quick.d30), conversions: num(quick.d30_conv) },
        { key: '90d', label: '90 dias', sessions: num(quick.d90), conversions: num(quick.d90_conv) },
      ],
    },
    series,
    sources: sourceRows.map((r) => ({
      source: r.source || 'Direto',
      medium: r.medium || 'direct',
      sessions: num(r.sessions),
      conversions: num(r.conversions),
      avgDuration: Math.round(num(r.avg_duration)),
    })),
    campaigns: campaignRows.map((r) => ({
      source: r.source,
      campaign: r.campaign,
      sessions: num(r.sessions),
      conversions: num(r.conversions),
    })),
    regions: regionRows.map((r) => ({
      country: r.country || '',
      region: r.region || '',
      sessions: num(r.sessions),
      conversions: num(r.conversions),
    })),
    cities: cityRows.map((r) => ({
      city: r.city,
      region: r.region,
      country: r.country,
      sessions: num(r.sessions),
      conversions: num(r.conversions),
    })),
    devices: deviceRows.map((r) => ({
      device: r.device || 'desktop',
      sessions: num(r.sessions),
      conversions: num(r.conversions),
      avgDuration: Math.round(num(r.avg_duration)),
    })),
    browsers: browserRows.map((r) => ({ browser: r.browser || 'Outro', sessions: num(r.sessions) })),
    weekHour: weekHourRows.map((r) => ({
      dow: num(r.dow),
      hour: num(r.hour),
      sessions: num(r.sessions),
      conversions: num(r.conversions),
    })),
    landingPages: landingRows.map((r) => ({
      path: r.path || '/',
      sessions: num(r.sessions),
      bounces: num(r.bounces),
      conversions: num(r.conversions),
    })),
    pages: pageRows.map((r) => ({
      path: r.path,
      title: r.title || '',
      views: num(r.views),
      sessions: num(r.sessions),
      avgScroll: r.avg_scroll == null ? null : Math.round(num(r.avg_scroll)),
      avgTime: r.avg_ms == null ? null : Math.round(num(r.avg_ms) / 1000),
      exits: num(r.exits),
      conversions: num(r.conversions),
    })),
    links: linkRows.map((r) => ({
      kind: r.kind,
      label: r.label || '',
      href: r.href || '',
      clicks: num(r.clicks),
      sessions: num(r.sessions),
      path: r.path,
    })),
    deadClicks: deadRows.map((r) => ({ path: r.path, label: r.label, clicks: num(r.clicks) })),
    rageClicks: rageRows.map((r) => ({ path: r.path, label: r.label, clicks: num(r.clicks) })),
    eventTypes,
    journeys,
    recentConversions: recent.map((r) => ({
      id: String(r.id),
      startedAt: r.started_at,
      source: r.source || 'Direto',
      medium: r.medium || 'direct',
      device: r.device || 'desktop',
      region: r.region || '',
      city: r.city || '',
      country: r.country || '',
      landingPath: r.landing_path || '/',
      duration: num(r.duration_sec),
      pageviews: num(r.pageviews),
      channel: r.converted_whatsapp ? 'whatsapp' : r.converted_form ? 'form' : 'phone',
      steps: recentSteps.get(String(r.id)) || [],
    })),
  };
  result.insights = buildInsights(result);
  return result;
}

export async function getHeatmap(userId, siteId, query = {}) {
  const site = await getOwnedSite(userId, siteId);
  const range = parseRange(query);
  const id = Number(site.id);
  const device = DEVICE_WIDTHS[query.device] ? String(query.device) : 'desktop';
  const [minW, maxW] = DEVICE_WIDTHS[device];
  const q = (sql, params) => pool.query(sql, params).then(([rows]) => rows);

  const pages = await q(
    `SELECT path, COUNT(*) FILTER (WHERE type = 'pageview')::int AS views,
            COUNT(*) FILTER (WHERE type = 'click' AND vw BETWEEN ? AND ?)::int AS clicks
     FROM site_events WHERE site_id = ? AND created_at >= ? AND created_at < ? AND type IN ('pageview', 'click')
     GROUP BY path ORDER BY views DESC LIMIT 30`,
    [minW, maxW, id, range.from, range.to]
  );
  const path = String(query.path || pages[0]?.path || '/').slice(0, 300);
  const filter = [id, path, range.from, range.to, minW, maxW];

  const [points, scrolls, elements, heightRows] = await Promise.all([
    q(
      `SELECT x, y, page_h, type FROM site_events
       WHERE site_id = ? AND path = ? AND created_at >= ? AND created_at < ? AND vw BETWEEN ? AND ?
         AND type IN ('click', 'rage_click') AND x IS NOT NULL AND y IS NOT NULL
       ORDER BY id DESC LIMIT 6000`,
      filter
    ),
    q(
      `SELECT MAX(scroll_pct)::int AS scroll FROM site_events
       WHERE site_id = ? AND path = ? AND created_at >= ? AND created_at < ? AND vw BETWEEN ? AND ?
         AND type = 'page_exit' AND scroll_pct IS NOT NULL
       GROUP BY session_id`,
      filter
    ),
    q(
      `SELECT kind, MAX(label) AS label, href, COUNT(*)::int AS clicks FROM site_events
       WHERE site_id = ? AND path = ? AND created_at >= ? AND created_at < ? AND vw BETWEEN ? AND ? AND type = 'click'
       GROUP BY kind, href, CASE WHEN href = '' THEN label ELSE '' END ORDER BY clicks DESC LIMIT 12`,
      filter
    ),
    q(
      `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY page_h)::float AS median_h FROM site_events
       WHERE site_id = ? AND path = ? AND created_at >= ? AND created_at < ? AND vw BETWEEN ? AND ?
         AND type = 'click' AND page_h > 0`,
      filter
    ),
  ]);

  // Alcance da rolagem: % das visitas à página que chegaram a cada faixa de 10%.
  const reach = [];
  const total = scrolls.length;
  for (let pct = 0; pct <= 100; pct += 10) {
    const count = scrolls.filter((s) => num(s.scroll) >= pct).length;
    reach.push({ depth: pct, share: total ? count / total : 0 });
  }

  return {
    site: { id: String(site.id), host: site.host, siteUrl: site.site_url },
    device,
    path,
    pages: pages.map((p) => ({ path: p.path, views: num(p.views), clicks: num(p.clicks) })),
    pageHeight: Math.round(num(heightRows[0]?.median_h)) || 0,
    points: points.map((p) => {
      const h = num(p.page_h);
      return {
        x: Math.max(0, Math.min(1, num(p.x))),
        y: h > 0 ? Math.max(0, Math.min(1, num(p.y) / h)) : 0,
        rage: p.type === 'rage_click',
      };
    }),
    scrollSessions: total,
    scrollReach: reach,
    elements: elements.map((e) => ({ kind: e.kind, label: e.label || '', href: e.href || '', clicks: num(e.clicks) })),
  };
}
