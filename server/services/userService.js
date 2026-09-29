import bcrypt from 'bcryptjs';
import pool from '../db.js';

const stageMap = {
  prospeccao: { titulo: 'Prospecção', cor: '#7a7880', pos: 0 },
  qualificacao: { titulo: 'Qualificação', cor: '#378add', pos: 1 },
  proposta: { titulo: 'Proposta', cor: '#ef9f27', pos: 2 },
  negociacao: { titulo: 'Negociação', cor: '#4ab3b8', pos: 3 },
  fechado: { titulo: 'Fechado', cor: '#4caf82', pos: 4 },
};

export async function ensureDefaultPipelineForUser(userId) {
  const [existing] = await pool.query('SELECT id FROM pipelines WHERE user_id = ? LIMIT 1', [userId]);
  let pipelineId = existing[0]?.id;

  if (!pipelineId) {
    const [ins] = await pool.query('INSERT INTO pipelines (user_id, nome, is_default) VALUES (?, ?, TRUE)', [
      userId,
      'Funil padrão',
    ]);
    pipelineId = ins.insertId;
  }

  const [stageCount] = await pool.query(
    'SELECT COUNT(*)::int AS c FROM pipeline_stages WHERE user_id = ? AND pipeline_id = ?',
    [userId, pipelineId]
  );

  if (Number(stageCount[0]?.c) === 0) {
    for (const [key, meta] of Object.entries(stageMap)) {
      await pool.query(
        'INSERT INTO pipeline_stages (user_id, pipeline_id, stage_key, titulo, cor, pos) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, pipelineId, key, meta.titulo, meta.cor, meta.pos]
      );
    }
  }

  return pipelineId;
}

export async function listUsers(accountId) {
  const [rows] = await pool.query(
    `SELECT id, name, email, role, active, created_at AS createdAt
     FROM users
     WHERE id = ? OR account_id = ?
     ORDER BY active DESC, name ASC, id ASC`,
    [accountId, accountId]
  );
  return rows;
}

export async function createUser({ name, email, password, role = 'user', accountId }) {
  try {
    const trimmedName = String(name || '').trim();
    const trimmedEmail = String(email || '').trim().toLowerCase();

    if (!trimmedName || !trimmedEmail || !password) {
      throw new Error('Nome, e-mail e senha são obrigatórios');
    }

    if (!['admin', 'user'].includes(role)) {
      throw new Error('Perfil inválido');
    }

    const [existingUsers] = await pool.query('SELECT id FROM users WHERE email = ?', [trimmedEmail]);
    if (existingUsers.length > 0) {
      throw new Error('E-mail já cadastrado');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const [result] = await pool.query(
      'INSERT INTO users (name, email, password, role, active, account_id) VALUES (?, ?, ?, ?, TRUE, ?)',
      [trimmedName, trimmedEmail, hashedPassword, role, accountId]
    );

    const userId = result.insertId;
    // Usuário passa a compartilhar os dados (leads, pipeline etc.) da conta que o cadastrou.
    await ensureDefaultPipelineForUser(accountId);

    const [rows] = await pool.query(
      'SELECT id, name, email, role, active, created_at AS createdAt FROM users WHERE id = ?',
      [userId]
    );

    return { success: true, user: rows[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function updateUser(id, { name, email, role, active, password }, actorAuthUserId, accountId) {
  try {
    const userId = Number(id);
    if (!Number.isFinite(userId)) {
      throw new Error('Usuário inválido');
    }

    if (actorAuthUserId && userId === Number(actorAuthUserId) && active === false) {
      throw new Error('Você não pode desativar sua própria conta');
    }

    const [currentRows] = await pool.query(
      'SELECT id, email FROM users WHERE id = ? AND (id = ? OR account_id = ?)',
      [userId, accountId, accountId]
    );
    if (currentRows.length === 0) {
      throw new Error('Usuário não encontrado');
    }

    const trimmedName = String(name || '').trim();
    const trimmedEmail = String(email || '').trim().toLowerCase();

    if (!trimmedName || !trimmedEmail) {
      throw new Error('Nome e e-mail são obrigatórios');
    }

    if (role && !['admin', 'user'].includes(role)) {
      throw new Error('Perfil inválido');
    }

    const [emailRows] = await pool.query('SELECT id FROM users WHERE email = ? AND id <> ?', [
      trimmedEmail,
      userId,
    ]);
    if (emailRows.length > 0) {
      throw new Error('E-mail já cadastrado');
    }

    const fields = ['name = ?', 'email = ?'];
    const params = [trimmedName, trimmedEmail];

    if (role) {
      fields.push('role = ?');
      params.push(role);
    }

    if (typeof active === 'boolean') {
      fields.push('active = ?');
      params.push(active);
    }

    if (password) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      fields.push('password = ?');
      params.push(hashedPassword);
    }

    params.push(userId);

    const [, rows] = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ? RETURNING id, name, email, role, active, created_at AS createdAt`,
      params
    );

    if (rows.length === 0) {
      throw new Error('Usuário não encontrado');
    }

    return { success: true, user: rows[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function setUserActive(id, active, actorAuthUserId, accountId) {
  try {
    const userId = Number(id);
    if (!Number.isFinite(userId)) {
      throw new Error('Usuário inválido');
    }

    if (typeof active !== 'boolean') {
      throw new Error('Status inválido');
    }

    if (actorAuthUserId && userId === Number(actorAuthUserId) && active === false) {
      throw new Error('Você não pode desativar sua própria conta');
    }

    const [currentRows] = await pool.query(
      'SELECT id, role FROM users WHERE id = ? AND (id = ? OR account_id = ?)',
      [userId, accountId, accountId]
    );
    if (currentRows.length === 0) {
      throw new Error('Usuário não encontrado');
    }

    if (currentRows[0].role === 'admin' && active === false) {
      const [adminRows] = await pool.query(
        `SELECT COUNT(*)::int AS c FROM users
         WHERE role = 'admin' AND active = TRUE AND id <> ? AND (id = ? OR account_id = ?)`,
        [userId, accountId, accountId]
      );
      if (Number(adminRows[0]?.c) === 0) {
        throw new Error('Não é possível desativar o único administrador');
      }
    }

    const [, rows] = await pool.query(
      `UPDATE users SET active = ? WHERE id = ? RETURNING id, name, email, role, active, created_at AS createdAt`,
      [active, userId]
    );

    if (rows.length === 0) {
      throw new Error('Usuário não encontrado');
    }

    return { success: true, user: rows[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function deleteUser(id, actorAuthUserId, accountId) {
  try {
    const userId = Number(id);
    if (!Number.isFinite(userId)) {
      throw new Error('Usuário inválido');
    }

    if (actorAuthUserId && userId === Number(actorAuthUserId)) {
      throw new Error('Você não pode excluir sua própria conta');
    }

    const [currentRows] = await pool.query(
      'SELECT id, role FROM users WHERE id = ? AND (id = ? OR account_id = ?)',
      [userId, accountId, accountId]
    );
    if (currentRows.length === 0) {
      throw new Error('Usuário não encontrado');
    }

    if (currentRows[0].role === 'admin') {
      const [adminRows] = await pool.query(
        `SELECT COUNT(*)::int AS c FROM users WHERE role = 'admin' AND (id = ? OR account_id = ?)`,
        [accountId, accountId]
      );
      if (Number(adminRows[0]?.c) <= 1) {
        throw new Error('Não é possível excluir o único administrador');
      }
    }

    await pool.query('DELETE FROM users WHERE id = ?', [userId]);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
