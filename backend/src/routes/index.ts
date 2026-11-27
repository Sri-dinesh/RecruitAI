import { Router, type RequestHandler } from 'express';

import type { AppConfig } from '../config/index.js';
import type { WorkspaceQueryStore } from '../db/workspace-query-store.js';
import type { ChatJobManager } from '../jobs/index.js';
import { requireAuth } from '../middleware/auth.js';
import { createTieredRateLimitMiddleware } from '../middleware/tiered-rate-limit.js';
import type { RedisStore } from '../redis/client.js';
import type { AnalyticsService } from '../services/analytics-service.js';
import type { CampaignService } from '../services/campaign-service.js';
import type { EmailService } from '../services/email-service.js';
import type { EvaluationService } from '../services/evaluation-service.js';
import type { IngestionService } from '../services/ingestion-service.js';
import type { PaymentService } from '../services/payment-service.js';
import type { PrivacyService } from '../services/privacy-service.js';
import type { ReportService } from '../services/report-service.js';
import type { SessionService } from '../services/session-service.js';
import type { UserService } from '../services/user-service.js';
import { metricsRegistry, type RedMetricsRegistry } from '../telemetry/metrics.js';
import { createAnalyticsRouter } from './analytics.js';
import { createChatRouter } from './chat.js';
import { createEmailRouter } from './email.js';
import { createEvaluateRouter } from './evaluate.js';
import { createIngestRouter } from './ingest.js';
import { createMetricsRouter } from './metrics.js';
import { createPaymentsRouter } from './payments.js';
import { createPrivacyRouter } from './privacy.js';
import { createReportsRouter } from './reports.js';
import { createSessionsRouter } from './sessions.js';
import { createUsersRouter } from './users.js';

/**
 * API router root, mounted at `/api` by the app factory.
 *
 * Feature routers land here in the same logical order as the Python
 * `include_router` calls. Each protected router applies `requireAuth()` itself,
 * because Python uses a per-route `Depends(get_current_user_id)` rather than
 * global auth middleware:
 *
 *   /api/metrics     (Phase 7) — authenticated RED/USE metrics
 *   /api/chat        (Phase 14)
 *   /api/sessions    (Phase 15)
 *   /api/email       (Phase 11)
 *   /api/privacy     (Phase 15)
 *   /api/reports     (Phase 15)
 *   /api/ingest      (Phase 12)
 *   /api/candidates  (Phase 15)
 *   /api/analytics   (Phase 15)
 *   /api/users       (Phase 15)
 *
 * Two Python routers declare their own `/api/...` prefix and are included
 * without the `/api` prefix. In Express they are mounted explicitly instead:
 *
 *   /api/payments    (Phase 10) — `/webhook` stays public; the other routes
 *                                apply `requireAuth()`
 *
 * Deep readiness (`/health/ready`, `/api/health/ready`) requires authentication
 * and lives in `health.ts`, mounted by the app factory before this router.
 * Health liveness lives there too and is public.
 */

export interface ApiRouterOptions {
  /** Explicit config for tests; defaults to the validated singleton. */
  readonly config?: AppConfig;
  /** Isolated registry for tests; defaults to the process-wide collector. */
  readonly metrics?: RedMetricsRegistry;
  /** Shared payment service (also used by the public webhook route). */
  readonly paymentService?: PaymentService;
  /** Shared email/outreach service. */
  readonly emailService?: EmailService;
  /** Shared ingest/ingestion service. */
  readonly ingestionService?: IngestionService;
  /** Shared chat/campaign service and async job manager. */
  readonly campaignService?: CampaignService;
  readonly chatJobManager?: ChatJobManager;
  /** Shared Phase 15 data-access layer (Drizzle or SQLite fallback). */
  readonly workspaceQueryStore?: WorkspaceQueryStore;
  /** Explicit Phase 15 services for tests. */
  readonly sessionService?: SessionService;
  readonly evaluationService?: EvaluationService;
  readonly reportService?: ReportService;
  readonly analyticsService?: AnalyticsService;
  readonly userService?: UserService;
  readonly privacyService?: PrivacyService;
  /** Shared Redis store for fleet-wide tiered quotas (tests pass `null`). */
  readonly rateLimitStore?: RedisStore | null;
}

