import crypto from 'node:crypto';
import express from 'express';
import { processDueReminders } from '../services/reminderService.js';

// Rotas chamadas por um agendador (Vercel Cron ou um serviço externo como cron-job.org), não por pessoas.
// Protegidas por CRON_SECRET: o agendador envia "Authorization: Bearer <CRON_SECRET>" (a Vercel faz isso sozinha).
const router = express.Router();

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 503, message: 'CRON_SECRET não configurado no servidor' };
  const header = String(req.headers.authorization || '');
  const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
  const expected = Buffer.from(secret);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return { ok: false, status: 401, message: 'Não autorizado' };
  }
  return { ok: true };
}

// Dispara os lembretes da Agenda que já venceram. Rode a cada minuto.
router.get('/reminders', async (req, res) => {
  const auth = authorized(req);
  if (!auth.ok) return res.status(auth.status).json({ message: auth.message });
  res.json(await processDueReminders());
});

export default router;
