import express, { type Express } from 'express';

import { getConfig, type AppConfig } from './config/index.js';
import type { WorkspaceQueryStore } from './db/workspace-query-store.js';
import { createChatJobManager, type ChatJobManager } from './jobs/index.js';
import { createCorsMiddleware } from './middleware/cors.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { jsonBodyParser } from './middleware/json-body.js';
import { createRateLimitMiddleware } from './middleware/rate-limit.js';
import { createRequestIdMiddleware } from './middleware/request-id.js';
import { createRequestMetricsMiddleware } from './middleware/telemetry.js';
import { getSharedRedisStore } from './redis/client.js';
import { createReadinessRouter, healthRouter } from './routes/health.js';
import { createApiRouter } from './routes/index.js';
import { createPaymentsWebhookRouter } from './routes/payments.js';
import {
  createCampaignService,
  type CampaignService,
  type ExecuteAgentTurnInput,
} from './services/campaign-service.js';
import { createPaymentService, type PaymentService } from './services/payment-service.js';
import { createEmailService, type EmailService } from './services/email-service.js';
import { createIngestionService, type IngestionService } from './services/ingestion-service.js';
import { metricsRegistry, type RedMetricsRegistry } from './telemetry/metrics.js';

export interface CreateAppOptions {
  /** Explicit config (tests); defaults to the validated process singleton. */
  readonly config?: AppConfig;
  /** Isolated metrics collector for tests; defaults to the process singleton. */
  readonly metrics?: RedMetricsRegistry;
  /** Shared payment service for the API routes and the public webhook. */
  readonly paymentService?: PaymentService;
  /** Shared email/outreach service; defaults to one using the payment service. */
  readonly emailService?: EmailService;
  /** Shared ingest service; defaults to one using the shared config. */
  readonly ingestionService?: IngestionService;
  /** Shared chat/campaign service and async job manager. */
  readonly campaignService?: CampaignService;
  readonly chatJobManager?: ChatJobManager;
  /** Shared Phase 15 data-access layer (tests inject an isolated SQLite store). */
  readonly workspaceQueryStore?: WorkspaceQueryStore;
}

/**
 * Express application factory, mirroring `app/main.py`.
 *
 * Middleware order is deliberate and must stay stable:
 *   1. Request id (outermost; every log and response shares one correlation id)
 *   2. Request metrics (times every response, including errors)
 *   3. CORS (as in Starlette)
 *   4. Rate limit (production abuse guard; 429s still carry CORS headers)
 *   5. Razorpay webhook (needs the exact raw bytes, before JSON parsing)
 *   6. JSON body parsing
 *   7. Public health/liveness routes (registered before the API router so
 *      `/api/health` never inherits route-level auth)
 *   8. Authenticated deep readiness (`/health/ready`, `/api/health/ready`)
 *   9. Feature routers under `/api` (each applies `requireAuth` itself)
 *  10. JSON 404 for unmatched paths
 *  11. Terminal error handling
 *
 * Request identity and telemetry live in `src/context/request-context.ts`.
 */
export function createApp(options: CreateAppOptions = {}): Express {
  const config = options.config ?? getConfig();
  const metrics = options.metrics ?? metricsRegistry;
  const paymentService = options.paymentService ?? createPaymentService({ config });
  const emailService = options.emailService ?? createEmailService({ config, paymentService });
  const ingestionService = options.ingestionService ?? createIngestionService({ config });
  const campaignService = options.campaignService ?? createCampaignService({ config });
  const chatJobManager =
    options.chatJobManager ??
    createChatJobManager({
      config,
      runner: (payload) =>
        campaignService.executeAgentTurn(payload as unknown as ExecuteAgentTurnInput),
    });
  const app = express();
  // Lifecycle access for `main.ts` graceful shutdown; tests can ignore it.
  app.locals.chatJobManager = chatJobManager;

  // Default Express fingerprint header is not part of the existing contract.
  app.disable('x-powered-by');

  // Behind a trusted proxy (Render, Fly, k8s ingress) req.ip must come from
  // X-Forwarded-For. Off by default so a direct client cannot spoof its key.
  if (config.rateLimit.trustProxy) {
    app.set('trust proxy', true);
  }

  // Correlation id first: auth failures, parser errors and 404s all carry it.
  app.use(createRequestIdMiddleware());

  // Metrics are always enabled, matching the Python config (no env toggle).
  if (config.telemetry.enabled) {
    app.use(createRequestMetricsMiddleware(metrics));
  }

  app.use(createCorsMiddleware(config));

  // After CORS so a browser can read the 429 body, before parsing so abusive
  // requests are rejected cheaply. Disabled outside production by default.
  app.use(
    createRateLimitMiddleware({
      enabled: config.rateLimit.enabled,
      windowMs: config.rateLimit.windowSeconds * 1000,
      maxRequests: config.rateLimit.maxRequests,
      store: getSharedRedisStore(),
    }),
  );

  // The webhook verifies an HMAC over the raw body, so it must not pass
  // through `express.json()` first. Invalid JSON is reported by the route.
  app.use('/api/payments/webhook', createPaymentsWebhookRouter({ config, paymentService }));

  app.use(jsonBodyParser);

  app.use(healthRouter);
  app.use(
    createReadinessRouter({
      config,
      ...(options.workspaceQueryStore === undefined
        ? {}
        : { queryStore: options.workspaceQueryStore }),
    }),
  );
  app.use(
    '/api',
    createApiRouter({
      config,
      metrics,
      paymentService,
      emailService,
      ingestionService,
      campaignService,
      chatJobManager,
      ...(options.workspaceQueryStore === undefined
        ? {}
        : { workspaceQueryStore: options.workspaceQueryStore }),
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
