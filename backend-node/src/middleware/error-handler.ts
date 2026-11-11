import { randomUUID } from 'node:crypto';

import type { ErrorRequestHandler, RequestHandler } from 'express';

import { HttpError } from '../types/errors.js';

/**
 * Express's default unmatched-route response is HTML. FastAPI returns
 * `{"detail": "Not Found"}` with 404, so clients see the same shape here.
 */
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ detail: 'Not Found' });
};

/** Opaque reference id format used by the Python handler (`uuid4().hex[:8]`). */
function createErrorRef(): string {
  return randomUUID().replaceAll('-', '').slice(0, 8);
}

/**
 * Terminal error middleware.
 *
 * Two tiers, matching the existing backend:
 *
 * 1. Known `HttpError`s (FastAPI `HTTPException` equivalents, e.g. the 402
 *    quota contract) render with their own status, headers and `{ detail }`.
 * 2. Everything unhandled becomes an opaque 500 with a server-side reference
 *    id. Internal messages and stack traces never reach the client.
 *
 * TODO(Phase 5): normalize body-parser/validation failures into FastAPI's 422
 * shape once the shared schema layer exists.
 */
export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.statusCode).set(error.headers).json({ detail: error.detail });
    return;
  }

  const ref = createErrorRef();
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message : String(error);

  // Server-side only; log the path without the query string to avoid PII.
  console.error(`[UNHANDLED_EXCEPTION ref=${ref}] ${req.method} ${req.path}: ${name}: ${message}`);

  res.status(500).json({
    detail: `An unexpected server error occurred. (ref=${ref})`,
    ref,
  });
};
