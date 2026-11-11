import { Router } from 'express';

/**
 * API router root, mounted at `/api` by the app factory.
 *
 * Feature routers land here in the same logical order as the Python
 * `include_router` calls. Each protected router applies `requireAuth()` itself,
 * because Python uses a per-route `Depends(get_current_user_id)` rather than
 * global auth middleware:
 *
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
 * Deep readiness (`/health/ready`, `/api/health/ready`) and metrics
 * (`/api/metrics`) are authenticated routes and arrive with the DB/telemetry
 * phases (6/7/17). Health liveness lives in `health.ts` and is public.
 */
export const apiRouter = Router();
