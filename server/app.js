import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { runMigrations } from './migrate.js';
import authRoutes from './routes/auth.js';
import uploadRoutes from './routes/upload.js';
import crmRoutes from './routes/crm.js';
import whatsappRoutes from './routes/whatsapp.js';
import widgetPublicRoutes from './routes/widgetPublic.js';
import formPublicRoutes from './routes/formPublic.js';
import whatsappButtonRoutes from './routes/whatsappButton.js';
import contactFormRoutes from './routes/contactForm.js';
import scrapingRoutes from './routes/scraping.js';
import usersRoutes from './routes/users.js';
import invitesRoutes from './routes/invites.js';
import notificationsRoutes from './routes/notifications.js';
import automationRoutes from './routes/automation.js';
import healthRoutes from './routes/health.js';
import { logger, newRequestId } from './utils/logger.js';

dotenv.config();

let initPromise;

export async function createApp() {
  if (!initPromise) {
    initPromise = runMigrations();
  }
  await initPromise;

  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    req.id = newRequestId();
    res.setHeader('X-Request-Id', req.id);
    next();
  });
  app.set('trust proxy', 1);

  // Widget embed: sites externos precisam de CORS aberto (antes do cors restrito do CRM)
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/widget') && !req.path.startsWith('/api/form')) return next();

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    return next();
  });

  const corsOrigin = process.env.FRONTEND_URL;
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/widget') || req.path.startsWith('/api/form')) return next();
    if (!corsOrigin) return next();
    return cors({
      origin: corsOrigin.split(',').map((o) => o.trim()),
      credentials: true,
    })(req, res, next);
  });

  const isWhatsappWebhook = (req) => {
    const target = `${req.originalUrl || ''} ${req.url || ''} ${req.path || ''}`;
    return target.includes('/whatsapp/webhook/');
  };

  app.use(express.json({
    limit: '12mb',
    verify: (req, _res, buf) => {
      if (isWhatsappWebhook(req)) {
        req.rawBody = buf.toString('utf8');
        req.rawBodyTrusted = true;
      }
    },
  }));

  app.use('/api', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/upload', uploadRoutes);
  app.use('/api/crm', crmRoutes);
  app.use('/api/widget', widgetPublicRoutes);
  app.use('/api/form', formPublicRoutes);
  app.use('/api/whatsapp-button', whatsappButtonRoutes);
  app.use('/api/contact-form', contactFormRoutes);
  app.use('/api/scraping', scrapingRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/invites', invitesRoutes);
  app.use('/api/whatsapp', whatsappRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/automation', automationRoutes);

  app.get('/api', (req, res) => {
    res.json({ message: 'API is running on Vercel Postgres' });
  });

  // Erros inesperados (inclusive de rotas async) não vazam detalhes internos (SQL, stack) para o cliente.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = Number(err.statusCode || err.status) || 500;
    logger[status >= 500 ? 'error' : 'warn']('request_failed', {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status,
      userId: req.authUserId,
      error: err,
    });
    if (res.headersSent) return;
    res.status(status).json({
      message: status < 500 && err.message ? err.message : 'Erro interno do servidor',
      requestId: req.id,
    });
  });

  return app;
}
