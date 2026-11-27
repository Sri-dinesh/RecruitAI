import { Router, type RequestHandler } from 'express';

import type { AppConfig } from '../config/index.js';
import { getCurrentUserId } from '../context/request-context.js';
import { requireAuth } from '../middleware/auth.js';
import { getValidatedQuery, validateBody, validateQuery } from '../middleware/validate.js';
import {
  emailHistoryQuerySchema,
  emailRequestSchema,
  type EmailHistoryQuery,
  type EmailRequest,
} from '../schemas/email.js';
import { createEmailService, type EmailService } from '../services/email-service.js';

/**
 * Port of the three routes in `backend/app/api/routes_email.py`.
 *
 * Mounted at `/api/email`; each route applies `requireAuth()`, matching the
 * per-route FastAPI dependency. History limit bounds (`1..100`) come from the
 * `Query` declaration, so validation produces FastAPI's 422 shape.
 */

export interface EmailRouterOptions {
  readonly config?: AppConfig;
  readonly emailService?: EmailService;
  /** Pre-built auth middleware (the API router shares one instance). */
  readonly auth?: RequestHandler;
}

export function createEmailRouter(options: EmailRouterOptions = {}): Router {
  const router = Router();
  const service =
    options.emailService ??
    createEmailService(options.config === undefined ? {} : { config: options.config });
  const auth =
    options.auth ?? (options.config ? requireAuth({ config: options.config }) : requireAuth());

  router.post('/send', auth, validateBody(emailRequestSchema), async (req, res) => {
    const body = req.body as EmailRequest;
    res.json(await service.sendEmail(body, getCurrentUserId()));
  });

  router.get('/history', auth, validateQuery(emailHistoryQuerySchema), async (req, res) => {
    const query = getValidatedQuery<EmailHistoryQuery>(req);
    res.json(await service.getHistory(getCurrentUserId(), query.candidate_id ?? null, query.limit));
  });

  router.get('/stats', auth, async (_req, res) => {
    res.json(await service.getStats(getCurrentUserId()));
  });

  return router;
}
