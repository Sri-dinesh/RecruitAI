import express, { type Express } from 'express';

import { getConfig, type AppConfig } from './config/index.js';
import { createCorsMiddleware } from './middleware/cors.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { jsonBodyParser } from './middleware/json-body.js';
import { createRequestMetricsMiddleware } from './middleware/telemetry.js';
import { healthRouter } from './routes/health.js';
import { createApiRouter } from './routes/index.js';
import { metricsRegistry, type RedMetricsRegistry } from './telemetry/metrics.js';

export interface CreateAppOptions {
  /** Explicit config (tests); defaults to the validated process singleton. */
  readonly config?: AppConfig;
  /** Isolated metrics collector for tests; defaults to the process singleton. */
  readonly metrics?: RedMetricsRegistry;
}

/**
 * Express application factory, mirroring `app/main.py`.
 *
 * Middleware order is deliberate and must stay stable:
 *   1. Request metrics (outermost; times every response, including errors)
 *   2. CORS (as in Starlette)
 *   3. JSON body parsing
 *   4. Public health/liveness routes (registered before the API router so
 *      `/api/health` never inherits route-level auth)
 *   5. Feature routers under `/api` (each applies `requireAuth` itself)
 *   6. JSON 404 for unmatched paths
 *   7. Terminal error handling
 *
 * Request identity and telemetry live in `src/context/request-context.ts`.
 */
export function createApp(options: CreateAppOptions = {}): Express {
  const config = options.config ?? getConfig();
  const metrics = options.metrics ?? metricsRegistry;
  const app = express();

  // Default Express fingerprint header is not part of the existing contract.
  app.disable('x-powered-by');

  // Metrics are always enabled, matching the Python config (no env toggle).
  if (config.telemetry.enabled) {
    app.use(createRequestMetricsMiddleware(metrics));
  }

  app.use(createCorsMiddleware(config));
  app.use(jsonBodyParser);

  app.use(healthRouter);
  app.use('/api', createApiRouter({ config, metrics }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
