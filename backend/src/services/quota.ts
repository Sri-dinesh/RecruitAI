import { DEFAULT_INSUFFICIENT_CREDITS_MESSAGE, InsufficientCreditsError } from '../types/errors.js';

/**
 * Port of `app/core/quota.py::require_candidate_quota`.
 *
 * The Python version is a FastAPI dependency that resolves `user_id` via auth
 * and then calls `payment_service.get_user_credits(user_id)`. In Phase 2 the
 * payment service and auth layer do not exist yet, so this guard takes the
 * already-resolved balance. Phase 10 supplies the balance lookup; the rule
 * (balance <= 0 -> HTTP 402) is the same.
 *
 * Returns the current balance when it is positive.
 */
export function requireCandidateQuota(
  balance: number,
  message: string = DEFAULT_INSUFFICIENT_CREDITS_MESSAGE,
): number {
  if (balance <= 0) {
    throw new InsufficientCreditsError(message);
  }
  return balance;
}
