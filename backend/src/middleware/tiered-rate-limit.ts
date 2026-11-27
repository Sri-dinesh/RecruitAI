import type { Request, RequestHandler, Response } from 'express';

import type { RateLimitTier } from '../config/index.js';
import type { RedisStore } from '../redis/client.js';
import { createLogger } from '../telemetry/logger.js';
import { RATE_LIMIT_DETAIL } from './rate-limit.js';

/**
 * Tiered per-tenant rate limiting (Phase 23).
 *
 * The Phase 19 limiter in `rate-limit.ts` is a coarse, pre-auth, per-IP fixed
 * window. It cannot express the fair-use contract in `docs/slo.md` §4 because
 * it knows nothing about the authenticated workspace and treats an expensive
 * `POST /api/chat` the same as a cheap list read. This middleware adds the
 * second, finer layer:
 *
 * - **per-user + per-IP**: each tier is enforced for the authenticated user and
 *   for the client IP at `limit × RATE_LIMIT_IP_MULTIPLIER`, so several users
 *   behind one NAT still work while a single client cannot fan out.
 * - **sliding window**: a Redis sorted set per `(tier, scope, key)` pruned and
 *   counted in one Lua script. Without Redis it degrades to an equivalent
 *   bounded in-process window (the limit then applies per instance).
 * - **tier by cost**: chat/email/payments/ingest/evaluate get their own
 *   budgets; other authenticated mutations share `write` and reads share
 *   `read`.
 * - **FastAPI-shaped 429**: `{ detail, code, retry_after }` plus `Retry-After`,
 *   keeping `detail` identical to the existing global limiter so current
 *   clients keep working.
 *
 * It must be mounted *after* `requireAuth` because `req.userId` is the tenant
 * key. Requests without a resolved user (public webhooks, health probes) are
 * skipped by the per-user check but still bounded by the global limiter.
 */

export const RATE_LIMIT_EXCEEDED_CODE = 'rate_limit_exceeded';

/** Bound on tracked local keys per middleware instance. */
export const DEFAULT_TIERED_MAX_TRACKED_KEYS = 10_000;

export interface TieredRateLimitOptions {
  readonly enabled: boolean;
  readonly windowMs: number;
  readonly limits: Readonly<Record<RateLimitTier, number>>;
  /** Per-IP limit as a multiple of the per-user limit; defaults to 4. */
  readonly ipMultiplier?: number;
  /**
   * Static tier for the mount, or a resolver for method-aware routers. Defaults
   * to `classifyRateLimitTier` (path + method).
   */
  readonly tier?: RateLimitTier | ((req: Request) => RateLimitTier | null);
  /** Shared Redis store for a fleet-wide window; `null` stays local. */
  readonly store?: RedisStore | null;
  /** Injectable clock (ms). Defaults to `Date.now`. */
  readonly now?: () => number;
  /** User key; defaults to `req.userId`. */
  readonly userKey?: (req: Request) => string | undefined;
  /** IP key; defaults to `req.ip`. */
  readonly ipKey?: (req: Request) => string;
  /** Bound on tracked local keys; defaults to 10k. */
  readonly maxTrackedKeys?: number;
  /** Optional exemption hook; health paths are always skipped. */
  readonly skip?: (req: Request) => boolean;
}

const logger = createLogger('recruitai.tiered_rate_limit');

/**
 * Atomically prune, count and admit one sliding-window request.
 *
 * KEYS[1] sorted set
 * ARGV[1] now (ms), ARGV[2] window (ms), ARGV[3] limit, ARGV[4] member
 * Returns `{allowed, retryAfterMs}`.
 */
