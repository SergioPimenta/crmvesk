import { createApp } from '../server/app.js';

let app;
let initError;

export default async function handler(req, res) {
  try {
    if (initError) {
      return res.status(500).json({ message: initError.message });
    }
    if (!app) {
      app = await createApp();
    }
    return app(req, res);
  } catch (err) {
    console.error('API init/handler error:', err);
    initError = err;
    return res.status(500).json({
      message: err.message || 'Erro ao iniciar API',
    });
  }
}
