// Classificação de visitas dos sites monitorados: origem (Instagram, Google…), dispositivo e localização.
// Funções puras — a coleta (siteAnalyticsService) só repassa referrer, URL de entrada, user agent e cabeçalhos.

const SEARCH_ENGINES = [
  [/(^|\.)google\./, 'Google'],
  [/(^|\.)bing\.com$/, 'Bing'],
  [/(^|\.)search\.yahoo\.com$|(^|\.)yahoo\.com$/, 'Yahoo'],
  [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo'],
  [/(^|\.)ecosia\.org$/, 'Ecosia'],
  [/(^|\.)chatgpt\.com$|(^|\.)openai\.com$/, 'ChatGPT'],
  [/(^|\.)perplexity\.ai$/, 'Perplexity'],
];

const SOCIAL = [
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)fb\.me$/, 'Facebook'],
  [/(^|\.)linkedin\.com$|(^|\.)lnkd\.in$/, 'LinkedIn'],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, 'YouTube'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)t\.co$|(^|\.)twitter\.com$|(^|\.)x\.com$/, 'X (Twitter)'],
  [/(^|\.)pinterest\./, 'Pinterest'],
  [/(^|\.)whatsapp\.com$|(^|\.)wa\.me$/, 'WhatsApp'],
  [/(^|\.)threads\.net$/, 'Threads'],
  [/(^|\.)linktr\.ee$/, 'Linktree'],
];

// utm_source escrito à mão (ig, insta, fb…) vira o mesmo nome que o referrer produziria.
const UTM_ALIASES = {
  ig: 'Instagram',
  insta: 'Instagram',
  instagram: 'Instagram',
  fb: 'Facebook',
  facebook: 'Facebook',
  meta: 'Facebook',
  google: 'Google',
  gads: 'Google',
  adwords: 'Google',
  bing: 'Bing',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  yt: 'YouTube',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp',
  wa: 'WhatsApp',
  email: 'E-mail',
  newsletter: 'E-mail',
  chatgpt: 'ChatGPT',
  'chatgpt.com': 'ChatGPT',
};

const PAID_MEDIUMS = /^(cpc|ppc|paid|paidsocial|paid_social|paid-social|ads?|display|cpm)$/i;

export function hostOf(url) {
  try {
    return new URL(String(url)).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function matchHost(host, table) {
  for (const [re, name] of table) if (re.test(host)) return name;
  return null;
}

function titleCase(value) {
  const v = String(value || '').trim();
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : v;
}

/**
 * @param {{ referrer?: string, landingUrl?: string, userAgent?: string, siteHost?: string }} input
 * @returns {{ source: string, medium: string, campaign: string, referrerHost: string }}
 * medium: organic | paid | social | referral | direct | email | campaign
 */
export function classifySource({ referrer = '', landingUrl = '', userAgent = '', siteHost = '' } = {}) {
  let params = new URLSearchParams();
  try {
    params = new URL(String(landingUrl)).searchParams;
  } catch {
    /* URL inválida: segue só com o referrer */
  }
  const utmSource = (params.get('utm_source') || '').trim().toLowerCase();
  const utmMedium = (params.get('utm_medium') || '').trim().toLowerCase();
  const campaign = (params.get('utm_campaign') || '').trim().slice(0, 120);

  const refHost = hostOf(referrer);
  const self = siteHost.replace(/^www\./, '');
  const referrerHost = refHost && refHost !== self ? refHost : '';

  if (utmSource) {
    const source = UTM_ALIASES[utmSource] || titleCase(utmSource).slice(0, 60);
    let medium = 'campaign';
    if (PAID_MEDIUMS.test(utmMedium)) medium = 'paid';
    else if (/social|bio|stories|story|post|reels?/.test(utmMedium)) medium = 'social';
    else if (/e-?mail|newsletter/.test(utmMedium)) medium = 'email';
    else if (/organic/.test(utmMedium)) medium = 'organic';
    return { source, medium, campaign, referrerHost };
  }

  // Identificadores de clique de anúncios chegam sem UTM.
  if (params.get('gclid') || params.get('gbraid') || params.get('wbraid')) {
    return { source: 'Google', medium: 'paid', campaign, referrerHost };
  }

  const ua = String(userAgent);
  // Navegador interno do Instagram/Facebook costuma não mandar referrer.
  const inInstagramApp = /Instagram/i.test(ua);
  const inFacebookApp = /FBAN|FBAV|FB_IAB/i.test(ua);

  if (referrerHost) {
    const engine = matchHost(referrerHost, SEARCH_ENGINES);
    if (engine) return { source: engine, medium: engine === 'ChatGPT' || engine === 'Perplexity' ? 'referral' : 'organic', campaign, referrerHost };
    const social = matchHost(referrerHost, SOCIAL);
    if (social) {
      const paid = params.get('fbclid') && /ads|paid/i.test(params.get('utm_content') || '');
      return { source: social, medium: paid ? 'paid' : 'social', campaign, referrerHost };
    }
    if (/(^|\.)(mail|outlook|gmail)\./.test(referrerHost)) return { source: 'E-mail', medium: 'email', campaign, referrerHost };
    return { source: referrerHost.slice(0, 60), medium: 'referral', campaign, referrerHost };
  }

  if (inInstagramApp || params.get('igshid') || params.get('igsh')) {
    return { source: 'Instagram', medium: 'social', campaign, referrerHost };
  }
  if (inFacebookApp || params.get('fbclid')) {
    return { source: 'Facebook', medium: 'social', campaign, referrerHost };
  }
  return { source: 'Direto', medium: 'direct', campaign, referrerHost };
}

/** @returns {{ device: 'mobile'|'tablet'|'desktop', browser: string, os: string, bot: boolean }} */
export function parseUserAgent(userAgent = '', viewportWidth = 0) {
  const ua = String(userAgent);
  const bot = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp\/|vercel-screenshot/i.test(ua);

  let os = 'Outro';
  if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/CrOS/i.test(ua)) os = 'ChromeOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Outro';
  if (/Instagram/i.test(ua)) browser = 'Instagram (app)';
  else if (/FBAN|FBAV|FB_IAB/i.test(ua)) browser = 'Facebook (app)';
  else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung Internet';
  else if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/Firefox|FxiOS/i.test(ua)) browser = 'Firefox';
  else if (/Chrome|CriOS/i.test(ua)) browser = 'Chrome';
  else if (/Safari/i.test(ua)) browser = 'Safari';

  let device = 'desktop';
  if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) device = 'tablet';
  else if (/Mobi|iPhone|iPod|Android/i.test(ua)) device = 'mobile';
  else if (viewportWidth > 0 && viewportWidth < 768) device = 'mobile';

  return { device, browser, os, bot };
}

export const BR_STATES = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

function decodeHeader(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

// Localização aproximada pelo IP, informada pela Vercel nos cabeçalhos (o IP em si não é guardado).
// Fora da Vercel (ou atrás da Cloudflare) cai nos cabeçalhos equivalentes; sem eles, fica vazio.
export function geoFromHeaders(headers = {}) {
  const country = String(headers['x-vercel-ip-country'] || headers['cf-ipcountry'] || '')
    .toUpperCase()
    .slice(0, 2);
  const regionRaw = String(headers['x-vercel-ip-country-region'] || headers['cf-region-code'] || '').toUpperCase();
  const region = regionRaw.replace(/^[A-Z]{2}-/, '').slice(0, 8);
  const city = decodeHeader(headers['x-vercel-ip-city'] || headers['cf-ipcity']).slice(0, 80);
  return { country: country === 'XX' ? '' : country, region, city };
}
