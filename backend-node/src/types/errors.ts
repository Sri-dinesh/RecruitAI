/**
 * HTTP error contracts shared across routers.
 *
 * Phase 2 ports the monetization error shape that the Python backend already
 * returns to clients. The web and mobile apps match on `error ===
 * "INSUFFICIENT_CREDITS"` and read `upgrade_url`, so this shape is frozen.
 */

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

/**
 * Thrown when a user has no credits left.
 *
 * Framework-agnostic on purpose: the Phase 3 error middleware maps
 * `statusCode`/`detail` onto the Express response, mirroring Python's
 * `raise HTTPException(status_code=402, detail=...)`.
 */
export class InsufficientCreditsError extends Error {
  readonly statusCode = 402;
  readonly detail: InsufficientCreditsDetail;

  constructor(message: string = DEFAULT_INSUFFICIENT_CREDITS_MESSAGE) {
    super(message);
    this.name = 'InsufficientCreditsError';
    this.detail = insufficientCreditsBody(message);
  }
}
