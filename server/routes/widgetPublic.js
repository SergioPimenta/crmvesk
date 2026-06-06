import express from 'express';
import {
  buildWidgetScript,
  getWidgetByMonitorCode,
  recordPing,
  submitWidgetLead,
} from '../services/whatsappButtonService.js';

const router = express.Router();

function setPublicCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

router.options('/:code/lead', (req, res) => {
  setPublicCors(res);
  res.status(204).send();
});

router.get('/:code.js', async (req, res) => {
  const code = String(req.params.code || '').replace(/\.js$/, '');
  if (!/^[a-f0-9]{32}$/i.test(code)) {
    return res.status(404).type('text/plain').send('// código inválido');
  }

  const widget = await getWidgetByMonitorCode(code);
  if (!widget) {
    return res.status(404).type('text/plain').send('// widget não encontrado ou inativo');
  }

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  setPublicCors(res);
  res.send(buildWidgetScript(widget));
});

router.get('/:code/ping', async (req, res) => {
  const code = String(req.params.code || '');
  const event = req.query.event === 'click' ? 'click' : 'view';
  await recordPing(code, event);

  setPublicCors(res);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'image/gif');
  res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
});

router.post('/:code/lead', async (req, res) => {
  setPublicCors(res);
  const code = String(req.params.code || '');
  if (!/^[a-f0-9]{32}$/i.test(code)) {
    return res.status(404).json({ message: 'Código inválido' });
  }

  try {
    const result = await submitWidgetLead(code, req.body ?? {});
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message || 'Erro ao registrar lead' });
  }
});

export default router;
