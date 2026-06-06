import express from 'express';
import { buildWidgetScript, getWidgetByMonitorCode, recordPing } from '../services/whatsappButtonService.js';

const router = express.Router();

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(buildWidgetScript(widget));
});

router.get('/:code/ping', async (req, res) => {
  const code = String(req.params.code || '');
  const event = req.query.event === 'click' ? 'click' : 'view';
  await recordPing(code, event);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'image/gif');
  res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
});

export default router;
