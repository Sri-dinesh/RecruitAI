import { Router, type RequestHandler } from 'express';

import type { AppConfig } from '../config/index.js';
import { getCurrentUserId } from '../context/request-context.js';
import type { WorkspaceQueryStore } from '../db/workspace-query-store.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { retentionRunRequestSchema, type RetentionRunRequest } from '../schemas/privacy.js';
import { createPrivacyService, type PrivacyService } from '../services/privacy-service.js';
import { HttpError } from '../types/errors.js';

/**
 * Port of `backend/app/api/routes_privacy.py`.
 *
 * GDPR Art. 15/17/20 plus NYC Local Law 144 (AEDT) bias audit. Each route
 * keeps Python's status codes and error messages, including the 404 messages
 * for candidates that do not exist or were already erased.
 */

export interface PrivacyRouterOptions {
  readonly config?: AppConfig;
  readonly queryStore?: WorkspaceQueryStore;
  readonly privacyService?: PrivacyService;
  readonly auth?: RequestHandler;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export function createPrivacyRouter(options: PrivacyRouterOptions = {}): Router {
  const router = Router();
  const service =
    options.privacyService ??
    createPrivacyService({
      ...(options.config === undefined ? {} : { config: options.config }),
      ...(options.queryStore === undefined ? {} : { queryStore: options.queryStore }),
    });
  const auth =
    options.auth ?? (options.config ? requireAuth({ config: options.config }) : requireAuth());

  router.get('/export/:candidate_id', auth, async (req, res) => {
    const candidateId = param(req.params['candidate_id']);
    try {
      const data = await service.exportCandidateData(candidateId, getCurrentUserId());
      if (Object.keys(data).length === 0) {
        throw new HttpError(404, 'Candidate not found or access denied.');
      }
      res.json(data);
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      throw new HttpError(500, `GDPR export failed: ${errorMessage(error)}`);
    }
  });

  router.delete('/candidates/:candidate_id', auth, async (req, res) => {
    const candidateId = param(req.params['candidate_id']);
    try {
      const success = await service.purgeCandidate(candidateId, getCurrentUserId());
      if (!success) {
        throw new HttpError(404, 'Candidate not found or already erased.');
      }
      res.json({
        success: true,
        message: `Candidate ${candidateId} and all associated PII, vector chunks, and evaluations permanently erased.`,
      });
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      throw new HttpError(500, `GDPR erasure failed: ${errorMessage(error)}`);
    }
  });

  router.post(
    '/retention/run',
    auth,
    validateBody(retentionRunRequestSchema, { required: false }),
    async (req, res) => {
      const body = req.body as RetentionRunRequest;
      try {
        const summary = await service.enforceRetentionPolicy(
          getCurrentUserId(),
          body.raw_resume_ttl_days || 90,
          body.chat_ttl_days || 365,
        );
        res.json({ success: true, summary });
      } catch (error) {
        throw new HttpError(500, `Retention run failed: ${errorMessage(error)}`);
      }
    },
  );

  router.get('/bias-audit', auth, async (_req, res) => {
    res.json(await service.biasAudit(getCurrentUserId()));
  });

  router.get('/user/export', auth, async (_req, res) => {
    try {
      res.json(await service.exportUserData(getCurrentUserId()));
    } catch (error) {
      throw new HttpError(500, `Failed to export user data: ${errorMessage(error)}`);
    }
  });

  router.delete('/user/account', auth, async (_req, res) => {
    try {
      const success = await service.purgeUserAccount(getCurrentUserId());
      res.json({
        success,
        message:
          'User account and all associated workspace tenant data have been permanently erased under GDPR Art. 17.',
      });
    } catch (error) {
      throw new HttpError(500, `Failed to delete user account: ${errorMessage(error)}`);
    }
  });

  return router;
}
