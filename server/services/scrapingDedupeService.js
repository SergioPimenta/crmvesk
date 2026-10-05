import pool from '../db.js';
import { canonicalWhatsAppPhone } from '../utils/whatsappPhone.js';

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

function normalizeSite(site) {
  return stripAccents(String(site || '').toLowerCase())
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '')
    .trim();
}

function normalizeName(nome) {
  return stripAccents(String(nome || '').toLowerCase()).replace(/\s+/g, ' ').trim();
}

function phoneKeys(phone) {
  const raw = digitsOnly(phone);
  if (raw.length < 10) return [];
  const canon = canonicalWhatsAppPhone(raw);
  return [...new Set([`tel:${canon}`, `tel:${raw}`])];
}

/**
 * Todas as chaves que identificam um resultado (site, telefone, nome+endereço).
 * Basta uma delas coincidir para considerar a empresa a mesma.
 */
function resultKeys(r) {
  const keys = [];
  const site = normalizeSite(r.site);
  if (site) keys.push(`site:${site}`.slice(0, 512));
  keys.push(...phoneKeys(r.telefoneRaw || r.telefone));
  const nome = normalizeName(r.nome);
  const end = normalizeName(r.endereco);
  if (nome) keys.push(`nome:${nome}|${end}`.slice(0, 512));
  return keys;
}

/** Telefones/sites/nomes que o usuário já tem salvos como contato ou já tem conversa no WhatsApp. */
async function loadKnownIdentities(userId) {
  const [contactRows] = await pool.query('SELECT nome, telefone, site FROM contacts WHERE user_id = ?', [userId]);
  const [chatRows] = await pool.query('SELECT remote_jid, name FROM whatsapp_chats WHERE user_id = ?', [userId]);

  const contactPhones = new Set();
  const contactSites = new Set();
  const contactNames = new Set();
  for (const c of contactRows) {
    for (const k of phoneKeys(c.telefone)) contactPhones.add(k);
    const site = normalizeSite(c.site);
    if (site) contactSites.add(site);
    const nome = normalizeName(c.nome);
    if (nome) contactNames.add(nome);
  }

  // Qualquer conversa existente (enviamos ou recebemos) significa que já houve contato por WhatsApp.
  const chatPhones = new Set();
  for (const ch of chatRows) {
    const jid = String(ch.remote_jid || '');
    if (jid.includes('@g.us')) continue;
    for (const k of phoneKeys(jid.split('@')[0])) chatPhones.add(k);
  }
  return { contactPhones, contactSites, contactNames, chatPhones };
}

/**
 * Remove dos resultados o que o usuário já tem: já trazido em qualquer busca anterior (qualquer termo),
 * já salvo como contato ou já com conversa no WhatsApp. Retorna até `limit` resultados realmente novos
 * e os marca como vistos, para que nenhuma busca futura os devolva de novo.
 */
export async function filterNewResults(userId, query, results, limit) {
  const term = normalizeTerm(query);
  const list = Array.isArray(results) ? results : [];
  const skipped = { seen: 0, contact: 0, whatsapp: 0, batch: 0 };
  if (!term || !list.length) {
    return { term, results: list, newAvailable: 0, totalFetched: list.length, skipped };
  }

  const entries = list.map((item) => ({ item, keys: resultKeys(item) }));
  const allKeys = [...new Set(entries.flatMap((e) => e.keys))];

  const seen = new Set();
  if (allKeys.length) {
    const [rows] = await pool.query(
      `SELECT DISTINCT result_key FROM scraping_seen WHERE user_id = ? AND result_key IN (${allKeys.map(() => '?').join(', ')})`,
      [userId, ...allKeys]
    );
    for (const r of rows) seen.add(r.result_key);
  }

  const known = await loadKnownIdentities(userId);
  const batchKeys = new Set();
  const fresh = [];
  for (const entry of entries) {
    const { item, keys } = entry;
    const phones = phoneKeys(item.telefoneRaw || item.telefone);
    const site = normalizeSite(item.site);
    const nome = normalizeName(item.nome);

    if (phones.some((k) => known.chatPhones.has(k))) {
      skipped.whatsapp += 1;
    } else if (
      phones.some((k) => known.contactPhones.has(k)) ||
      (site && known.contactSites.has(site)) ||
      (!phones.length && !site && nome && known.contactNames.has(nome))
    ) {
      skipped.contact += 1;
    } else if (keys.some((k) => seen.has(k))) {
      skipped.seen += 1;
    } else if (keys.some((k) => batchKeys.has(k))) {
      skipped.batch += 1;
    } else {
      keys.forEach((k) => batchKeys.add(k));
      fresh.push(entry);
    }
  }

  const take = Number(limit) > 0 ? Number(limit) : fresh.length;
  const toReturn = fresh.slice(0, take);

  const rowsToMark = toReturn.flatMap(({ keys }) => keys.map((key) => [userId, term, key]));
  if (rowsToMark.length) {
    await pool.query(
      `INSERT INTO scraping_seen (user_id, term, result_key) VALUES ${rowsToMark.map(() => '(?, ?, ?)').join(', ')}
       ON CONFLICT (user_id, term, result_key) DO NOTHING`,
      rowsToMark.flat()
    );
  }

  return {
    term,
    results: toReturn.map((x) => x.item),
    newAvailable: fresh.length,
    totalFetched: list.length,
    skipped,
  };
}
