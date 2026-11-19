import type { AppConfig, CacheConfig } from '../config/index.js';
import { getConfig } from '../config/index.js';
import { getSharedRedisStore } from '../redis/client.js';
import { createTtlCache, type TtlCache } from './ttl-cache.js';

/**
 * Fleet-wide hot-read cache (Phase 22).
 *
 * Only derived, read-optimisation state lives here: the credits balance, the
 * latest subscription summary and analytics snapshots. Authoritative writes —
 * credit deduction, payment verification, webhook crediting and the audit
 * ledger — always read and write the primary database first, then invalidate.
 *
 * A stale entry can therefore only ever make a read dashboard look old for at
 * most its TTL; it can never authorise a spend.
 */

interface CachedValue<T> {
  readonly value: T;
}

export interface CachedSubscription {
  readonly planId: string;
  readonly status: string;
  readonly periodEnd: string | null;
}

export interface HotReadCacheOptions {
  readonly config?: AppConfig;
  /** Explicit TTL cache for tests; otherwise the shared Redis/local cache. */
  readonly cache?: TtlCache;
}

export class HotReadCache {
  private readonly settings: CacheConfig;
  private readonly cache: TtlCache;

  constructor(options: HotReadCacheOptions = {}) {
    const config = options.config ?? getConfig();
    this.settings = config.cache;
    this.cache =
      options.cache ??
      createTtlCache({
        store: getSharedRedisStore(),
        namespace: 'hot-reads',
        maxEntries: 10_000,
      });
  }

  private get enabled(): boolean {
    return this.settings.hotReadsEnabled;
  }

  private creditsKey(userId: string): string {
    return `credits:${userId}`;
  }

  private subscriptionKey(userId: string): string {
    return `subscription:${userId}`;
  }

  private analyticsKey(userId: string, endpoint: string): string {
    return `analytics:${userId}:${endpoint}`;
  }

  /** Credits balance. Missing values are cached as `null` to avoid a stampede. */
  async credits(
    userId: string,
    loader: () => Promise<number | undefined>,
  ): Promise<number | undefined> {
    const value = await this.remember<number | null>(
      this.creditsKey(userId),
      this.settings.creditsTtlSeconds,
      async () => (await loader()) ?? null,
    );
    return value === null ? undefined : value;
  }

  /** Latest subscription summary (`plan_id`, `status`, `current_period_end`). */
  subscription(
    userId: string,
    loader: () => Promise<CachedSubscription>,
  ): Promise<CachedSubscription> {
    return this.remember<CachedSubscription>(
      this.subscriptionKey(userId),
      this.settings.subscriptionTtlSeconds,
      loader,
    );
  }

  /** One analytics payload; `endpoint` must include every query parameter. */
  analytics<T>(userId: string, endpoint: string, loader: () => Promise<T>): Promise<T> {
    return this.remember<T>(
      this.analyticsKey(userId, endpoint),
      this.settings.analyticsTtlSeconds,
      loader,
    );
  }

  /** Invalidate the tenant's cached balance and subscription summary. */
  async invalidateTenant(userId: string): Promise<void> {
    await Promise.all([
      this.cache.delete(this.creditsKey(userId)),
      this.cache.delete(this.subscriptionKey(userId)),
    ]);
  }

  private async remember<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    if (!this.enabled) {
      return loader();
    }
    const cached = await this.cache.get<CachedValue<T>>(key);
    if (cached !== undefined) {
      return cached.value;
    }
    const value = await loader();
    await this.cache.set(key, { value } satisfies CachedValue<T>, ttlSeconds);
    return value;
  }
}

let shared: HotReadCache | undefined;

/** Process-wide cache, mirroring the payment-service singleton pattern. */
export function getHotReadCache(): HotReadCache {
  shared ??= new HotReadCache();
  return shared;
}

/** Test helper: install a deterministic cache. */
export function setHotReadCacheForTests(cache: HotReadCache | undefined): void {
  shared = cache;
}
