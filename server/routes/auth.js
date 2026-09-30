import express from 'express';
import pool from '../db.js';
import { registerUser, loginUser } from '../services/authService.js';
import { verifyToken } from '../middleware/auth.js';
import { normalizeRow } from '../utils/rows.js';
import { clientIp, rateLimit } from '../middleware/rateLimit.js';
import { passwordPolicyError } from '../utils/passwordPolicy.js';

const router = express.Router();

const loginPerIp = rateLimit({ name: 'login-ip', limit: 30, windowSec: 900 });
const loginPerAccount = rateLimit({
  name: 'login',
  limit: 8,
  windowSec: 900,
  key: (req) => `${clientIp(req)}:${String(req.body?.email || '').trim().toLowerCase()}`,
});

// Novos usuários entram por convite (/api/invites) ou são criados por um administrador (/api/users).
// O cadastro público só existe se ALLOW_PUBLIC_REGISTER=true (ex.: instalação nova/ambiente de testes).
router.post('/register', rateLimit({ name: 'register', limit: 5, windowSec: 3600 }), async (req, res) => {
  if (process.env.ALLOW_PUBLIC_REGISTER !== 'true') {
    return res.status(403).json({ message: 'Cadastro desativado. Peça um convite ao administrador.' });
  }
  const { name, email, password } = req.body;
  const policyError = passwordPolicyError(password);
  if (policyError) return res.status(400).json({ message: policyError });
  
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const result = await registerUser(name, email, password);

  if (result.success) {
    res.status(201).json({ message: 'User registered successfully', id: result.id });
  } else {
    res.status(400).json({ message: result.error });
  }
});

router.post('/login', loginPerIp, loginPerAccount, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const result = await loginUser(email, password);

  if (result.success) {
    res.status(200).json({ token: result.token, user: normalizeRow(result.user) });
  } else {
    res.status(401).json({ message: result.error });
  }
});

router.get('/me', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, role, active FROM users WHERE id = ?',
      [req.authUserId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }
    if (rows[0].active === false) {
      return res.status(403).json({ message: 'Conta desativada' });
    }
    res.status(200).json(normalizeRow(rows[0]));
  } catch (error) {
    res.status(500).json({ message: error.message || 'Erro ao carregar perfil' });
  }
});

export default router;
