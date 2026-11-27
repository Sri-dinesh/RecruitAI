import { Router, type RequestHandler } from 'express';

import type { AppConfig } from '../config/index.js';
import { getCurrentUserId } from '../context/request-context.js';
import type { WorkspaceQueryStore } from '../db/workspace-query-store.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { sessionListQuerySchema, sessionPatchPayloadSchema } from '../schemas/sessions.js';
import { createSessionService, type SessionService } from '../services/session-service.js';

/**
 * Port of `backend/app/api/routes_sessions.py`.
 *
 * Preserved contracts:
 * - list rows carry an isolated `candidate_count`;
 * - list performs the legacy metadata backfill into `session_candidates`;
 * - detail reads are pure (no writes);
 * - reset is rate limited to one call per 30 s per user with `Retry-After`;
 * - PATCH accepts an arbitrary JSON object (minus `user_id`) and returns the
 *   updated row, or 404 `Session not found.`.
 */

export interface SessionsRouterOptions {
  readonly config?: AppConfig;
  readonly queryStore?: WorkspaceQueryStore;
  readonly sessionService?: SessionService;
  readonly auth?: RequestHandler;
}

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export function createSessionsRouter(options: SessionsRouterOptions = {}): Router {
  const router = Router();
  const service =
    options.sessionService ??
    createSessionService({
      ...(options.config === undefined ? {} : { config: options.config }),
      ...(options.queryStore === undefined ? {} : { queryStore: options.queryStore }),
    });
  const auth =
    options.auth ?? (options.config ? requireAuth({ config: options.config }) : requireAuth());

  router.get('/', auth, validateQuery(sessionListQuerySchema), async (req, res) => {
    const query = req.query as { limit?: number; offset?: number };
    res.json(
      await service.listSessions(getCurrentUserId(), {
        ...(query.limit === undefined ? {} : { limit: Number(query.limit) }),
        ...(query.offset === undefined ? {} : { offset: Number(query.offset) }),
      }),
    );
  });

  router.post('/', auth, async (_req, res) => {
    res.json(await service.createSession(getCurrentUserId()));
  });

  router.post('/reset-all', auth, async (_req, res) => {
    res.json(await service.resetAll(getCurrentUserId()));
  });

  router.get('/:session_id', auth, async (req, res) => {
    res.json(await service.getSessionDetails(getCurrentUserId(), param(req.params['session_id'])));
  });

  router.delete('/:session_id', auth, async (req, res) => {
    res.json(await service.deleteSession(getCurrentUserId(), param(req.params['session_id'])));
  });

  router.patch('/:session_id', auth, validateBody(sessionPatchPayloadSchema), async (req, res) => {
    res.json(
      await service.patchSession(
        getCurrentUserId(),
        param(req.params['session_id']),
        req.body as Record<string, unknown>,
      ),
    );
  });

  return router;
}
