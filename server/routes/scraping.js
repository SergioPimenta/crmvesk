import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { searchGoogleMaps } from '../services/mapsScraperService.js';

const router = express.Router();

router.use(verifyToken);

router.post('/maps', async (req, res) => {
  try {
    const { query, limit, onlyWithPhone } = req.body ?? {};
    const data = await searchGoogleMaps({
      query,
      limit,
      onlyWithPhone: Boolean(onlyWithPhone),
    });
    res.json(data);
  } catch (err) {
    res.status(400).json({ message: err.message || 'Erro ao buscar no Google Maps' });
  }
});

export default router;
