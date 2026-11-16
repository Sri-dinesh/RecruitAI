import { Router, type Request, type RequestHandler, type Response } from 'express';

import type { AppConfig } from '../config/index.js';
import { getCurrentUserId } from '../context/request-context.js';
import type { WorkspaceQueryStore } from '../db/workspace-query-store.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  atsExportRequestSchema,
  candidateEvaluationRequestSchema,
  candidateStatusRequestSchema,
  type ATSExportRequest,
  type CandidateEvaluationRequest,
  type CandidateStatusRequest,
} from '../schemas/evaluate.js';
import type { PaymentService } from '../services/payment-service.js';
import { createEvaluationService, type EvaluationService } from '../services/evaluation-service.js';

/**
 * Port of `backend/app/api/routes_evaluate.py`.
 *
 * Mounted at the API root because the Python router declares
 * `/candidates/...` and `/export/ats` without a shared prefix.
 */

export interface EvaluateRouterOptions {
  readonly config?: AppConfig;
  readonly queryStore?: WorkspaceQueryStore;
  readonly evaluationService?: EvaluationService;
  readonly paymentService?: Pick<PaymentService, 'getUserCredits' | 'consumeCredits'>;
  readonly auth?: RequestHandler;
}

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export function createEvaluateRouter(options: EvaluateRouterOptions = {}): Router {
  const router = Router();
  const service =
    options.evaluationService ??
    createEvaluationService({
      ...(options.config === undefined ? {} : { config: options.config }),
      ...(options.queryStore === undefined ? {} : { queryStore: options.queryStore }),
      ...(options.paymentService === undefined ? {} : { paymentService: options.paymentService }),
    });
  const auth =
    options.auth ?? (options.config ? requireAuth({ config: options.config }) : requireAuth());

  router.post(
    '/candidates/evaluate',
    auth,
    validateBody(candidateEvaluationRequestSchema),
    async (req, res) => {
      res.json(
        await service.saveEvaluation(req.body as CandidateEvaluationRequest, getCurrentUserId()),
      );
    },
  );

  router.get('/candidates/:candidate_id/evaluation', auth, async (req, res) => {
    res.json(await service.getEvaluation(param(req.params['candidate_id']), getCurrentUserId()));
  });

  router.post('/export/ats', auth, validateBody(atsExportRequestSchema), async (req, res) => {
    const result = await service.exportAts(req.body as ATSExportRequest, getCurrentUserId());
    if ('contentType' in result) {
      res.setHeader('Content-Disposition', `attachment; filename=${String(result.filename)}`);
      res.type(String(result.contentType)).send(String(result.body));
      return;
    }
    res.json(result);
  });

  const updateStatus = async (req: Request, res: Response): Promise<void> => {
    const result = await service.updateStatus(
      param(req.params['candidate_id']),
      req.body as CandidateStatusRequest,
      getCurrentUserId(),
    );
    res.json(result);
  };

  router.post(
    '/candidates/:candidate_id/status',
    auth,
    validateBody(candidateStatusRequestSchema),
    updateStatus,
  );
  router.patch(
    '/candidates/:candidate_id/status',
    auth,
    validateBody(candidateStatusRequestSchema),
    updateStatus,
  );

  return router;
}