const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry = window
  if oldest[2] then
    retry = tonumber(oldest[2]) + window - now
  end
  if retry < 1 then
    retry = 1
  end
  return {0, math.ceil(retry)}
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return {1, 0}
`;

interface WindowResult {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

/** Path/method tier classification for routers with mixed endpoint costs. */
export function classifyRateLimitTier(req: Request): RateLimitTier | null {
  const path = (req.originalUrl || req.url).split('?')[0] ?? '';

  // Health probes must never consume a tenant budget.
  if (/(^|\/)health(\/|$)/.test(path)) {
    return null;
  }

  const method = req.method.toUpperCase();
  const mutation = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';

  if (/(^|\/)chat(\/|$)/.test(path)) {
    // SSE status/stream polls are reads; only the chat turn is expensive.
    return mutation ? 'chat' : 'read';
  }
  if (/(^|\/)email(\/|$)/.test(path)) {
    return mutation ? 'email' : 'read';
  }
  if (/(^|\/)payments(\/|$)/.test(path)) {
    return mutation ? 'payments' : 'read';
  }
  if (/(^|\/)ingest(\/|$)/.test(path)) {
    return mutation ? 'ingest' : 'read';
  }
  if (/(^|\/)(candidates|export)(\/|$)/.test(path)) {
    return mutation ? 'evaluate' : 'read';
  }

  // Session/privacy/report/user routers mix reads and mutations.
  return mutation ? 'write' : 'read';
}

function defaultIpKey(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

function defaultUserKey(req: Request): string | undefined {
  return req.userId;
}

/**
 * Bounded in-process sliding window.
 *
 * The map is capped like the global limiter: expired timestamps are pruned
 * first, then the oldest tracked key is evicted if a spoofed-key burst fills
 * the map. The limit is per instance without Redis, which is the documented
 * degradation mode.
 */
class LocalSlidingWindows {
  private readonly windows = new Map<string, number[]>();
  private readonly maxTrackedKeys: number;

  constructor(maxTrackedKeys: number) {
    this.maxTrackedKeys = maxTrackedKeys;
  }

  consume(key: string, limit: number, windowMs: number, at: number): WindowResult {
    const cutoff = at - windowMs;
    let timestamps = this.windows.get(key);
    if (timestamps === undefined) {
      if (this.windows.size >= this.maxTrackedKeys) {
        this.prune(at, windowMs);
        if (this.windows.size >= this.maxTrackedKeys) {
          const oldest = this.windows.keys().next().value;
          if (oldest !== undefined) {
            this.windows.delete(oldest);
          }
        }
      }
      timestamps = [];
      this.windows.set(key, timestamps);
    }

    let writeIndex = 0;
    for (const timestamp of timestamps) {
      if (timestamp > cutoff) {
        timestamps[writeIndex] = timestamp;
        writeIndex += 1;
      }
    }
    timestamps.length = writeIndex;

    if (timestamps.length >= limit) {
      const oldest = timestamps[0] ?? at;
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - at) / 1000)),
      };
    }

    timestamps.push(at);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  private prune(at: number, windowMs: number): void {
    const cutoff = at - windowMs;
    for (const [key, timestamps] of this.windows) {
      const last = timestamps[timestamps.length - 1];
      if (last === undefined || last <= cutoff) {
        this.windows.delete(key);
      }
    }
  }
}

export function createTieredRateLimitMiddleware(options: TieredRateLimitOptions): RequestHandler {
  if (!options.enabled) {
    return (_req, _res, next) => next();
  }

  const now = options.now ?? Date.now;
  const ipMultiplier = Math.max(1, options.ipMultiplier ?? 4);
  const resolveTier =
    options.tier === undefined
      ? classifyRateLimitTier
      : typeof options.tier === 'function'
        ? options.tier
        : (): RateLimitTier => options.tier as RateLimitTier;
  const userKey = options.userKey ?? defaultUserKey;
  const ipKey = options.ipKey ?? defaultIpKey;
  const local = new LocalSlidingWindows(options.maxTrackedKeys ?? DEFAULT_TIERED_MAX_TRACKED_KEYS);
  const store = options.store ?? null;
  let memberCounter = 0;

  const consumeLocal = (key: string, limit: number, at: number): WindowResult =>
    local.consume(key, limit, options.windowMs, at);

  const consumeRedis = async (
    key: string,
    limit: number,
    at: number,
    member: string,
  ): Promise<WindowResult> => {
    if (!store) {
      return consumeLocal(key, limit, at);
    }
    try {
      const result = await store.evalScript(
        SLIDING_WINDOW_SCRIPT,
        [key],
        [at, options.windowMs, limit, member],
      );
      const [allowedRaw, retryRaw] = Array.isArray(result) ? result : [1, 0];
      const retryAfterMs = Number(retryRaw);
      return {
        allowed: Number(allowedRaw) === 1,
        retryAfterSeconds:
          Number(allowedRaw) === 1 ? 0 : Math.max(1, Math.ceil(retryAfterMs / 1000)),
      };
    } catch (error) {
      logger.warn(
        `[tiered_rate_limit] Redis window failed; using local fallback: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return consumeLocal(key, limit, at);
    }
  };

  const reject = (res: Response, retryAfterSeconds: number): void => {
    res.setHeader('Retry-After', String(retryAfterSeconds));
    res.status(429).json({
      detail: RATE_LIMIT_DETAIL,
      code: RATE_LIMIT_EXCEEDED_CODE,
      retry_after: retryAfterSeconds,
    });
  };

  return async (req, res, next) => {
    if (options.skip?.(req) === true) {
      next();
      return;
    }

    const tier = resolveTier(req);
    if (tier === null) {
      next();
      return;
    }

    const limit = options.limits[tier];
    if (!Number.isFinite(limit) || limit <= 0) {
      next();
      return;
    }

    const at = now();
    const member = `${at}:${process.pid}:${(memberCounter += 1)}`;
    const user = userKey(req);
    const ip = ipKey(req);

    if (user) {
      const result = await consumeRedis(
        store ? store.key('rl', 'tier', tier, 'user', user) : `local:${tier}:user:${user}`,
        limit,
        at,
        member,
      );
      if (!result.allowed) {
        reject(res, result.retryAfterSeconds);
        return;
      }
    }

    const ipResult = await consumeRedis(
      store ? store.key('rl', 'tier', tier, 'ip', ip) : `local:${tier}:ip:${ip}`,
      limit * ipMultiplier,
      at,
      member,
    );
    if (!ipResult.allowed) {
      reject(res, ipResult.retryAfterSeconds);
      return;
    }

    next();
  };
}
