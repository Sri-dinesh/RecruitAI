import { Router, type RequestHandler } from 'express';

import type { AppConfig } from '../config/index.js';
import { getCurrentUserId } from '../context/request-context.js';
import type { WorkspaceQueryStore } from '../db/workspace-query-store.js';
import { requireAuth } from '../middleware/auth.js';
import { getValidatedQuery, validateQuery } from '../middleware/validate.js';
import {
  analyticsDaysQuerySchema,
  analyticsLimitQuerySchema,
  analyticsTopNQuerySchema,
  type AnalyticsDaysQuery,
  type AnalyticsLimitQuery,
  type AnalyticsTopNQuery,
} from '../schemas/analytics.js';
import { createAnalyticsService, type AnalyticsService } from '../services/analytics-service.js';

/**
 * Port of `backend/app/api/routes_analytics.py` (eight GET endpoints).
 *
 * Query validation mirrors FastAPI's `Query(30, ge=7, le=365)` etc.:
 *   /candidates-over-time  days   7..365  default 30
 *   /top-skills            top_n  5..30   default 12
 *   /recent-activity       limit  5..50   default 20
 */

export interface AnalyticsRouterOptions {
  readonly config?: AppConfig;
  readonly queryStore?: WorkspaceQueryStore;
  readonly analyticsService?: AnalyticsService;
  readonly auth?: RequestHandler;
}

export function createAnalyticsRouter(options: AnalyticsRouterOptions = {}): Router {
  const router = Router();
  const service =
    options.analyticsService ??
    createAnalyticsService({
      ...(options.config === undefined ? {} : { config: options.config }),
      ...(options.queryStore === undefined ? {} : { queryStore: options.queryStore }),
    });
  const auth =
    options.auth ?? (options.config ? requireAuth({ config: options.config }) : requireAuth());

  router.get('/summary', auth, async (_req, res) => {
    res.json(await service.summary(getCurrentUserId()));
  });

  router.get('/pipeline', auth, async (_req, res) => {
    res.json(await service.pipeline(getCurrentUserId()));
  });

  router.get(
    '/candidates-over-time',
    auth,
    validateQuery(analyticsDaysQuerySchema),
    async (req, res) => {
      const query = getValidatedQuery<AnalyticsDaysQuery>(req);
      res.json(await service.candidatesOverTime(getCurrentUserId(), query.days));
    },
  );

  router.get('/match-distribution', auth, async (_req, res) => {
    res.json(await service.matchDistribution(getCurrentUserId()));
  });

  router.get('/top-skills', auth, validateQuery(analyticsTopNQuerySchema), async (req, res) => {
    const query = getValidatedQuery<AnalyticsTopNQuery>(req);
    res.json(await service.topSkills(getCurrentUserId(), query.top_n));
  });

  router.get('/hiring-velocity', auth, async (_req, res) => {
    res.json(await service.hiringVelocity(getCurrentUserId()));
  });

  router.get('/jobs-summary', auth, async (_req, res) => {
    res.json(await service.jobsSummary(getCurrentUserId()));
  });

  router.get(
    '/recent-activity',
    auth,
    validateQuery(analyticsLimitQuerySchema),
    async (req, res) => {
      const query = getValidatedQuery<AnalyticsLimitQuery>(req);
      res.json(await service.recentActivity(getCurrentUserId(), query.limit));
    },
  );

  return router;
}
