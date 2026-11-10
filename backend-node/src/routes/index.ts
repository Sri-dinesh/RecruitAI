import { Router } from 'express';

/**
 * API router root.
 *
 * Phase 1 scaffold: intentionally empty. Route groups are mounted here as
 * they are ported, in the same order as the Python app's include_router calls:
 *
 *   /chat        (Phase 14)
 *   /sessions    (Phase 15)
 *   /email       (Phase 11)
 *   /privacy     (Phase 15)
 *   /reports     (Phase 15)
 *   /ingest      (Phase 12)
 *   /candidates  (Phase 15)
 *   /analytics   (Phase 15)
 *   /users       (Phase 15)
 *   /payments    (Phase 10)
 *
 * The Python app mounts users/payments without the /api prefix on the router
 * because those routers declare their own prefix; preserve that when porting.
 */
export const apiRouter = Router();
