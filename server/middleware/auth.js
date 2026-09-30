import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import pool from '../db.js';
import { logger } from '../utils/logger.js';

dotenv.config();

const USER_CACHE_TTL_MS = 15_000;
const REFRESH_AFTER_SEC = 30 * 60;

// Perfil, status e workspace vêm do banco (com cache curto por instância) e não do token: desativar ou
// rebaixar um usuário passa a valer em segundos, não só quando o token de 4 h expira.
const userCache = new Map();

export function invalidateAuthCache(userId) {
  if (userId === undefined) userCache.clear();
  else userCache.delete(Number(userId));
}

async function loadAuthUser(id) {
  const cached = userCache.get(id);
  if (cached && cached.expires > Date.now()) return cached.user;

  const [rows] = await pool.query('SELECT id, email, role, active, account_id FROM users WHERE id = ?', [id]);
  const row = rows[0];
  const user = row
    ? {
        id: Number(row.id),
        email: row.email,
        role: row.role || 'user',
        active: row.active !== false,
        accountId: Number(row.account_id || row.id),
      }
    : null;
  userCache.set(id, { user, expires: Date.now() + USER_CACHE_TTL_MS });
  return user;
}

export const verifyToken = async (req, res, next) => {
  const token = req.headers['authorization'];

  if (!token) {
    return res.status(403).json({ message: 'No token provided' });
  }

  // Expecting format: Bearer <token>
  const tokenParts = token.split(' ');
  if (tokenParts[0] !== 'Bearer' || !tokenParts[1]) {
    return res.status(401).json({ message: 'Unauthorized - invalid token format' });
  }

  let decoded;
  try {
    decoded = jwt.verify(tokenParts[1], process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Unauthorized - invalid token' });
  }

  let user;
  try {
    user = await loadAuthUser(Number(decoded.id));
  } catch (err) {
    logger.error('verify_token_db_failed', { error: err });
    return res.status(503).json({ message: 'Serviço temporariamente indisponível' });
  }

  if (!user || !user.active) {
    return res.status(401).json({ message: 'Unauthorized - sessão inválida ou conta desativada' });
  }

  // authUserId = identidade real de quem logou (para "sou eu mesmo?", subscriptions de push etc.)
  // userId = id do workspace/conta (dono original convidou membros) — usado para escopar todos os
  // dados do CRM (leads, pipeline, whatsapp, relatórios), que agora são compartilhados pela conta.
  req.authUserId = user.id;
  req.userId = user.accountId;
  req.userRole = user.role;

  // Sessão deslizante: quem está usando o sistema recebe um token novo a cada ~30 min e não é deslogado
  // no meio do trabalho. O front guarda o valor do cabeçalho X-Refresh-Token.
  if (decoded.iat && Date.now() / 1000 - decoded.iat > REFRESH_AFTER_SEC) {
    const refreshed = jwt.sign(
      { id: user.id, role: user.role, email: user.email, accountId: user.accountId },
      process.env.JWT_SECRET,
      { expiresIn: '4h' }
    );
    res.setHeader('X-Refresh-Token', refreshed);
    res.setHeader('Access-Control-Expose-Headers', 'X-Refresh-Token');
  }

  return next();
};

export const requireAdmin = (req, res, next) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ message: 'Acesso restrito a administradores' });
  }
  return next();
};
