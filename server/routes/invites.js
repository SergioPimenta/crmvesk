import express from 'express';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import { acceptInvite, createInvite, getInviteByToken, listInvites, revokeInvite } from '../services/inviteService.js';
import pool from '../db.js';
import { normalizeRow } from '../utils/rows.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

// Rotas públicas (o convidado ainda não tem sessão)
router.get('/:token', async (req, res) => {
  try {
    const invite = await getInviteByToken(req.params.token);
    if (!invite) {
      return res.status(404).json({ message: 'Convite não encontrado' });
    }
    res.json(normalizeRow(invite));
  } catch (error) {
    res.status(500).json({ message: error.message || 'Erro ao carregar convite' });
  }
});

router.post('/:token/accept', rateLimit({ name: 'invite-accept', limit: 10, windowSec: 3600 }), async (req, res) => {
  const { password } = req.body || {};
  const result = await acceptInvite(req.params.token, password);

  if (result.success) {
    res.status(201).json({ token: result.token, user: result.user });
    return;
  }

  res.status(400).json({ message: result.error });
});

// Rotas administrativas (gerenciar convites do próprio workspace)
router.use(verifyToken, requireAdmin);

router.get('/', async (req, res) => {
  try {
    const rows = await listInvites(req.userId);
    res.json(rows.map(normalizeRow));
  } catch (error) {
    res.status(500).json({ message: error.message || 'Erro ao listar convites' });
  }
});

router.post('/', async (req, res) => {
  const { name, email, role } = req.body || {};

  const [inviterRows] = await pool.query('SELECT name FROM users WHERE id = ?', [req.authUserId]);
  const inviterName = inviterRows[0]?.name || 'Administrador';

  const result = await createInvite({
    accountId: req.userId,
    invitedBy: req.authUserId,
    inviterName,
    name,
    email,
    role,
  });

  if (result.success) {
    res.status(201).json({ invite: normalizeRow(result.invite), emailSent: result.emailSent, emailError: result.emailError });
    return;
  }

  res.status(400).json({ message: result.error });
});

router.delete('/:id', async (req, res) => {
  const result = await revokeInvite(req.params.id, req.userId);

  if (result.success) {
    res.status(204).send();
    return;
  }

  const status = result.error === 'Convite não encontrado' ? 404 : 400;
  res.status(status).json({ message: result.error });
});

export default router;
