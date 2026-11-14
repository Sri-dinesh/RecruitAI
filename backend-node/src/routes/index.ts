import { Router } from 'express';

import type { AppConfig } from '../config/index.js';
import { requireAuth } from '../middleware/auth.js';
import type { PaymentService } from '../services/payment-service.js';
import { metricsRegistry, type RedMetricsRegistry } from '../telemetry/metrics.js';
import { createMetricsRouter } from './metrics.js';
import { createPaymentsRouter } from './payments.js';

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
 * Deep readiness (`/health/ready`, `/api/health/ready`) is authenticated and
 * needs the LLM diagnostics layer, so it arrives with a later phase.
 * Health liveness lives in `health.ts` and is public.
 */

export interface ApiRouterOptions {
  /** Explicit config for tests; defaults to the validated singleton. */
  readonly config?: AppConfig;
  /** Isolated registry for tests; defaults to the process-wide collector. */
  readonly metrics?: RedMetricsRegistry;
  /** Shared payment service (also used by the public webhook route). */
  readonly paymentService?: PaymentService;
}

export function createApiRouter(options: ApiRouterOptions = {}): Router {
  const router = Router();
  const auth = options.config ? requireAuth({ config: options.config }) : requireAuth();
  router.use('/metrics', auth, createMetricsRouter(options.metrics ?? metricsRegistry));
  router.use(
    '/payments',
    createPaymentsRouter({
      ...(options.config === undefined ? {} : { config: options.config }),
      auth,
      ...(options.paymentService === undefined ? {} : { paymentService: options.paymentService }),
    }),
  );
  return router;
}
