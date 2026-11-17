import { randomUUID } from 'node:crypto';

import type { ErrorRequestHandler, Request, RequestHandler } from 'express';

import { getRequestContext } from '../context/request-context.js';
import type { FastApiValidationError } from '../schemas/validation.js';
import { createLogger } from '../telemetry/logger.js';
import { HttpError } from '../types/errors.js';

const logger = createLogger('recruitai.server');

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
 * Server-side log fields for one failed request.
 *
 * Request id comes from the request-id middleware so even failures that happen
 * before authentication are correlated. Tenant/user ids come from the active
 * request context when auth has already run. The query string is deliberately
 * excluded from `path` to avoid logging user input.
 */
function requestLogFields(req: Request): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    method: req.method,
    path: req.path,
  };
  if (req.requestId) {
    fields['request_id'] = req.requestId;
  }
  const context = getRequestContext();
  if (context) {
    fields['user_id'] = context.userId;
    fields['tenant_id'] = context.tenantId;
    fields['duration_ms'] = Date.now() - context.startedAt;
  }
  return fields;
}

interface BodyParserError extends Error {
  readonly type?: string;
  readonly status?: number;
  readonly statusCode?: number;
  readonly body?: unknown;
}

function asBodyParserError(error: unknown): BodyParserError | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }
  const candidate = error as Error & { type?: unknown };
  return typeof candidate.type === 'string' ? (candidate as BodyParserError) : undefined;
}

/** body-parser reports the 0-based position in its SyntaxError message. */
function jsonErrorPosition(message: string): number {
  const match = /at position (\d+)/.exec(message);
  return match?.[1] === undefined ? 0 : Number(match[1]);
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
 * body-parser failures are normalised to the FastAPI contract:
 *   - malformed JSON  -> 422 `json_invalid` (FastAPI's 422, not Express's 400)
 *   - oversized body  -> 413 (interim limit until Phase 23)
 */
export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof HttpError) {
    // 5xx HttpErrors carry an internal diagnostic message. Log it server-side
    // only (with request/tenant identity); the client still gets `detail`.
    if (error.statusCode >= 500) {
      logger.error(
        `[HTTP_ERROR status=${error.statusCode}] ${req.method} ${req.path}: ` +
          `${error.name}: ${error.message}`,
        {
          ...requestLogFields(req),
          status_code: error.statusCode,
          error_type: error.name,
        },
      );
    }
    res.status(error.statusCode).set(error.headers).json({ detail: error.detail });
    return;
  }

  const bodyParserError = asBodyParserError(error);
  if (bodyParserError?.type === 'entity.parse.failed') {
    const detail: FastApiValidationError = {
      type: 'json_invalid',
      loc: ['body', jsonErrorPosition(bodyParserError.message)],
      msg: 'JSON decode error',
      input: {},
      ctx: { error: bodyParserError.message },
    };
    res.status(422).json({ detail: [detail] });
    return;
  }

  if (bodyParserError?.type === 'entity.too.large') {
    res.status(413).json({ detail: 'Request body too large.' });
    return;
  }

  const ref = createErrorRef();
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message : String(error);

  // Server-side only; log the path without the query string to avoid PII.
  logger.error(`[UNHANDLED_EXCEPTION ref=${ref}] ${req.method} ${req.path}: ${name}: ${message}`, {
    ...requestLogFields(req),
    ref,
    error_type: name,
  });

  res.status(500).json({
    detail: `An unexpected server error occurred. (ref=${ref})`,
    ref,
  });
};
