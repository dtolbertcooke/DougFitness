// api/src/app.ts
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { logger } from './lib/logger';
import { authRouter } from './modules/auth/auth.routes';
import { meRouter } from './modules/me/me.routes';
import { requireAuth } from './middleware/requireAuth';
import { errorHandler, notFound } from './middleware/errors';

export function buildApp() {
  const app = express();
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(pinoHttp({ logger, redact: ['req.headers.authorization'] }));

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.use('/v1/auth', authRouter);
  app.use('/v1/me', requireAuth, meRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
