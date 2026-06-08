import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK =
  'places.displayName,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.formattedAddress,nextPageToken';
const SCRAPER_CLI = path.join(__dirname, '../../scraper/scrape_cli.py');
const PYTHON_TIMEOUT_MS = 300000;

function digitsOnly(phone) {
  return String(phone || '').replace(/\D/g, '');
}

export function formatPhoneBR(phone) {
  if (!phone) return '—';
  const d = digitsOnly(phone);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

function mapPlace(place) {
  const nome = place.displayName?.text || place.displayName || '';
  const rawPhone = place.nationalPhoneNumber || place.internationalPhoneNumber || '';
  const site = place.websiteUri || '';
  return {
    nome: String(nome).trim(),
    telefone: formatPhoneBR(rawPhone),
    telefoneRaw: digitsOnly(rawPhone),
    site: site.trim(),
    endereco: place.formattedAddress || '',
  };
}

function filterResults(results, onlyWithPhone) {
  if (!onlyWithPhone) return results;
  return results.filter((r) => digitsOnly(r.telefoneRaw || r.telefone).length >= 10);
}

function pythonAvailable() {
  return fs.existsSync(SCRAPER_CLI);
}

function runPythonCli({ query, limit, headless, onlyWithPhone }) {
  return new Promise((resolve, reject) => {
    const pythonBin = process.env.PYTHON_PATH || process.env.PYTHON || 'python';
    const args = [
      SCRAPER_CLI,
      '--query',
      query,
      '--limit',
      String(limit),
      onlyWithPhone ? '--only-with-phone' : '',
    ].filter(Boolean);

    if (headless) args.push('--headless');
    else args.push('--no-headless');

    const proc = spawn(pythonBin, args, {
      cwd: path.join(__dirname, '../..'),
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Scraper Python excedeu o tempo limite (5 min). Reduza a quantidade.'));
    }, PYTHON_TIMEOUT_MS);

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        reject(
          new Error(
            'Python não encontrado. Instale Python 3, rode: pip install -r scraper/requirements.txt && playwright install chromium'
          )
        );
        return;
      }
      reject(err);
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || 'Scraper Python falhou. Verifique Playwright e Chromium.'));
        return;
      }
      try {
        const data = JSON.parse(stdout);
        resolve(data);
      } catch {
        reject(new Error('Resposta inválida do scraper Python.'));
      }
    });
  });
}

async function warmUpScraper(base) {
  try {
    await fetch(`${base}/health`, { signal: AbortSignal.timeout(45000) });
  } catch {
    // cold start — aguarda e segue
    await new Promise((r) => setTimeout(r, 8000));
  }
}

function scraperBaseUrl() {
  return String(process.env.MAPS_SCRAPER_URL || '').replace(/\/$/, '');
}

