import type { RedisStore } from '../redis/client.js';
import { getSharedRedisStore } from '../redis/client.js';

/**
 * Destructive workspace-reset throttle (Phase 21).
 *
 * Python keeps `_LAST_RESET_REQUESTS` in a module dict, so every replica
 * enforces its own 30 s window and the effective limit multiplies by the
 * replica count. With Redis configured this becomes one `SET NX PX` key per
 * tenant, shared by the whole fleet. The in-memory implementation remains for
 * single-instance development and tests.
 */

export interface ResetThrottle {
  /**
   * Claim the reset slot for a tenant.
   *
   * @returns `0` when the reset may proceed, otherwise the number of seconds
   *          the caller must wait (`Retry-After`).
   */
  claim(userId: string, ttlSeconds: number): Promise<number>;
  clear(): void;
}

export interface ResetThrottleOptions {
  /** Shared Redis store, or `null` for local-only development. */
  readonly store: RedisStore | null;
  /** Seconds clock, injectable for deterministic tests. */
  readonly now?: () => number;
}

/** Python-equivalent in-memory behaviour (`_LAST_RESET_REQUESTS`). */
export class InMemoryResetThrottle implements ResetThrottle {
  private readonly lastResets = new Map<string, number>();
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now() / 1000) {
    this.now = now;
  }

  async claim(userId: string, ttlSeconds: number): Promise<number> {
    const now = this.now();
    const lastReset = this.lastResets.get(userId) ?? 0;
    if (now - lastReset < ttlSeconds) {
      return Math.trunc(ttlSeconds - (now - lastReset));
    }
    this.lastResets.set(userId, now);
    return 0;
  }

  clear(): void {
    this.lastResets.clear();
  }
}

/** Fleet-wide throttle backed by one TTL key per tenant. */
export class RedisResetThrottle implements ResetThrottle {
  private readonly store: RedisStore;
  private readonly fallback: InMemoryResetThrottle;

  constructor(store: RedisStore, now?: () => number) {
    this.store = store;
    this.fallback = new InMemoryResetThrottle(now);
  }

  async claim(userId: string, ttlSeconds: number): Promise<number> {
    try {
      const remainingMs = await this.store.claimTtl(
        this.store.key('rl', 'reset', userId),
        ttlSeconds * 1000,
      );
      return remainingMs === 0 ? 0 : Math.max(1, Math.ceil(remainingMs / 1000));
    } catch {
      // Redis down: keep the safety limit locally rather than allowing a
      // destructive reset storm.
      return this.fallback.claim(userId, ttlSeconds);
    }
  }

  clear(): void {
    this.fallback.clear();
  }
}

export function createResetThrottle(options: ResetThrottleOptions): ResetThrottle {
  const local = new InMemoryResetThrottle(options.now);
  return options.store ? new RedisResetThrottle(options.store, options.now) : local;
}

/** Process-wide throttle; Redis is selected lazily from `REDIS_URL`. */
export const defaultResetThrottle: ResetThrottle = {
  claim: (userId, ttlSeconds) =>
    getMemoizedThrottle(getSharedRedisStore()).claim(userId, ttlSeconds),
  clear: () => {
    getMemoizedThrottle(getSharedRedisStore()).clear();
  },
};

let memoized: { readonly store: RedisStore | null; readonly throttle: ResetThrottle } | undefined;

function getMemoizedThrottle(store: RedisStore | null): ResetThrottle {
  if (memoized && memoized.store === store) {
    return memoized.throttle;
  }
  memoized = { store, throttle: createResetThrottle({ store }) };
  return memoized.throttle;
}
