import type { Request, RequestHandler } from 'express';

import { metricsRegistry, type RedMetricsRegistry } from '../telemetry/metrics.js';

/**
 * Request instrumentation for the RED metrics registry.
 *
 * Python defines `record_request` but never calls it; this middleware closes
 * that gap so `/api/metrics` reports real rates, errors and latencies. Endpoint
 * labels come from the matched route (`/users/:id`), never the concrete URL, so
 * metric cardinality stays bounded. Unmatched paths share one label.
 */

function matchedEndpoint(req: Request): string {
  const routePath = req.route?.path;
  if (typeof routePath !== 'string') {
    return 'unmatched';
  }
  const base = req.baseUrl;
  if (routePath === '/') {
    return base || '/';
  }
  return `${base}${routePath}`;
}

export function createRequestMetricsMiddleware(
  registry: RedMetricsRegistry = metricsRegistry,
): RequestHandler {
  return (req, res, next) => {
    const startedAt = performance.now();
    res.on('finish', () => {
      registry.recordRequest(matchedEndpoint(req), res.statusCode, performance.now() - startedAt);
    });
    next();
  };
}
