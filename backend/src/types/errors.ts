/**
 * HTTP error contracts shared across routers and middleware.
 *
 * Framework-agnostic on purpose: the Phase 4 error middleware maps
 * `statusCode`, `detail` and `headers` onto the Express response, mirroring
 * FastAPI's `HTTPException(status_code=..., detail=...)` semantics.
 */

/** Base class for errors that map directly onto an HTTP response. */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly detail: unknown;
  readonly headers: Readonly<Record<string, string>>;

  constructor(
    statusCode: number,
    detail: unknown,
    message?: string,
    headers: Readonly<Record<string, string>> = {},
  ) {
    super(message ?? (typeof detail === 'string' ? detail : `HTTP ${statusCode}`));
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.detail = detail;
    this.headers = headers;
  }
}

/**
 * 401 with a Bearer challenge, matching FastAPI's `HTTPException` responses
 * raised by `app/core/auth.py`.
 */
export class UnauthorizedError extends HttpError {
  declare readonly detail: string;

  constructor(detail = 'Authentication required. Please log in to continue.') {
    super(401, detail, detail, { 'WWW-Authenticate': 'Bearer' });
    this.name = 'UnauthorizedError';
  }
}

/** 403 for explicit cross-tenant / forbidden access checks. */
export class ForbiddenError extends HttpError {
  declare readonly detail: string;

  constructor(detail = 'Access denied.') {
    super(403, detail, detail);
    this.name = 'ForbiddenError';
  }
}

/** Stable machine-readable code used by every credit-exhaustion response. */
export const INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS' as const;

/** Upgrade destination the clients navigate to. */
export const CREDIT_UPGRADE_URL = '/pricing' as const;

/**
 * Default message from `app/core/quota.py::InsufficientCreditsException`.
 * Used by the reusable `require_candidate_quota` dependency.
 */
export const DEFAULT_INSUFFICIENT_CREDITS_MESSAGE =
  'Candidate evaluation quota reached. Please upgrade your subscription to continue.';

/**
 * Inline message in `routes_evaluate.py` (POST /api/candidates/evaluate).
 * It does not use the shared quota dependency, so its text differs slightly.
 */
export const EVALUATION_QUOTA_MESSAGE =
  'Candidate evaluation quota reached. Please upgrade to continue.';

/**
 * Inline message in `routes_email.py` (POST /api/email/send).
 */
export const OUTREACH_QUOTA_MESSAGE =
  'Candidate outreach quota exhausted. Please upgrade to continue.';

/** Response body returned under FastAPI's `detail` key. */
export interface InsufficientCreditsDetail {
  readonly error: typeof INSUFFICIENT_CREDITS;
  readonly message: string;
  readonly upgrade_url: typeof CREDIT_UPGRADE_URL;
}

/**
 * Build the credit-exhaustion body.
 *
 * FastAPI wraps this object in `{ "detail": ... }`. Express handlers must
 * return it wrapped the same way to keep the contract byte-compatible:
 * `res.status(402).json({ detail: insufficientCreditsBody() })`.
 */
export function insufficientCreditsBody(
  message: string = DEFAULT_INSUFFICIENT_CREDITS_MESSAGE,
): InsufficientCreditsDetail {
  return {
    error: INSUFFICIENT_CREDITS,
    message,
    upgrade_url: CREDIT_UPGRADE_URL,
  };
}

/** Thrown when a user has no credits left (HTTP 402). */
export class InsufficientCreditsError extends HttpError {
  declare readonly detail: InsufficientCreditsDetail;

  constructor(message: string = DEFAULT_INSUFFICIENT_CREDITS_MESSAGE) {
    super(402, insufficientCreditsBody(message), message);
    this.name = 'InsufficientCreditsError';
  }
}
