import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';

import { runWithRequestId } from '../context/request-context.js';

/**
 * Request correlation middleware.
 *
 * Python has no request-id layer, so this is a Node-side observability
 * addition required by the migration plan: every request gets a correlation id
 * that
 *
 *   - is echoed to the client as `X-Request-ID`,
 *   - is available to logs emitted before authentication (auth failures, body
 *     parser errors, 404s) through the AsyncLocalStorage scope, and
 *   - becomes `context.requestId` for authenticated requests, so service and
 *     audit logs carry the same value.
 *
 * An inbound id is honoured only when it is short and URL-safe, which keeps
 * arbitrary client text out of log records while still allowing a gateway or
 * trace propagator to supply the id.
 */

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

/** Resolve an inbound header to a safe request id, or mint a new UUID. */
export function resolveRequestId(header: string | string[] | undefined): string {
  const raw = Array.isArray(header) ? header[0] : header;
  const candidate = raw?.trim();
  if (candidate !== undefined && REQUEST_ID_PATTERN.test(candidate)) {
    return candidate;
  }
  return randomUUID();
}

export function createRequestIdMiddleware(): RequestHandler {
  return (req, res, next) => {
    const requestId = resolveRequestId(req.headers['x-request-id']);
    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    runWithRequestId(requestId, next);
  };
}
