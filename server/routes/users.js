import express from 'express';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import { createUser, listActiveUsers, updateUser } from '../services/userService.js';
import { normalizeRow, normalizeRows } from '../utils/rows.js';

const router = express.Router();

router.use(verifyToken, requireAdmin);

router.get('/', async (_req, res) => {
  try {
    const rows = await listActiveUsers();
    res.json(normalizeRows(rows));
  } catch (error) {
    res.status(500).json({ message: error.message || 'Erro ao listar usuários' });
  }
});

router.post('/', async (req, res) => {
  const { name, email, password, role } = req.body || {};
  const result = await createUser({ name, email, password, role });

  if (result.success) {
    res.status(201).json(normalizeRow(result.user));
    return;
  }

  res.status(400).json({ message: result.error });
});

router.put('/:id', async (req, res) => {
  const { name, email, role, active, password } = req.body || {};
  const result = await updateUser(req.params.id, { name, email, role, active, password }, req.userId);

  if (result.success) {
    res.json(normalizeRow(result.user));
    return;
  }

  const status = result.error === 'Usuário não encontrado' ? 404 : 400;
  res.status(status).json({ message: result.error });
});

export default router;
