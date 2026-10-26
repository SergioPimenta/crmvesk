import express from 'express';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import {
  createSite,
  deleteSite,
  getHeatmap,
  getOverview,
  listSites,
  updateSite,
} from '../services/siteAnalyticsService.js';

const router = express.Router();

// Monitoramento dos sites é da conta inteira: restrito a administradores, como as integrações.
router.use(verifyToken, requireAdmin);

router.get('/sites', async (req, res) => {
  res.json({ sites: await listSites(req.userId) });
});

router.post('/sites', async (req, res) => {
  try {
    const site = await createSite(req.userId, req.body ?? {});
    res.status(201).json({ site });
  } catch (err) {
    res.status(400).json({ message: err.message || 'Erro ao cadastrar site' });
  }
});

router.put('/sites/:id', async (req, res) => {
  try {
    const site = await updateSite(req.userId, req.params.id, req.body ?? {});
    res.json({ site });
  } catch (err) {
    res.status(400).json({ message: err.message || 'Erro ao atualizar site' });
  }
});

router.delete('/sites/:id', async (req, res) => {
  try {
    await deleteSite(req.userId, req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ message: err.message || 'Erro ao excluir site' });
  }
});

router.get('/sites/:id/overview', async (req, res) => {
  res.json(await getOverview(req.userId, req.params.id, req.query));
});

router.get('/sites/:id/heatmap', async (req, res) => {
  res.json(await getHeatmap(req.userId, req.params.id, req.query));
});

export default router;
