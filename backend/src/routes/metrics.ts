import { Router, type Request, type Response } from 'express';

import { getPoolStats } from '../db/client.js';
import { metricsRegistry, type RedMetricsRegistry } from '../telemetry/metrics.js';

/**
 * Port of `GET /api/metrics` from `app/main.py` (OPS-1).
 *
 * Authentication is applied by the API router, matching Python's
 * `Depends(get_current_user_id)`. `Accept: text/plain` returns the Prometheus
 * exposition format; every other Accept returns the JSON summary. Metrics are
 * always enabled, as in the Python config.
 */
export function createMetricsRouter(registry: RedMetricsRegistry = metricsRegistry): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    const accept = req.headers.accept ?? '';
    if (accept.includes('text/plain')) {
      // Pool counters are sampled at scrape time so Prometheus sees the live
      // saturation state (waiting callers) rather than a stale snapshot.
      registry.recordPoolStats(getPoolStats());
      res.type('text/plain').send(await registry.toPrometheusFormat());
      return;
    }
    res.json(registry.getSummary());
  });

  return router;
}

export const metricsRouter = createMetricsRouter();
