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
import notificationsRoutes from './routes/notifications.js';

dotenv.config();

let initPromise;

export async function createApp() {
  if (!initPromise) {
    initPromise = runMigrations();
  }
  await initPromise;

  const app = express();

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

  app.use('/api/auth', authRoutes);
  app.use('/api/upload', uploadRoutes);
  app.use('/api/crm', crmRoutes);
  app.use('/api/widget', widgetPublicRoutes);
  app.use('/api/form', formPublicRoutes);
  app.use('/api/whatsapp-button', whatsappButtonRoutes);
  app.use('/api/contact-form', contactFormRoutes);
  app.use('/api/scraping', scrapingRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/whatsapp', whatsappRoutes);
  app.use('/api/notifications', notificationsRoutes);

  app.get('/api', (req, res) => {
    res.json({ message: 'API is running on Vercel Postgres' });
  });

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ message: err.message || 'Erro interno' });
  });

  return app;
}
