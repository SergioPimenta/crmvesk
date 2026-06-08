const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = 'places.displayName,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.formattedAddress,nextPageToken';

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

async function searchPage(apiKey, textQuery, pageToken, pageSize) {
  const body = {
    textQuery,
    languageCode: 'pt-BR',
    regionCode: 'BR',
    maxResultCount: Math.min(Math.max(pageSize, 1), 20),
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
    const msg = data?.error?.message || data?.message || `Erro na API Google Places (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export async function searchGoogleMaps({ query, limit = 20, onlyWithPhone = false }) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Configure GOOGLE_MAPS_API_KEY no servidor (Google Cloud → Places API New). Veja .env.example.'
    );
  }

  const textQuery = String(query || '').trim();
  if (!textQuery) throw new Error('Informe o termo de busca');

  const maxResults = Math.min(Math.max(Number(limit) || 20, 1), 60);
  const results = [];
  const seen = new Set();
  let pageToken;

  while (results.length < maxResults) {
    const pageSize = Math.min(20, maxResults - results.length);
    const data = await searchPage(apiKey, textQuery, pageToken, pageSize);
    const places = data.places || [];

    for (const place of places) {
      const item = mapPlace(place);
      if (!item.nome) continue;
      if (onlyWithPhone && item.telefoneRaw.length < 10) continue;
      const key = `${item.nome}|${item.telefoneRaw}|${item.site}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(item);
      if (results.length >= maxResults) break;
    }

    pageToken = data.nextPageToken;
    if (!pageToken || results.length >= maxResults) break;

    // Places API exige pequeno delay antes de usar nextPageToken
    await new Promise((r) => setTimeout(r, 1200));
  }

  return {
    query: textQuery,
    total: results.length,
    results,
  };
}
