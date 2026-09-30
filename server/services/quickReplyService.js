import pool from '../db.js';
import { normalizeRows } from '../utils/rows.js';

const MAX_TEXT = 1000;

/** "/Boas-Vindas" -> "boas-vindas". Só letras minúsculas, números, hífen e sublinhado. */
export function normalizeShortcut(value) {
  return String(value || '')
    .trim()
    .replace(/^\/+/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function validate({ shortcut, text }) {
  const key = normalizeShortcut(shortcut);
  if (!/^[a-z0-9_-]{1,30}$/.test(key)) {
    throw new Error('O atalho deve ter de 1 a 30 caracteres: letras, números, hífen ou sublinhado');
  }
  const body = String(text || '').trim();
  if (!body) throw new Error('Escreva o texto da resposta');
  if (body.length > MAX_TEXT) throw new Error(`A resposta pode ter no máximo ${MAX_TEXT} caracteres`);
  return { key, body };
}

const toDto = (r) => ({
  id: String(r.id),
  shortcut: r.shortcut,
  text: r.text,
  createdBy: r.createdby != null ? Number(r.createdby) : r.createdBy != null ? Number(r.createdBy) : null,
});

/** Respostas rápidas são da equipe: todos do workspace usam; cada um edita as suas (administrador edita todas). */
export async function listQuickReplies(accountId) {
  const [rows] = await pool.query(
    'SELECT id, shortcut, body AS text, created_by AS createdBy FROM quick_replies WHERE user_id = ? ORDER BY shortcut ASC',
    [accountId]
  );
  return normalizeRows(rows).map(toDto);
}

export async function createQuickReply(accountId, authorId, input) {
  const { key, body } = validate(input);
  const [dup] = await pool.query('SELECT id FROM quick_replies WHERE user_id = ? AND shortcut = ?', [accountId, key]);
  if (dup.length) throw new Error(`Já existe uma resposta com o atalho /${key}`);
  const [, rows] = await pool.query(
    `INSERT INTO quick_replies (user_id, created_by, shortcut, body) VALUES (?, ?, ?, ?)
     RETURNING id, shortcut, body AS text, created_by AS createdBy`,
    [accountId, authorId, key, body]
  );
  return toDto(normalizeRows(rows)[0]);
}

async function loadOwned(accountId, id, actor) {
  const [rows] = await pool.query('SELECT id, created_by FROM quick_replies WHERE id = ? AND user_id = ?', [id, accountId]);
  if (!rows.length) throw new Error('Resposta rápida não encontrada');
  const owner = rows[0].created_by;
  if (!actor.isAdmin && String(owner) !== String(actor.id)) {
    const err = new Error('Você só pode alterar as respostas que criou');
    err.statusCode = 403;
    throw err;
  }
}

export async function updateQuickReply(accountId, actor, id, input) {
  await loadOwned(accountId, id, actor);
  const { key, body } = validate(input);
  const [dup] = await pool.query('SELECT id FROM quick_replies WHERE user_id = ? AND shortcut = ? AND id <> ?', [
    accountId,
    key,
    id,
  ]);
  if (dup.length) throw new Error(`Já existe uma resposta com o atalho /${key}`);
  const [, rows] = await pool.query(
    `UPDATE quick_replies SET shortcut = ?, body = ?, updated_at = NOW() WHERE id = ? AND user_id = ?
     RETURNING id, shortcut, body AS text, created_by AS createdBy`,
    [key, body, id, accountId]
  );
  return toDto(normalizeRows(rows)[0]);
}

export async function deleteQuickReply(accountId, actor, id) {
  await loadOwned(accountId, id, actor);
  await pool.query('DELETE FROM quick_replies WHERE id = ? AND user_id = ?', [id, accountId]);
}
