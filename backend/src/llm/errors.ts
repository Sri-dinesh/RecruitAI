/**
 * User-safe LLM failure text (Phase 24).
 *
 * The LLM pool throws typed errors when every model is OPEN, the spend gate is
 * saturated, or a dependency breaker refuses the call. Those messages are for
 * operators; clients must get a stable, PII-free sentence instead. Generic
 * errors keep their historical text so existing node contracts and tests are
 * unchanged.
 */

const UNAVAILABLE_ERROR_NAMES: ReadonlySet<string> = new Set([
  'AllProvidersFailedError',
  'LlmBudgetExceededError',
  'CircuitOpenError',
]);

export const LLM_UNAVAILABLE_MESSAGE =
  'The AI provider is temporarily unavailable. Please retry shortly.';

/** True when the failure means "the LLM layer is degraded", not bad input. */
export function isLlmUnavailableError(error: unknown): boolean {
  return error instanceof Error && UNAVAILABLE_ERROR_NAMES.has(error.name);
}

/**
 * Return the user-safe sentence for an LLM outage, otherwise `fallback`.
 * Callers pass their existing historical message so generic behavior is
 * preserved byte-for-byte.
 */
export function userSafeLlmFailure(error: unknown, fallback: string): string {
  return isLlmUnavailableError(error) ? LLM_UNAVAILABLE_MESSAGE : fallback;
}
