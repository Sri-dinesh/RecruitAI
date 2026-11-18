import type { RedisStore } from '../redis/client.js';
import { createLogger } from '../telemetry/logger.js';

/**
 * Fleet-wide TTL cache (Phase 21).
 *
 * The Python Tavily service keeps a process-local dict, so every replica misses
 * independently. With Redis configured this cache stores values under
 * `recruitai:cache:<namespace>:<key>` with the same TTL semantics, giving the
 * fleet one shared hit rate. Without Redis the in-memory implementation keeps
 * local development and tests dependency-free.
 */

const logger = createLogger('recruitai.cache');

export interface TtlCache {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

interface Entry {
  readonly value: unknown;
  readonly expiresAt: number;
}

export interface InMemoryTtlCacheOptions {
  /** Maximum retained entries; oldest/expired entries are pruned first. */
  readonly maxEntries?: number;
  /** Epoch milliseconds clock, injectable for tests. */
  readonly now?: () => number;
}

/** Process-local fallback with the same TTL contract as the Redis cache. */
export class InMemoryTtlCache implements TtlCache {
  private readonly entries = new Map<string, Entry>();
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(options: InMemoryTtlCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 200;
    this.now = options.now ?? Date.now;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (this.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set(key: string, value: unknown, ttlSeconds = 7200): Promise<void> {
    if (this.entries.size >= this.maxEntries) {
      const now = this.now();
      for (const [entryKey, entry] of this.entries) {
        if (entry.expiresAt <= now) {
          this.entries.delete(entryKey);
        }
      }
      // A burst of unique keys still needs a hard bound.
      while (this.entries.size >= this.maxEntries) {
        const oldest = this.entries.keys().next().value;
        if (oldest === undefined) {
          break;
        }
        this.entries.delete(oldest);
      }
    }
    this.entries.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }
}

export interface RedisTtlCacheOptions {
  readonly store: RedisStore;
  readonly namespace: string;
}

/** Redis-backed cache using JSON values and native key expiry. */
export class RedisTtlCache implements TtlCache {
  private readonly store: RedisStore;
  private readonly namespace: string;

  constructor(options: RedisTtlCacheOptions) {
    this.store = options.store;
    this.namespace = options.namespace;
  }

  private key(key: string): string {
    return this.store.key('cache', this.namespace, key);
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.getJson<T>(this.key(key));
  }

  async set(key: string, value: unknown, ttlSeconds = 7200): Promise<void> {
    await this.store.setJson(this.key(key), value, ttlSeconds);
  }

  async delete(key: string): Promise<void> {
    await this.store.delete(this.key(key));
  }

  async clear(): Promise<void> {
    // Namespaced caches are TTL-bound; no cross-instance SCAN on request paths.
    logger.debug(
      `[cache] clear() is a no-op for Redis namespace "${this.namespace}" (keys expire by TTL).`,
    );
  }
}

/**
 * Redis-first cache with a local fallback when a command fails.
 *
 * A cache miss must never fail the request that needs market data, so Redis
 * errors are logged and answered from the in-memory copy.
 */
export class ResilientTtlCache implements TtlCache {
  private readonly primary: TtlCache;
  private readonly fallback: TtlCache;

  constructor(primary: TtlCache, fallback: TtlCache) {
    this.primary = primary;
    this.fallback = fallback;
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const value = await this.primary.get<T>(key);
      if (value !== undefined) {
        return value;
      }
    } catch (error) {
      logger.warn(`[cache] Redis read failed; using local fallback: ${errorMessage(error)}`);
    }
    return this.fallback.get<T>(key);
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      await this.primary.set(key, value, ttlSeconds);
    } catch (error) {
      logger.warn(`[cache] Redis write failed; using local fallback: ${errorMessage(error)}`);
    }
    await this.fallback.set(key, value, ttlSeconds);
  }

  async delete(key: string): Promise<void> {
    try {
      await this.primary.delete(key);
    } catch (error) {
      logger.warn(`[cache] Redis delete failed: ${errorMessage(error)}`);
    }
    await this.fallback.delete(key);
  }

  async clear(): Promise<void> {
    try {
      await this.primary.clear();
    } catch (error) {
      logger.warn(`[cache] Redis clear failed: ${errorMessage(error)}`);
    }
    await this.fallback.clear();
  }
}

export interface CreateTtlCacheOptions {
  /** Shared Redis store, or `null` for local-only development. */
  readonly store: RedisStore | null;
  readonly namespace: string;
  readonly maxEntries?: number;
  readonly now?: () => number;
}

export function createTtlCache(options: CreateTtlCacheOptions): TtlCache {
  const local = new InMemoryTtlCache({
    ...(options.maxEntries === undefined ? {} : { maxEntries: options.maxEntries }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  if (!options.store) {
    return local;
  }
  return new ResilientTtlCache(
    new RedisTtlCache({ store: options.store, namespace: options.namespace }),
    local,
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
