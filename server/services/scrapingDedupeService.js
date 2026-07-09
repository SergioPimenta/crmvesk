import pool from '../db.js';

function digitsOnly(s) {
  return String(s || '').replace(/\D/g, '');
}

function stripAccents(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Normaliza o termo para agrupar variações (acentos, caixa, espaços). */
export function normalizeTerm(query) {
  return stripAccents(String(query || '').toLowerCase())
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 255);
}

/** Chave estável de um resultado: prioriza site, depois telefone, depois nome+endereço. */
function resultKey(r) {
  const site = stripAccents(String(r.site || '').toLowerCase())
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
    .trim();
  if (site) return `site:${site}`.slice(0, 512);

  const phone = digitsOnly(r.telefoneRaw || r.telefone);
  if (phone.length >= 10) return `tel:${phone}`;

  const nome = stripAccents(String(r.nome || '').toLowerCase()).replace(/\s+/g, ' ').trim();
  const end = stripAccents(String(r.endereco || '').toLowerCase()).replace(/\s+/g, ' ').trim();
  return `nome:${nome}|${end}`.slice(0, 512);
}

/**
 * Filtra os resultados removendo os que já foram trazidos antes para o mesmo
 * termo (por usuário). Retorna até `limit` resultados novos e marca esses como
 * vistos, de forma que buscas repetidas paginem por resultados inéditos.
 */
export async function filterNewResults(userId, query, results, limit) {
  const term = normalizeTerm(query);
  const list = Array.isArray(results) ? results : [];
  if (!term || !list.length) {
    return { term, results: list, newAvailable: 0, totalFetched: list.length };
  }

  const [rows] = await pool.query(
    'SELECT result_key FROM scraping_seen WHERE user_id = ? AND term = ?',
    [userId, term]
  );
  const seen = new Set(rows.map((r) => r.result_key));

  const batchSeen = new Set();
  const fresh = [];
  for (const item of list) {
    const key = resultKey(item);
    if (seen.has(key) || batchSeen.has(key)) continue;
    batchSeen.add(key);
    fresh.push({ item, key });
  }

  const take = Number(limit) > 0 ? Number(limit) : fresh.length;
  const toReturn = fresh.slice(0, take);

  if (toReturn.length) {
    const values = toReturn.map(() => '(?, ?, ?)').join(', ');
    const params = toReturn.flatMap(({ key }) => [userId, term, key]);
    await pool.query(
      `INSERT INTO scraping_seen (user_id, term, result_key) VALUES ${values}
       ON CONFLICT (user_id, term, result_key) DO NOTHING`,
      params
    );
  }

  return {
    term,
    results: toReturn.map((x) => x.item),
    newAvailable: fresh.length,
    totalFetched: list.length,
  };
}
