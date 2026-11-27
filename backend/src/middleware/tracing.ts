import type { RequestHandler } from 'express';

import {
  formatTraceparent,
  parseTraceparent,
  runWithSpanContext,
  startSpan,
} from '../telemetry/tracing.js';

/**
 * HTTP tracing middleware (Phase 24).
 *
 * Opens one root span per request, adopts an inbound W3C `traceparent` when a
 * gateway/client supplies one, exposes the resulting `traceparent` on the
 * response for cross-service debugging, and keeps the context active for every
 * downstream async call. Only method/route/status/request id are recorded:
 * URLs (which can contain ids), bodies, prompts and resumes never enter spans.
 */

function routeLabel(baseUrl: string, routePath: string | undefined): string | undefined {
  if (!routePath) {
    return undefined;
  }
  return routePath === '/' ? baseUrl || '/' : `${baseUrl}${routePath}`;
}

export function createTracingMiddleware(): RequestHandler {
  return (req, res, next) => {
    const parent = parseTraceparent(req.headers['traceparent']);
    const span = startSpan(
      'HTTP request',
      {
        'http.method': req.method,
        ...(req.requestId ? { 'request.id': req.requestId } : {}),
      },
      { parent },
    );

    res.setHeader('traceparent', formatTraceparent(span.context()));

    res.on('finish', () => {
      span.setAttribute('http.status_code', res.statusCode);
      const route = routeLabel(req.baseUrl, req.route?.path);
      if (route) {
        span.setAttribute('http.route', route);
      }
      span.finish(res.statusCode >= 500 ? 'ERROR' : 'OK');
    });

    runWithSpanContext(span, next);
  };
}
