import { Router, type RequestHandler } from 'express';
import { z } from 'zod';

import type { AppConfig } from '../config/index.js';
import { getCurrentUserId } from '../context/request-context.js';
import type { WorkspaceQueryStore } from '../db/workspace-query-store.js';
import { requireAuth } from '../middleware/auth.js';
import { getValidatedQuery, validateBody, validateQuery } from '../middleware/validate.js';
import { pydanticBool } from '../schemas/common.js';
import { reportRequestSchema, type ReportRequest } from '../schemas/reports.js';
import { createReportService, type ReportService } from '../services/report-service.js';

/**
 * Port of `backend/app/api/routes_reports.py`.
 *
 * Both endpoints stream a PDF with a fixed `Content-Disposition` header, and
 * `Access-Control-Expose-Headers` so browsers can read the filename.
 */

const sessionReportQuerySchema = z.object({
  blind_mode: pydanticBool().nullable().optional(),
});

type SessionReportQuery = z.infer<typeof sessionReportQuerySchema>;

export interface ReportsRouterOptions {
  readonly config?: AppConfig;
  readonly queryStore?: WorkspaceQueryStore;
  readonly reportService?: ReportService;
  readonly auth?: RequestHandler;
}

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function sendPdf(res: Parameters<RequestHandler>[1], buffer: Buffer, filename: string): void {
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  res.type('application/pdf').send(buffer);
}

export function createReportsRouter(options: ReportsRouterOptions = {}): Router {
  const router = Router();
  const service =
    options.reportService ??
    createReportService({
      ...(options.config === undefined ? {} : { config: options.config }),
      ...(options.queryStore === undefined ? {} : { queryStore: options.queryStore }),
    });
  const auth =
    options.auth ?? (options.config ? requireAuth({ config: options.config }) : requireAuth());

  router.post('/generate', auth, validateBody(reportRequestSchema), async (req, res) => {
    const report = await service.generateDirect(req.body as ReportRequest);
    sendPdf(res, report.buffer, report.filename);
  });

  router.get(
    '/session/:session_id',
    auth,
    validateQuery(sessionReportQuerySchema),
    async (req, res) => {
      const query = getValidatedQuery<SessionReportQuery>(req);
      const report = await service.generateForSession(
        getCurrentUserId(),
        param(req.params['session_id']),
        query.blind_mode ?? null,
      );
      sendPdf(res, report.buffer, report.filename);
    },
  );

  return router;
}
