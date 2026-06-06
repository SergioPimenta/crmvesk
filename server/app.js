import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { runMigrations } from './migrate.js';
import authRoutes from './routes/auth.js';
import uploadRoutes from './routes/upload.js';
import crmRoutes from './routes/crm.js';
import whatsappRoutes from './routes/whatsapp.js';
import widgetPublicRoutes from './routes/widgetPublic.js';
import whatsappButtonRoutes from './routes/whatsappButton.js';

dotenv.config();

let initPromise;

export async function createApp() {
  if (!initPromise) {
    initPromise = runMigrations();
  }
  await initPromise;

  const app = express();

  const corsOrigin = process.env.FRONTEND_URL;
  app.use(
    cors(
      corsOrigin
        ? {
            origin: corsOrigin.split(',').map((o) => o.trim()),
            credentials: true,
          }
        : undefined
    )
  );
  app.use(express.json({ limit: '10mb' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/upload', uploadRoutes);
  app.use('/api/crm', crmRoutes);
  app.use('/api/widget', widgetPublicRoutes);
  app.use('/api/whatsapp-button', whatsappButtonRoutes);
  app.use('/api/whatsapp', whatsappRoutes);

  app.get('/api', (req, res) => {
    res.json({ message: 'API is running on Vercel Postgres' });
  });

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ message: err.message || 'Erro interno' });
  });

  return app;
}
