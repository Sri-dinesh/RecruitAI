import type { AppConfig } from '../config/index.js';
import { recordDependencyProbe } from '../resilience/dependencies.js';
import { createLogger } from '../telemetry/logger.js';
import { getSharedRedisStore, type RedisStore } from './client.js';

/**
 * Redis health probe with transition telemetry (Phase 24).
 *
 * Redis is optional in development (`REDIS_URL` unset) and required for
 * fleet-wide state in production. When it is configured but unreachable:
 * - the readiness probe fails by default (Phase 21 behavior);
 * - with `REDIS_DEGRADED_MODE_ENABLED=true`, readiness reports `degraded`
 *   instead, in-memory caches/limits keep serving, and async chat enqueue is
 *   disabled explicitly rather than waiting on a dead connection.
 *
 * The result is cached for `REDIS_HEALTH_CACHE_MS` so polling/readiness checks
 * do not ping Redis on every request. Transitions log loudly and feed the
 * shared dependency breaker.
 */

const logger = createLogger('recruitai.redis_health');

export interface RedisHealthResult {
  /** False when `REDIS_URL` is not configured (single-instance local mode). */
  readonly configured: boolean;
  readonly healthy: boolean;
  /** Cached result timestamp (epoch ms). */
  readonly checkedAt: number;
  readonly error?: unknown;
}

let cached: RedisHealthResult | undefined;
let cachedUrl: string | null = null;
let lastLogged: boolean | undefined;

/** Current time in epoch milliseconds; injectable for tests. */
function nowMs(): number {
  return Date.now();
}

/** Test helper: clear the cached result and transition state. */
export function resetRedisHealthForTests(): void {
  cached = undefined;
  cachedUrl = null;
  lastLogged = undefined;
}

/**
 * Probe Redis, reusing a recent result. `store` is injectable for tests.
 */
export async function probeRedisHealth(
  config: AppConfig,
  store: RedisStore | null = getSharedRedisStore(),
): Promise<RedisHealthResult> {
  if (!config.jobs.redisUrl) {
    return { configured: false, healthy: true, checkedAt: nowMs() };
  }

  const currentUrl = config.jobs.redisUrl;
  if (
    cached &&
    cachedUrl === currentUrl &&
    nowMs() - cached.checkedAt < config.resilience.redisHealthCacheMs
  ) {
    return cached;
  }

  let healthy = false;
  let error: unknown;
  if (!store) {
    error = new Error('Redis store is unavailable.');
  } else {
    try {
      healthy = await store.ping();
      if (!healthy) {
        error = new Error('Redis PING did not return PONG.');
      }
    } catch (cause) {
      error = cause;
    }
  }

  const result: RedisHealthResult = {
    configured: true,
    healthy,
    checkedAt: nowMs(),
    ...(healthy ? {} : { error }),
  };
  cached = result;
  cachedUrl = currentUrl;

  await recordDependencyProbe('redis', config, healthy, error);
  logTransition(config, healthy, error);
  return result;
}

function logTransition(config: AppConfig, healthy: boolean, error: unknown): void {
  if (lastLogged === healthy) {
    return;
  }
  lastLogged = healthy;

  if (healthy) {
    logger.info('[redis] health probe recovered; fleet-wide state is available again.', {
      status: 'recovered',
    });
    return;
  }

  const reason = error instanceof Error ? error.message : String(error ?? 'unknown');
  if (config.resilience.redisDegradedModeEnabled) {
    logger.error(
      `[redis] UNAVAILABLE (${reason}). Running in DEGRADED single-instance mode: ` +
        'in-memory caches/limits remain active, async chat enqueue is disabled, and SSE fan-out ' +
        'is local to this replica. Restore Redis to return to steady state.',
      { status: 'degraded' },
    );
    return;
  }
  logger.error(
    `[redis] UNAVAILABLE (${reason}). Readiness will report unhealthy and fleet-wide state ` +
      '(jobs, caches, breakers, rate limits) is degraded to per-instance state.',
    { status: 'unavailable' },
  );
}