async function postScraperJson(base, path, body, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data?.message || data?.detail;
      if (res.status === 502) {
        throw new Error(
          detail ||
            'Serviço scraper indisponível (502). Aguarde 30s e tente de novo com menos resultados.'
        );
      }
      throw new Error(detail || `Erro no serviço scraper (${res.status})`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function getScraperJson(base, path, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, { signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.message || data?.detail || `Erro no serviço scraper (${res.status})`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function startGoogleMapsSearch({
  query,
  limit = 10,
  headless = true,
  onlyWithPhone = false,
}) {
  const textQuery = String(query || '').trim();
  if (!textQuery) throw new Error('Informe o termo de busca');

  const maxResults = Math.min(Math.max(Number(limit) || 10, 1), 30);
  const opts = { query: textQuery, limit: maxResults, headless: headless !== false, onlyWithPhone };
  const base = scraperBaseUrl();

  if (base) {
    await warmUpScraper(base);
    try {
      const data = await postScraperJson(base, '/search/async', opts);
      return { mode: 'async', jobId: data.jobId, status: data.status || 'running' };
    } catch (err) {
      if (!String(err.message || '').includes('502')) throw err;
      await new Promise((r) => setTimeout(r, 12000));
      await warmUpScraper(base);
      const data = await postScraperJson(base, '/search/async', opts);
      return { mode: 'async', jobId: data.jobId, status: data.status || 'running' };
    }
  }

  const onVercel = Boolean(process.env.VERCEL);
  const preferPython = process.env.MAPS_SCRAPER_MODE !== 'api';
  if (!onVercel && preferPython && pythonAvailable()) {
    const data = await runPythonCli(opts);
    return { mode: 'sync', ...data };
  }

  const apiResult = await searchViaPlacesApi(opts);
  if (apiResult) return { mode: 'sync', ...apiResult };

  throw new Error(
    onVercel
      ? 'Configure MAPS_SCRAPER_URL apontando para o serviço Python (scraper/main.py).'
      : 'Scraper Python não configurado. Rode npm run scraper e defina MAPS_SCRAPER_URL no server/.env'
  );
}

export async function getGoogleMapsSearchStatus(jobId) {
  const base = scraperBaseUrl();
  if (!base) throw new Error('MAPS_SCRAPER_URL não configurado');
  if (!jobId) throw new Error('Job inválido');
  return getScraperJson(base, `/search/status/${encodeURIComponent(jobId)}`);
}

async function searchViaHttpService({ query, limit, headless, onlyWithPhone }) {
  const base = scraperBaseUrl();
  if (!base) return null;

  await warmUpScraper(base);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PYTHON_TIMEOUT_MS);

  try {
    const res = await fetch(`${base}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit, headless, onlyWithPhone }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.message || data?.detail || `Erro no serviço scraper (${res.status})`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function searchViaPlacesApi({ query, limit, onlyWithPhone }) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  const maxResults = Math.min(Math.max(Number(limit) || 20, 1), 60);
  const results = [];
  const seen = new Set();
  let pageToken;

  while (results.length < maxResults) {
    const pageSize = Math.min(20, maxResults - results.length);
    const body = {
      textQuery: query,
      languageCode: 'pt-BR',
      regionCode: 'BR',
      maxResultCount: pageSize,
    };
    if (pageToken) body.pageToken = pageToken;

    const res = await fetch(PLACES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error?.message || `Erro na API Google Places (${res.status})`);
    }

    for (const place of data.places || []) {
      const item = mapPlace(place);
      if (!item.nome) continue;
      const key = `${item.nome}|${item.telefoneRaw}|${item.site}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(item);
      if (results.length >= maxResults) break;
    }

    pageToken = data.nextPageToken;
    if (!pageToken || results.length >= maxResults) break;
    await new Promise((r) => setTimeout(r, 1200));
  }

  return {
    query,
    total: filterResults(results, onlyWithPhone).length,
    results: filterResults(results, onlyWithPhone),
    source: 'google-places-api',
  };
}

export async function searchGoogleMaps({
  query,
  limit = 20,
  headless = true,
  onlyWithPhone = false,
}) {
  const textQuery = String(query || '').trim();
  if (!textQuery) throw new Error('Informe o termo de busca');

  const maxResults = Math.min(Math.max(Number(limit) || 20, 1), 60);
  const opts = { query: textQuery, limit: maxResults, headless: headless !== false, onlyWithPhone };

  // 1) Serviço Python HTTP (produção ou local com uvicorn)
  const httpResult = await searchViaHttpService(opts);
  if (httpResult) return httpResult;

  // 2) Subprocess Python local (dev) — não roda na Vercel
  const onVercel = Boolean(process.env.VERCEL);
  const preferPython = process.env.MAPS_SCRAPER_MODE !== 'api';
  if (!onVercel && preferPython && pythonAvailable()) {
    return runPythonCli(opts);
  }

  // 3) Google Places API (opcional, pago)
  const apiResult = await searchViaPlacesApi(opts);
  if (apiResult) return apiResult;

  throw new Error(
    onVercel
      ? 'Configure MAPS_SCRAPER_URL apontando para o serviço Python (scraper/main.py). ' +
          'Na Vercel o scraper gratuito roda em servidor separado; veja scraper/requirements.txt.'
      : 'Scraper Python não configurado. No terminal: pip install -r scraper/requirements.txt && playwright install chromium && ' +
          'uvicorn main:app --app-dir scraper --port 8765. Depois defina MAPS_SCRAPER_URL=http://localhost:8765 no server/.env'
  );
}
