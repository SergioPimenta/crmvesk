import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
  getGoogleMapsSearchStatus,
  searchGoogleMaps,
  startGoogleMapsSearch,
} from '../services/mapsScraperService.js';
import { filterNewResults } from '../services/scrapingDedupeService.js';

const router = express.Router();

router.use(verifyToken);

router.post('/maps/dedupe', async (req, res) => {
  try {
    const { query, results, limit } = req.body ?? {};
    const data = await filterNewResults(req.userId, query, results, limit);
    res.json(data);
  } catch (err) {
    res.status(400).json({ message: err.message || 'Erro ao filtrar resultados' });
  }
});

router.post('/maps/start', async (req, res) => {
  try {
    const { query, limit, headless, onlyWithPhone } = req.body ?? {};
    const data = await startGoogleMapsSearch({
      query,
      limit,
      headless: headless !== false,
      onlyWithPhone: Boolean(onlyWithPhone),
    });
    res.json(data);
  } catch (err) {
    res.status(400).json({ message: err.message || 'Erro ao iniciar busca no Google Maps' });
  }
});

router.get('/maps/status/:jobId', async (req, res) => {
  try {
    const data = await getGoogleMapsSearchStatus(req.params.jobId);
    res.json(data);
  } catch (err) {
    res.status(400).json({ message: err.message || 'Erro ao consultar busca' });
  }
});

router.post('/maps', async (req, res) => {
  try {
    const { query, limit, headless, onlyWithPhone } = req.body ?? {};
    const data = await searchGoogleMaps({
      query,
      limit,
      headless: headless !== false,
      onlyWithPhone: Boolean(onlyWithPhone),
    });
    res.json(data);
  } catch (err) {
    res.status(400).json({ message: err.message || 'Erro ao buscar no Google Maps' });
  }
});

export default router;
