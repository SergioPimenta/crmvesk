import pool from '../db.js';

const toId = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** O usuário pertence ao workspace (é o dono da conta ou foi convidado para ela)? */
export async function isWorkspaceMember(accountId, userId) {
  const [rows] = await pool.query('SELECT id FROM users WHERE id = ? AND (id = ? OR account_id = ?)', [
    userId,
    accountId,
    accountId,
  ]);
  return rows.length > 0;
}

/**
 * Valida a configuração de responsável de um botão/formulário antes de salvar.
 * Retorna { ownerUserId, ownerRoundRobin }; rodízio tem prioridade sobre um usuário fixo.
 */
export async function normalizeOwnerSetting(accountId, { ownerUserId, ownerRoundRobin } = {}) {
  if (ownerRoundRobin === true || ownerRoundRobin === 'true') {
    return { ownerUserId: null, ownerRoundRobin: true };
  }
  const id = toId(ownerUserId);
  if (id === null) return { ownerUserId: null, ownerRoundRobin: false };
  if (!(await isWorkspaceMember(accountId, id))) throw new Error('Responsável inválido para este workspace');
  return { ownerUserId: id, ownerRoundRobin: false };
}

/**
 * Descobre quem recebe um lead novo: o responsável fixo (se ainda ativo), ou, no rodízio, o usuário comum
 * ativo que está há mais tempo sem receber um lead de site. Sem configuração (ou sem ninguém elegível),
 * devolve null — o lead fica sem dono e só administradores o veem.
 */
export async function resolveLeadOwner(accountId, { ownerUserId, ownerRoundRobin } = {}) {
  const fixedId = toId(ownerUserId);
  if (fixedId !== null) {
    const [rows] = await pool.query(
      'SELECT id FROM users WHERE id = ? AND active IS NOT FALSE AND (id = ? OR account_id = ?)',
      [fixedId, accountId, accountId]
    );
    if (rows.length) return fixedId;
  }

  if (ownerRoundRobin) {
    const [rows] = await pool.query(
      `SELECT u.id FROM users u
       WHERE u.active IS NOT FALSE AND u.role = 'user' AND (u.id = ? OR u.account_id = ?)
       ORDER BY (
         SELECT MAX(c.created_at) FROM contacts c
         WHERE c.user_id = ? AND c.created_by = u.id
           AND (c.ultima_interacao LIKE 'Lead via botão%' OR c.ultima_interacao LIKE 'Formulário de contato%')
       ) ASC NULLS FIRST, u.id ASC
       LIMIT 1`,
      [accountId, accountId, accountId]
    );
    if (rows.length) return Number(rows[0].id);
  }

  return null;
}
