import type { Request, RequestHandler } from 'express';

import type { RedisStore } from '../redis/client.js';
import { createLogger } from '../telemetry/logger.js';

/**
 * Fixed-window rate limiter (Phase 19, fleet-wide in Phase 21).
 *
 * Production hardening addition: Python has no global limiter. The limiter is
 * deliberately small and dependency-free so it can run before body parsing and
 * cannot be affected by application code. It is:
 *
 * - **fleet-wide with Redis**: when `REDIS_URL` is configured (and the app
 *   passes a store), the window is one atomic `INCR` + `PEXPIRE` key shared by
 *   every replica, so the limit no longer multiplies by the instance count.
 *   Without Redis it degrades to the original per-process guard.
 * - **keyed by client IP** by default (`req.ip`), and only honours
 *   `X-Forwarded-For` when Express `trust proxy` is configured explicitly.
 * - **fixed window**: cheap, deterministic and good enough for a 429 guard.
 * - **bounded**: expired buckets are pruned when the map grows past a cap, and
 *   the oldest bucket is evicted if a burst of unique keys fills it.
 *
 * A rejected request returns FastAPI-shaped `{ detail }` JSON plus
 * `Retry-After`, so clients (and the existing error UI) handle it like any
 * other API error.
 */

/** Client-facing message; intentionally generic (no key or limit details). */
export const RATE_LIMIT_DETAIL = 'Too many requests. Please retry shortly.';

/** Default upper bound on tracked keys per process. */
export const DEFAULT_MAX_TRACKED_KEYS = 10_000;

export interface RateLimitOptions {
  readonly enabled: boolean;
  readonly windowMs: number;
  readonly maxRequests: number;
  /** Injectable clock (ms). Defaults to `Date.now`. */
  readonly now?: () => number;
  /** Injectable key function; defaults to `req.ip`. */
  readonly key?: (req: Request) => string;
  /** Bound on tracked keys; defaults to 10k. */
  readonly maxTrackedKeys?: number;
  /** Shared Redis store for a fleet-wide fixed window; `null` stays local. */
  readonly store?: RedisStore | null;
}

const logger = createLogger('recruitai.rate_limit');

/** Atomically increment and set the window TTL on the first request. */
const FIXED_WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {count, ttl}
`;

interface Window {
  count: number;
  resetAt: number;
}

function defaultKey(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

export function createRateLimitMiddleware(options: RateLimitOptions): RequestHandler {
  // Disabled: return a pass-through so the middleware order stays identical in
  // every environment and tests can assert the wiring without a limiter.
  if (!options.enabled) {
    return (_req, _res, next) => next();
  }

  const now = options.now ?? Date.now;
  const keyOf = options.key ?? defaultKey;
  const maxTrackedKeys = options.maxTrackedKeys ?? DEFAULT_MAX_TRACKED_KEYS;
  const windows = new Map<string, Window>();

  const pruneExpired = (at: number): void => {
    for (const [key, window] of windows) {
      if (window.resetAt <= at) {
        windows.delete(key);
      }
    }
  };

  return async (req, res, next) => {
    const at = now();
    const key = keyOf(req);

    if (options.store) {
      try {
        const result = await options.store.evalScript(
          FIXED_WINDOW_SCRIPT,
          [options.store.key('rl', 'http', key)],
          [options.windowMs],
        );
        const [countRaw, ttlRaw] = Array.isArray(result) ? result : [0, 0];
        const count = Number(countRaw);
        const ttl = Number(ttlRaw);
        if (count > options.maxRequests) {
          const retryAfterSeconds = Math.max(1, Math.ceil(ttl / 1000));
          res.setHeader('Retry-After', String(retryAfterSeconds));
          res.status(429).json({ detail: RATE_LIMIT_DETAIL });
          return;
        }
        next();
        return;
      } catch (error) {
        // Fall through to the local window so a Redis outage does not remove
        // the abuse guard entirely.
        logger.warn(
          `[rate_limit] Redis window failed; using local fallback: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    // Keep memory bounded under a spoofed-key flood: drop expired windows,
    // then evict the oldest still-active one if the cap is still reached.
    if (windows.size >= maxTrackedKeys) {
      pruneExpired(at);
      if (windows.size >= maxTrackedKeys) {
        const oldest = windows.keys().next().value;
        if (oldest !== undefined) {
          windows.delete(oldest);
        }
      }
    }

    let window = windows.get(key);
    if (window === undefined || window.resetAt <= at) {
      window = { count: 0, resetAt: at + options.windowMs };
      windows.set(key, window);
    }
    window.count += 1;

    if (window.count > options.maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((window.resetAt - at) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({ detail: RATE_LIMIT_DETAIL });
      return;
    }

    next();
  };
}
