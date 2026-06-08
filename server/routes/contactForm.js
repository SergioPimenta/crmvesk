import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
  createFormWidget,
  deleteFormWidget,
  listFormWidgets,
  updateFormWidget,
} from '../services/contactFormService.js';

const router = express.Router();

router.use(verifyToken);

router.get('/widgets', async (req, res) => {
  try {
    const widgets = await listFormWidgets(req.userId);
    res.json({ widgets });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erro ao listar rastreadores' });
  }
});

router.post('/widgets', async (req, res) => {
  try {
    const widget = await createFormWidget(req.userId, req.body);
    res.status(201).json({ widget });
  } catch (err) {
    res.status(400).json({ message: err.message || 'Erro ao criar rastreador' });
  }
});

router.put('/widgets/:id', async (req, res) => {
  try {
    const widget = await updateFormWidget(req.userId, req.params.id, req.body);
    res.json({ widget });
  } catch (err) {
    res.status(400).json({ message: err.message || 'Erro ao atualizar rastreador' });
  }
});

router.delete('/widgets/:id', async (req, res) => {
  try {
    await deleteFormWidget(req.userId, req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ message: err.message || 'Erro ao excluir rastreador' });
  }
});

export default router;
