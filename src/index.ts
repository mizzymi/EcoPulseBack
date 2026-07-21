import 'dotenv/config';
import express from 'express';
import cors, { CorsOptions } from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import http from 'http';

import { allowedOrigins, normalizeOrigin, validateEnvironment } from './config';
import { authRouter } from './routes/auth.routes';
import { householdsRouter } from './routes/households.routes';
import { devicesRouter } from './routes/devices.routes';
import { errorHandler } from './middleware/errorHandler';
import { prisma } from './db/prisma';
import { initRealtime } from './realtime/realtime';
import { notifications } from './services';
import { forbidden } from './utils/httpError';
import { scheduleAutoPostToday } from './jobs/recurringAutopost';

async function main() {
  validateEnvironment();

  const app = express();
  const origins = allowedOrigins();
  const corsOptions: CorsOptions = {
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (origins.includes(normalizeOrigin(origin))) return cb(null, true);
      return cb(forbidden('Origin not allowed'));
    },
    credentials: true,
  };

  app.disable('x-powered-by');
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? '1'));
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  app.get('/', (_req, res) => res.json({ message: 'EcoPulse API (Express)', version: '1.0.0' }));
  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/auth', authRouter);
  app.use('/households', householdsRouter);
  app.use('/devices', devicesRouter);
  app.use(errorHandler);

  const port = Number(process.env.PORT ?? '4000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');

  const server = http.createServer(app);
  notifications.setRealtime(initRealtime(server));

  await prisma.$connect();
  scheduleAutoPostToday();

  server.listen(port, '0.0.0.0', () => {
    console.log(`API running on port ${port}`);
    console.log(`CORS allowed origins: ${origins.join(', ') || '(none)'}`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down`);

    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });

    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch(async (err) => {
  console.error('Fatal error:', err?.message || err);
  console.error(err?.stack || '');
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
