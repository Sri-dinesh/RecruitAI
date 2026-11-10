import express, { type Express } from 'express';

import { healthRouter } from './routes/health.js';
import { apiRouter } from './routes/index.js';

/**
 * Express application factory.
 *
 * Phase 1 scope: only bootstrap wiring. Middleware, error handling,
 * auth and all feature routers land in Phases 3–15.
 * TODO(Phase 4): mirror the real FastAPI stack (CORS + opaque 500 handler).
 */
export function createApp(): Express {
  const app = express();

  // Default Express fingerprint header is not part of the existing contract.
  app.disable('x-powered-by');

  app.use(express.json());

  app.use(healthRouter);
  app.use('/api', apiRouter);

  return app;
}