function withRateLimit(auth: RequestHandler, rateLimit: RequestHandler): RequestHandler {
  // Run the tiered quota only after auth resolves a tenant. Routers keep their
  // own `auth` dependency, so paths that never match a route still return 404
  // instead of inheriting an auth failure from a router-level mount.
  return (req, res, next) => {
    auth(req, res, (error?: unknown) => {
      if (error) {
        next(error);
        return;
      }
      rateLimit(req, res, next);
    });
  };
}

export function createApiRouter(options: ApiRouterOptions = {}): Router {
  const router = Router();
  const auth = options.config ? requireAuth({ config: options.config }) : requireAuth();
  // Phase 23: fine-grained fair-use quotas after authentication. The global
  // pre-auth IP limiter in `app.ts` remains the coarse abuse guard.
  const rateLimit: RequestHandler =
    options.config === undefined
      ? (_req, _res, next) => next()
      : createTieredRateLimitMiddleware({
          enabled: options.config.rateLimit.tieredEnabled,
          windowMs: options.config.rateLimit.tierWindowSeconds * 1000,
          limits: options.config.rateLimit.tiers,
          ipMultiplier: options.config.rateLimit.ipMultiplier,
          store: options.rateLimitStore ?? null,
        });
  const authed = withRateLimit(auth, rateLimit);
  const storeOptions =
    options.workspaceQueryStore === undefined ? {} : { queryStore: options.workspaceQueryStore };
  router.use('/metrics', auth, rateLimit, createMetricsRouter(options.metrics ?? metricsRegistry));
  router.use(
    '/chat',
    auth,
    createChatRouter({
      ...(options.config === undefined ? {} : { config: options.config }),
      auth: authed,
      ...(options.campaignService === undefined
        ? {}
        : { campaignService: options.campaignService }),
      ...(options.chatJobManager === undefined ? {} : { jobManager: options.chatJobManager }),
    }),
  );
  router.use(
    '/payments',
    createPaymentsRouter({
      ...(options.config === undefined ? {} : { config: options.config }),
      auth: authed,
      ...(options.paymentService === undefined ? {} : { paymentService: options.paymentService }),
    }),
  );
  router.use(
    '/email',
    createEmailRouter({
      ...(options.config === undefined ? {} : { config: options.config }),
      auth: authed,
      ...(options.emailService === undefined ? {} : { emailService: options.emailService }),
    }),
  );
  router.use(
    '/ingest',
    createIngestRouter({
      ...(options.config === undefined ? {} : { config: options.config }),
      auth: authed,
      ...(options.ingestionService === undefined
        ? {}
        : { ingestionService: options.ingestionService }),
    }),
  );
  router.use(
    '/sessions',
    createSessionsRouter({
      ...(options.config === undefined ? {} : { config: options.config }),
      auth: authed,
      ...storeOptions,
      ...(options.sessionService === undefined ? {} : { sessionService: options.sessionService }),
    }),
  );
  router.use(
    '/privacy',
    createPrivacyRouter({
      ...(options.config === undefined ? {} : { config: options.config }),
      auth: authed,
      ...storeOptions,
      ...(options.privacyService === undefined ? {} : { privacyService: options.privacyService }),
    }),
  );
  router.use(
    '/reports',
    createReportsRouter({
      ...(options.config === undefined ? {} : { config: options.config }),
      auth: authed,
      ...storeOptions,
      ...(options.reportService === undefined ? {} : { reportService: options.reportService }),
    }),
  );
  router.use(
    '/analytics',
    createAnalyticsRouter({
      ...(options.config === undefined ? {} : { config: options.config }),
      auth: authed,
      ...storeOptions,
      ...(options.analyticsService === undefined
        ? {}
        : { analyticsService: options.analyticsService }),
    }),
  );
  router.use(
    '/users',
    createUsersRouter({
      ...(options.config === undefined ? {} : { config: options.config }),
      auth: authed,
      ...storeOptions,
      ...(options.userService === undefined ? {} : { userService: options.userService }),
    }),
  );
  // `routes_evaluate.py` declares `/candidates/...` and `/export/ats` without a
  // shared prefix, so this router is mounted at the API root.
  router.use(
    createEvaluateRouter({
      ...(options.config === undefined ? {} : { config: options.config }),
      auth: authed,
      ...storeOptions,
      ...(options.paymentService === undefined ? {} : { paymentService: options.paymentService }),
      ...(options.evaluationService === undefined
        ? {}
        : { evaluationService: options.evaluationService }),
    }),
  );
  return router;
}
