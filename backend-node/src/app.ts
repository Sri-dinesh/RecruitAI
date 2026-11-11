import express, { type Express } from 'express';

import { getConfig, type AppConfig } from './config/index.js';
import { createCorsMiddleware } from './middleware/cors.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { healthRouter } from './routes/health.js';
import { apiRouter } from './routes/index.js';

export interface CreateAppOptions {
  /** Explicit config (tests); defaults to the validated process singleton. */
  readonly config?: AppConfig;
}

/**
 * Express application factory, mirroring `app/main.py`.
 *
 * Middleware order is deliberate and must stay stable:
 *   1. CORS (outermost, as in Starlette)
 *   2. JSON body parsing
 *   3. Public health/liveness routes (registered before the API router so
 *      `/api/health` never inherits route-level auth)
 *   4. Feature routers under `/api` (each applies `requireAuth` itself)
 *   5. JSON 404 for unmatched paths
 *   6. Terminal error handling
 *
 * There is intentionally no request-id, security-header, trusted-host or
 * timing middleware: the Python backend does not have them. Request identity
 * lives in `src/context/request-context.ts`.
 */
export function createApp(options: CreateAppOptions = {}): Express {
  const config = options.config ?? getConfig();
  const app = express();

  // Default Express fingerprint header is not part of the existing contract.
  app.disable('x-powered-by');

  app.use(createCorsMiddleware(config));
  app.use(express.json());

  app.use(healthRouter);
  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
