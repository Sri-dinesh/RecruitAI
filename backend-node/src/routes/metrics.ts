import { Router, type Request, type Response } from 'express';

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

  router.get('/', (req: Request, res: Response) => {
    const accept = req.headers.accept ?? '';
    if (accept.includes('text/plain')) {
      res.type('text/plain').send(registry.toPrometheusFormat());
      return;
    }
    res.json(registry.getSummary());
  });

  return router;
}

export const metricsRouter = createMetricsRouter();
