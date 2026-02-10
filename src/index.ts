import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import http from 'http';

import { authRouter } from './routes/auth.routes';
import { householdsRouter } from './routes/households.routes';
import { devicesRouter } from './routes/devices.routes';
import { errorHandler } from './middleware/errorHandler';
import { prisma } from './db/prisma';
import { initRealtime } from './realtime/realtime';
import { notifications } from './services/notifications.service';

async function main() {
  const app = express();

  app.use(cors());
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan('dev'));

  app.get('/', (_req, res) => {
    res.json({ message: 'EcoPulse API (Express)', version: '1.0.0' });
  });

  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false });
    }
  });

  app.use('/auth', authRouter);
  app.use('/households', householdsRouter);
  app.use('/devices', devicesRouter);

  // error handler at the end
  app.use(errorHandler);

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;

  const server = http.createServer(app);
  const rt = initRealtime(server);
  notifications.setRealtime(rt);

  await prisma.$connect();

  server.listen(port, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`API running on port ${port}`);
  });

}

main().catch((err) => {
  console.error("Fatal error:", err?.message || err);
  console.error(err?.stack || "");
  process.exit(1);
});
