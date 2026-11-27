import { Redis } from 'ioredis';

import { getConfig } from '../config/index.js';
import { createLogger } from '../telemetry/logger.js';

/**
 * Shared Redis access for fleet-wide application state (Phase 21).
 *
 * BullMQ owns dedicated blocking connections inside the job manager. Every
 * other piece of cross-instance state — TTL caches, circuit breakers, reset
 * throttles and the retention lock — goes through this module so key names,
 * serialization and error handling stay consistent.
 *
 * Failure policy: commands reject instead of silently returning `null`. Callers
 * decide whether a Redis outage should fall back to local state (caches and
 * breakers do) or surface a readiness failure (the readiness probe does).
 */

const logger = createLogger('recruitai.redis');

/** Root namespace for every key this backend creates. */
export const REDIS_KEY_PREFIX = 'recruitai';

/** Minimal command surface used by application state helpers. */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...options: Array<string | number>): Promise<'OK' | null>;
  del(...keys: string[]): Promise<number>;
  exists(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  pexpire(key: string, milliseconds: number): Promise<number>;
  pttl(key: string): Promise<number>;
  eval(
    script: string,
    keys: readonly string[],
    args: readonly (string | number)[],
  ): Promise<unknown>;
  ping(): Promise<string>;
  quit(): Promise<unknown>;
  on(event: 'error', listener: (error: Error) => void): void;
}

class IoRedisClient implements RedisClient {
  constructor(private readonly client: Redis) {}

  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  set(key: string, value: string, ...options: Array<string | number>): Promise<'OK' | null> {
    // ioredis accepts the Redis SET option list as variadic strings/numbers.
    return (this.client.set as (...args: unknown[]) => Promise<'OK' | null>)(
      key,
      value,
      ...options,
    );
  }

  del(...keys: string[]): Promise<number> {
    return this.client.del(...keys);
  }

  exists(key: string): Promise<number> {
    return this.client.exists(key);
  }

  incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  expire(key: string, seconds: number): Promise<number> {
    return this.client.expire(key, seconds);
  }

  pexpire(key: string, milliseconds: number): Promise<number> {
    return this.client.pexpire(key, milliseconds);
  }

  pttl(key: string): Promise<number> {
    return this.client.pttl(key);
  }

  eval(
    script: string,
    keys: readonly string[],
    args: readonly (string | number)[],
  ): Promise<unknown> {
    return this.client.eval(script, keys.length, ...keys, ...args);
  }

  ping(): Promise<string> {
    return this.client.ping();
  }

  quit(): Promise<unknown> {
    return this.client.quit();
  }

  on(event: 'error', listener: (error: Error) => void): void {
    this.client.on(event, listener);
  }
}

/** Release a lock only when the caller still owns it. */
const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export interface RedisStoreOptions {
  readonly url: string;
  /** Root namespace; defaults to `recruitai`. */
  readonly prefix?: string;
  /** Injectable client for tests. */
  readonly client?: RedisClient;
}

/**
 * Namespaced Redis access with typed JSON helpers and a small lock API.
 *
 * One instance owns one connection. `ping()` returns a boolean so readiness can
 * report Redis health without leaking connection details; state helpers let
 * command errors propagate.
 */
export class RedisStore {
  readonly prefix: string;
  private readonly client: RedisClient;

