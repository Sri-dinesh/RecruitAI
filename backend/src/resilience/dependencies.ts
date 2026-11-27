import type { AppConfig } from '../config/index.js';
import { getSharedRedisStore } from '../redis/client.js';
import {
  CircuitBreaker,
  CircuitOpenError,
  RedisCircuitBreaker,
  type AsyncCircuitBreaker,
} from './breaker.js';

/**
 * Dependency breaker registry (Phase 24).
 *
 * Every external dependency gets its own thresholds and Redis namespace. The
 * breakers are memoised per process so a request path does not rebuild them.
 * When `REDIS_URL` is unset (or `resilience.enabled` is false) the local
 * implementation is used; when Redis is configured but unreachable the Redis
 * breaker falls back to local state itself.
 */

export type DependencyName = 'gemini' | 'tavily' | 'smtp' | 'razorpay' | 'postgres' | 'redis';

export const DEPENDENCY_BREAKER_DEFAULTS: Readonly<
  Record<DependencyName, { readonly failureThreshold: number; readonly cooldownSeconds: number }>
> = {
  // Gemini keeps the Phase 8 defaults so failover behavior is unchanged.
  gemini: { failureThreshold: 3, cooldownSeconds: 60 },
  tavily: { failureThreshold: 3, cooldownSeconds: 60 },
  smtp: { failureThreshold: 3, cooldownSeconds: 60 },
  razorpay: { failureThreshold: 3, cooldownSeconds: 60 },
  // Connection failures are expensive (pool churn); be slower to trip and
  // quicker to recover so a brief blip does not park the whole database.
  postgres: { failureThreshold: 5, cooldownSeconds: 30 },
  redis: { failureThreshold: 3, cooldownSeconds: 15 },
};

/** ASCII error codes that always mean "the dependency is unreachable". */
const TRANSIENT_CODES: ReadonlySet<string> = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_BODY_TIMEOUT',
  'ESOCKETTIMEDOUT',
  'ETIMEOUT',
  'EDNS',
  'EAI_FAIL',
]);

/** PostgreSQL class 08 (connection exception) and 57P0x (shutdown) codes. */
const TRANSIENT_POSTGRES_CODES: ReadonlySet<string> = new Set([
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '08007',
  '08P01',
  '57P01',
  '57P02',
  '57P03',
  '53300',
]);

const TRANSIENT_MESSAGE_FRAGMENTS = [
  'timeout',
  'timed out',
  'socket hang up',
  'connection refused',
  'connection reset',
  'network error',
  'fetch failed',
  'service unavailable',
  'bad gateway',
  'gateway timeout',
];

function errorCode(error: unknown): string {
  const candidate = (error ?? {}) as { code?: unknown; cause?: unknown };
  if (typeof candidate.code === 'string') {
    return candidate.code;
  }
  const cause = candidate.cause as { code?: unknown } | undefined;
  return typeof cause?.code === 'string' ? cause.code : '';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** True for connectivity/timeout failures worth tripping a circuit over. */
export function isTransientDependencyError(error: unknown): boolean {
  if (error instanceof CircuitOpenError) {
    return false;
  }
  const code = errorCode(error);
  if (TRANSIENT_CODES.has(code)) {
    return true;
  }
  const lower = errorMessage(error).toLowerCase();
  return TRANSIENT_MESSAGE_FRAGMENTS.some((fragment) => lower.includes(fragment));
}

/** True for database failures that indicate the pool/server is unreachable. */
export function isTransientDatabaseError(error: unknown): boolean {
  const code = errorCode(error);
  if (TRANSIENT_CODES.has(code) || TRANSIENT_POSTGRES_CODES.has(code)) {
    return true;
  }
  return isTransientDependencyError(error);
}

/** 429 / quota messages trip immediately, as in the LLM pool. */
export function isRateLimitError(error: unknown): boolean {
  const lower = errorMessage(error).toLowerCase();
  return (
    errorCode(error) === '429' ||
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('rate_limit') ||
    lower.includes('resource_exhausted')
  );
}

const breakers = new Map<string, AsyncCircuitBreaker>();

function memoKey(name: DependencyName, config: AppConfig): string {
  return `${name}:${config.jobs.redisUrl ?? 'local'}`;
}

/**
 * Process-wide breaker for a dependency. Redis-backed when configured so a
 * failing provider is skipped by every replica, local otherwise.
 */
export function getDependencyBreaker(name: DependencyName, config: AppConfig): AsyncCircuitBreaker {
  const key = memoKey(name, config);
  const existing = breakers.get(key);
  if (existing) {
    return existing;
  }

  const defaults = DEPENDENCY_BREAKER_DEFAULTS[name];
  const options = {
    keys: ['default'],
    name,
    failureThreshold: defaults.failureThreshold,
    cooldownSeconds: defaults.cooldownSeconds,
  };
  const store = config.jobs.redisUrl ? getSharedRedisStore() : null;
  const breaker = store
    ? new RedisCircuitBreaker({ ...options, store })
    : new CircuitBreaker(options);
  breakers.set(key, breaker);
  return breaker;
}

/** Test helper: forget memoised breakers and any local state. */
export function resetDependencyBreakersForTests(): void {
  breakers.clear();
}

export interface RunWithBreakerOptions {
  readonly config: AppConfig;
  readonly dependency: DependencyName;
  /** Logical operation key; defaults to `default`. */
  readonly key?: string;
  /** Skip the breaker entirely (some callers already handle degradation). */
  readonly enabled?: boolean;
  /** Which errors trip the circuit; defaults to connectivity/timeouts. */
  readonly isFailure?: (error: unknown) => boolean;
  /** Which failures are rate limits (trip immediately). */
  readonly isRateLimit?: (error: unknown) => boolean;
}

/**
 * Run `fn` behind the dependency's breaker.
 *
 * An OPEN circuit throws `CircuitOpenError` immediately; callers keep their
 * existing fallbacks (Tavily deterministic data, SMTP failure text, simulated
 * Razorpay orders in development, readiness failures for Postgres/Redis).
 */
export async function runWithBreaker<T>(
  options: RunWithBreakerOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const enabled = options.enabled ?? options.config.resilience.enabled;
  if (!enabled) {
    return fn();
  }

  const breaker = getDependencyBreaker(options.dependency, options.config);
  const key = options.key ?? 'default';
  if (!(await breaker.canAttemptAsync(key))) {
    throw new CircuitOpenError(options.dependency, key);
  }

  try {
    const result = await fn();
    await breaker.recordSuccessAsync(key);
    return result;
  } catch (error) {
    const isFailure = options.isFailure ?? isTransientDependencyError;
    const isRateLimit = options.isRateLimit ?? isRateLimitError;
    if (isFailure(error)) {
      await breaker.recordFailureAsync(key, isRateLimit(error));
    }
    throw error;
  }
}

/**
 * Record a health-probe outcome for Postgres/Redis without wrapping the whole
 * query path. Readiness is the canonical dependency probe, so its result keeps
 * the breaker in sync with observed reality.
 */
export async function recordDependencyProbe(
  name: DependencyName,
  config: AppConfig,
  healthy: boolean,
  error?: unknown,
): Promise<void> {
  if (!config.resilience.enabled) {
    return;
  }
  const breaker = getDependencyBreaker(name, config);
  if (healthy) {
    await breaker.recordSuccessAsync('default');
    return;
  }
  const failure = error ?? new Error(`${name} probe failed`);
  // A failed health probe is always worth counting: it is the signal operators
  // use, even when the underlying error is not classified as transient.
  await breaker.recordFailureAsync('default', isRateLimitError(failure));
}
