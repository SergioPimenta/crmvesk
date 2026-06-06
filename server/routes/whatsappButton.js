import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
  createWidget,
  deleteWidget,
  listWidgets,
  updateWidget,
} from '../services/whatsappButtonService.js';

const router = express.Router();

router.use(verifyToken);

router.get('/widgets', async (req, res) => {
  try {
    const widgets = await listWidgets(req.userId);
    res.json({ widgets });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erro ao listar widgets' });
  }
});

router.post('/widgets', async (req, res) => {
  try {
    const widget = await createWidget(req.userId, req.body);
    res.status(201).json({ widget });
  } catch (err) {
    res.status(400).json({ message: err.message || 'Erro ao criar widget' });
  }
});

router.put('/widgets/:id', async (req, res) => {
  try {
    const widget = await updateWidget(req.userId, req.params.id, req.body);
    res.json({ widget });
  } catch (err) {
    res.status(400).json({ message: err.message || 'Erro ao atualizar widget' });
  }
});

router.delete('/widgets/:id', async (req, res) => {
  try {
    await deleteWidget(req.userId, req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ message: err.message || 'Erro ao excluir widget' });
  }
});

export default router;
