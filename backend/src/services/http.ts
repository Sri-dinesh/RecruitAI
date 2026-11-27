/**
 * Outbound HTTP timeout helper (Phase 23).
 *
 * Third-party calls (Tavily, Razorpay) previously awaited `fetch` indefinitely.
 * A hung provider then held a request slot and a database transaction open until
 * the platform killed the process. Every outbound call now carries a hard
 * deadline, and callers keep their existing deterministic fallbacks when the
 * deadline fires.
 */

export const DEFAULT_HTTP_TIMEOUT_MS = 10_000;

export async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: string | URL | Request,
  init: RequestInit,
  timeoutMs: number = DEFAULT_HTTP_TIMEOUT_MS,
): Promise<Response> {
  const effective =
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_HTTP_TIMEOUT_MS;
  const timeoutSignal = AbortSignal.timeout(effective);
  const signal =
    init.signal === null || init.signal === undefined
      ? timeoutSignal
      : AbortSignal.any([init.signal, timeoutSignal]);

  return fetchImpl(input, { ...init, signal });
}