  constructor(options: RedisStoreOptions) {
    this.prefix = options.prefix ?? REDIS_KEY_PREFIX;
    if (options.client) {
      this.client = options.client;
      return;
    }
    const connection = new Redis(options.url, {
      // Fail fast: a request should not wait forever on a dead Redis.
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    connection.on('error', (error: Error) => {
      logger.error(`[redis] connection error: ${error.message}`);
    });
    this.client = new IoRedisClient(connection);
  }

  /** Build a namespaced key, e.g. `recruitai:cache:tavily:salary:...`. */
  key(...parts: readonly (string | number)[]): string {
    return [this.prefix, ...parts.map((part) => String(part))].join(':');
  }

  /** True when Redis answers PING; never throws. */
  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch (error) {
      logger.warn(`[redis] ping failed: ${errorMessage(error)}`);
      return false;
    }
  }

  /** Raw string read; `null` when the key is absent. */
  async getString(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /** Raw string write with an optional TTL. */
  async setString(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds !== undefined && ttlSeconds > 0) {
      await this.client.set(key, value, 'EX', Math.ceil(ttlSeconds));
      return;
    }
    await this.client.set(key, value);
  }

  /** JSON encode + SET with an optional TTL. */
  async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new Error('Cannot store an unserializable value in Redis.');
    }
    if (ttlSeconds !== undefined && ttlSeconds > 0) {
      await this.client.set(key, serialized, 'EX', Math.ceil(ttlSeconds));
      return;
    }
    await this.client.set(key, serialized);
  }

  /** JSON decode; malformed entries are deleted rather than crashing callers. */
  async getJson<T>(key: string): Promise<T | undefined> {
    const raw = await this.client.get(key);
    if (raw === null) {
      return undefined;
    }
    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      logger.warn(`[redis] discarding malformed JSON at ${key}: ${errorMessage(error)}`);
      await this.client.del(key);
      return undefined;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  /** Run a Lua script through the shared client. */
  async evalScript(
    script: string,
    keys: readonly string[],
    args: readonly (string | number)[],
  ): Promise<unknown> {
    return this.client.eval(script, keys, args);
  }

  async increment(key: string, ttlSeconds?: number): Promise<number> {
    const value = await this.client.incr(key);
    if (ttlSeconds !== undefined && ttlSeconds > 0) {
      // Refresh the window on each increment, matching INCR + EXPIRE usage.
      await this.client.expire(key, Math.ceil(ttlSeconds));
    }
    return value;
  }

  /**
   * Acquire a short-lived distributed lock. Returns the ownership token on
   * success and `null` when another instance holds it.
   */
  async acquireLock(key: string, ttlMilliseconds: number): Promise<string | null> {
    const token = `${process.pid}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const result = await this.client.set(key, token, 'PX', Math.ceil(ttlMilliseconds), 'NX');
    return result === 'OK' ? token : null;
  }

  /** Release a lock only if `token` still owns it. */
  async releaseLock(key: string, token: string): Promise<boolean> {
    const result = await this.client.eval(RELEASE_LOCK_SCRIPT, [key], [token]);
    return Number(result) === 1;
  }

  /**
   * Atomically claim a TTL-keyed slot (e.g. destructive-reset throttle).
   * Returns milliseconds remaining when the slot is already taken, else `0`.
   */
  async claimTtl(key: string, ttlMilliseconds: number): Promise<number> {
    const result = await this.client.set(key, '1', 'PX', Math.ceil(ttlMilliseconds), 'NX');
    if (result === 'OK') {
      return 0;
    }
    const remaining = await this.client.pttl(key);
    // -1 means no expiry was set; treat it as the full window to be safe.
    return remaining > 0 ? remaining : Math.ceil(ttlMilliseconds);
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

let shared: RedisStore | null | undefined;

/**
 * Lazily create the process-wide store when `REDIS_URL` is configured.
 * Returns `null` when Redis is not configured (single-instance development).
 */
export function getSharedRedisStore(): RedisStore | null {
  if (shared !== undefined) {
    return shared;
  }
  const url = getConfig().jobs.redisUrl;
  shared = url ? new RedisStore({ url }) : null;
  if (shared) {
    logger.info('[redis] shared application state store enabled.');
  }
  return shared;
}

/** Test helper: drop the memoised store without closing an injected client. */
export async function resetSharedRedisStoreForTests(): Promise<void> {
  await closeSharedRedisStore();
}

/** Close and forget the shared store (graceful shutdown). */
export async function closeSharedRedisStore(): Promise<void> {
  if (shared) {
    try {
      await shared.close();
    } catch {
      // Already closed or never connected; shutdown must continue.
    }
  }
  shared = undefined;
}

/** Test helper: install a specific store (or `null`) for the next call. */
export function setSharedRedisStoreForTests(store: RedisStore | null): void {
  shared = store;
}
