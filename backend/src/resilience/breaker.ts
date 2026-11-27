import { logEvent } from '../telemetry/logging.js';
import { createLogger } from '../telemetry/logger.js';
import { metricsRegistry, type RedMetricsRegistry } from '../telemetry/metrics.js';
import type { RedisStore } from '../redis/client.js';

/**
 * Reusable circuit breaker (Phase 24).
 *
 * This generalizes the Gemini-only breaker from Phase 8 into one implementation
 * used by every external dependency (Gemini, Tavily, SMTP, Razorpay, Postgres,
 * Redis). The state machine is unchanged: consecutive failures trip a circuit
 * to OPEN, a cooldown moves it to HALF_OPEN for a canary probe, and one success
 * closes it again.
 *
 * Two backends are provided:
 * - `CircuitBreaker` keeps state in-process (development and local fallback);
 * - `RedisCircuitBreaker` keeps the same state in Redis so every replica trips
 *   and recovers together. If Redis itself is unavailable it delegates to a
 *   local breaker, exactly like the Phase 21 LLM breaker did.
 *
 * Trip/half-open/close transitions emit a structured telemetry event and a
 * Prometheus gauge/counter. Attribute payloads stay limited to the existing
 * allowlist (no prompts, resumes or provider messages).
 */

const logger = createLogger('recruitai.resilience');

export const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
} as const;

export type CircuitStateValue = (typeof CircuitState)[keyof typeof CircuitState];

/** Stable numeric values for the Prometheus gauge. */
export const CIRCUIT_STATE_VALUES: Readonly<Record<CircuitStateValue, number>> = {
  CLOSED: 0,
  HALF_OPEN: 1,
  OPEN: 2,
};

/** Raised when a breaker refuses a call because the dependency is open. */
export class CircuitOpenError extends Error {
  constructor(
    readonly dependency: string,
    readonly key: string = 'default',
  ) {
    super(
      `Circuit breaker is OPEN for ${dependency}${key === 'default' ? '' : `:${key}`}. ` +
        'Degrade gracefully or retry after the cooldown.',
    );
    this.name = 'CircuitOpenError';
  }
}

export interface CircuitBreakerOptions {
  /** Logical keys tracked by this breaker (models, operations, …). */
  readonly keys?: readonly string[];
  /** Consecutive failures before a circuit opens. Default: 3. */
  readonly failureThreshold?: number;
  /** Cooldown before OPEN -> HALF_OPEN probing. Default: 60 s. */
  readonly cooldownSeconds?: number;
  /** Clock in epoch seconds, injectable for tests. */
  readonly now?: () => number;
  /** Dependency name used in telemetry (e.g. `tavily`). */
  readonly name?: string;
  /** Disable telemetry (used by Redis breaker fallbacks to avoid duplicates). */
  readonly telemetry?: boolean;
}

/** Async surface shared by the local and fleet-wide breaker implementations. */
export interface AsyncCircuitBreaker {
  canAttemptAsync(key: string): Promise<boolean>;
  recordSuccessAsync(key: string): Promise<void>;
  recordFailureAsync(key: string, isRateLimit?: boolean): Promise<void>;
  getCircuitStateAsync(key: string): Promise<CircuitStateValue>;
  resetAsync(): Promise<void>;
}

function formatCooldown(seconds: number): string {
  return Number.isInteger(seconds) ? seconds.toFixed(1) : String(seconds);
}

interface CircuitTelemetry {
  readonly registry: RedMetricsRegistry;
  readonly enabled: boolean;
}

const DEFAULT_TELEMETRY: CircuitTelemetry = { registry: metricsRegistry, enabled: true };

/** HALF_OPEN is a transition too: update the gauge and emit one event. */
function emitHalfOpenTransition(telemetry: CircuitTelemetry, dependency: string): void {
  if (!telemetry.enabled) {
    return;
  }
  telemetry.registry.recordDependencyCircuitState(dependency, CircuitState.HALF_OPEN);
  logEvent(`dependency_breaker:${dependency}`, {
    provider: dependency,
    node: 'resilience',
    extra: { circuit_state: CircuitState.HALF_OPEN, status: 'half_open' },
  });
}

function emitTransition(
  telemetry: CircuitTelemetry,
  dependency: string,
  key: string,
  state: CircuitStateValue,
  reason: 'failure_threshold' | 'rate_limit' | 'recovered',
  cooldownSeconds: number,
): void {
  if (!telemetry.enabled) {
    return;
  }

  telemetry.registry.recordDependencyCircuitState(dependency, state);
  if (state === CircuitState.OPEN) {
    telemetry.registry.recordDependencyCircuitTrip(dependency, reason);
  }

  const warning =
    state === CircuitState.OPEN
      ? `[circuit_breaker] ${dependency}:${key} reached ${reason === 'rate_limit' ? 'a rate limit' : 'its failure threshold'}. ` +
        `Circuit tripped to OPEN for ${formatCooldown(cooldownSeconds)}s cooldown.`
      : `[circuit_breaker] ${dependency}:${key} probe succeeded; circuit CLOSED.`;
  if (state === CircuitState.OPEN) {
    logger.warn(warning, {
      dependency,
      circuit_state: state,
      status: reason,
      latency_ms: 0,
    });
  } else {
    logger.info(warning, { dependency, circuit_state: state, status: reason, latency_ms: 0 });
  }

  // Structured, tenant-scoped telemetry. `dependency` is not on the extra
  // allowlist, so it travels as the event intent (safe, no PII).
  logEvent(`dependency_breaker:${dependency}`, {
    provider: dependency,
    node: 'resilience',
    extra: { circuit_state: state, status: reason },
  });
}

/**
 * Process-local circuit breaker. Safe to share across requests because Node is
 * single-threaded; no lock is required.
 */
export class CircuitBreaker implements AsyncCircuitBreaker {
  readonly failureThreshold: number;
  readonly cooldownSeconds: number;
  protected readonly keys: readonly string[];
  protected readonly now: () => number;
  private readonly name: string;
  protected readonly telemetry: CircuitTelemetry;
  private readonly states = new Map<string, CircuitStateValue>();
  private readonly failureCounts = new Map<string, number>();
  private readonly lastFailureTimes = new Map<string, number>();
  private readonly lastSuccessTimes = new Map<string, number>();

  constructor(options: CircuitBreakerOptions = {}) {
    this.keys = options.keys ?? ['default'];
    this.failureThreshold = options.failureThreshold ?? 3;
    this.cooldownSeconds = options.cooldownSeconds ?? 60;
    this.now = options.now ?? (() => Date.now() / 1000);
    this.name = options.name ?? 'dependency';
    this.telemetry = { ...DEFAULT_TELEMETRY, enabled: options.telemetry !== false };
    this.reset();
  }

  canAttempt(key: string): boolean {
    const state = this.states.get(key) ?? CircuitState.CLOSED;
    if (state === CircuitState.CLOSED) {
      return true;
    }

    const now = this.now();
    if (state === CircuitState.OPEN) {
      if (now - (this.lastFailureTimes.get(key) ?? 0) >= this.cooldownSeconds) {
        this.states.set(key, CircuitState.HALF_OPEN);
        logger.info(
          `[circuit_breaker] ${this.name}:${key} cooldown elapsed; entering HALF_OPEN state.`,
          { circuit_state: CircuitState.HALF_OPEN, status: 'half_open' },
        );
        emitHalfOpenTransition(this.telemetry, this.name);
        return true;
      }
      return false;
    }

    // HALF_OPEN allows a canary probe.
    return true;
  }

  recordSuccess(key: string): void {
    const previous = this.states.get(key) ?? CircuitState.CLOSED;
    this.states.set(key, CircuitState.CLOSED);
    this.failureCounts.set(key, 0);
    this.lastSuccessTimes.set(key, this.now());
    if (previous !== CircuitState.CLOSED) {
      emitTransition(
        this.telemetry,
        this.name,
        key,
        CircuitState.CLOSED,
        'recovered',
        this.cooldownSeconds,
      );
    }
  }

  recordFailure(key: string, isRateLimit = false): void {
    const now = this.now();
    this.lastFailureTimes.set(key, now);

    if (isRateLimit) {
      this.states.set(key, CircuitState.OPEN);
      this.failureCounts.set(key, this.failureThreshold);
      emitTransition(
        this.telemetry,
        this.name,
        key,
        CircuitState.OPEN,
        'rate_limit',
        this.cooldownSeconds,
      );
      return;
    }

    const failures = (this.failureCounts.get(key) ?? 0) + 1;
    this.failureCounts.set(key, failures);
    if (failures >= this.failureThreshold) {
      this.states.set(key, CircuitState.OPEN);
      emitTransition(
        this.telemetry,
        this.name,
        key,
        CircuitState.OPEN,
        'failure_threshold',
        this.cooldownSeconds,
      );
    }
  }

  getCircuitState(key: string): CircuitStateValue {
    return this.states.get(key) ?? CircuitState.CLOSED;
  }

  reset(): void {
    for (const key of this.keys) {
      this.states.set(key, CircuitState.CLOSED);
      this.failureCounts.set(key, 0);
      this.lastFailureTimes.set(key, 0);
      this.lastSuccessTimes.set(key, 0);
    }
  }

  /** Test/introspection helper; the Python breaker does not expose success times. */
  getLastSuccessTime(key: string): number {
    return this.lastSuccessTimes.get(key) ?? 0;
  }

  async canAttemptAsync(key: string): Promise<boolean> {
    return this.canAttempt(key);
  }

  async recordSuccessAsync(key: string): Promise<void> {
    this.recordSuccess(key);
  }

  async recordFailureAsync(key: string, isRateLimit = false): Promise<void> {
    this.recordFailure(key, isRateLimit);
  }

  async getCircuitStateAsync(key: string): Promise<CircuitStateValue> {
    return this.getCircuitState(key);
  }

  async resetAsync(): Promise<void> {
    this.reset();
  }
}

/**
 * Atomically record a failure and trip the circuit when the threshold is hit.
 * KEYS: failures, last_failure, state
 * ARGV: failure ttl seconds, now (epoch seconds), rate-limit flag, threshold
 */
const RECORD_FAILURE_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], ARGV[2])
redis.call('EXPIRE', KEYS[2], ARGV[1])

local shouldTrip = ARGV[3] == '1' or count >= tonumber(ARGV[4])
if shouldTrip then
  local wasOpen = redis.call('GET', KEYS[3]) == 'OPEN'
  redis.call('SET', KEYS[3], 'OPEN')
  redis.call('EXPIRE', KEYS[3], ARGV[1])
  if wasOpen then
    return {count, 0}
  end
  return {count, 1}
end
return {count, 0}
`;

export interface RedisCircuitBreakerOptions extends CircuitBreakerOptions {
  readonly store: RedisStore;
}

/**
 * Fleet-wide breaker backed by Redis counters, timestamps and TTLs.
 *
 * `name` doubles as the key namespace, so `tavily` and `razorpay` never share
 * state. Redis failures fall back to the in-process breaker rather than making
 * dependency traffic fail twice.
 */
export class RedisCircuitBreaker implements AsyncCircuitBreaker {
  readonly failureThreshold: number;
  readonly cooldownSeconds: number;
  protected readonly keys: readonly string[];
  protected readonly now: () => number;
  private readonly name: string;
  private readonly store: RedisStore;
  private readonly fallback: CircuitBreaker;
  private readonly telemetry: CircuitTelemetry;

  constructor(options: RedisCircuitBreakerOptions) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.cooldownSeconds = options.cooldownSeconds ?? 60;
    this.keys = options.keys ?? ['default'];
    this.now = options.now ?? (() => Date.now() / 1000);
    this.name = options.name ?? 'dependency';
    this.store = options.store;
    this.telemetry = { ...DEFAULT_TELEMETRY, enabled: options.telemetry !== false };
    this.fallback = new CircuitBreaker({
      keys: this.keys,
      failureThreshold: this.failureThreshold,
      cooldownSeconds: this.cooldownSeconds,
      now: this.now,
      name: this.name,
      telemetry: false,
    });
  }

  private namespacedKey(key: string, suffix: string): string {
    return this.store.key('breaker', this.name, key, suffix);
  }

  private failureTtlSeconds(): number {
    return Math.max(60, Math.ceil(this.cooldownSeconds * 2));
  }

  async canAttemptAsync(key: string): Promise<boolean> {
    try {
      const state = await this.store.getString(this.namespacedKey(key, 'state'));
      if (state === null || state === 'CLOSED') {
        return true;
      }
      if (state === 'HALF_OPEN') {
        return true;
      }
      const lastFailure = Number(
        (await this.store.getString(this.namespacedKey(key, 'last_failure'))) ?? 0,
      );
      if (this.now() - lastFailure >= this.cooldownSeconds) {
        await this.store.setString(
          this.namespacedKey(key, 'state'),
          CircuitState.HALF_OPEN,
          this.failureTtlSeconds(),
        );
        logger.info(
          `[circuit_breaker] ${this.name}:${key} cooldown elapsed; entering HALF_OPEN state.`,
          { circuit_state: CircuitState.HALF_OPEN, status: 'half_open' },
        );
        emitHalfOpenTransition(this.telemetry, this.name);
        return true;
      }
      return false;
    } catch (error) {
      logger.warn(
        `[circuit_breaker] ${this.name}: Redis read failed; using local breaker: ${errorMessage(error)}`,
      );
      return this.fallback.canAttempt(key);
    }
  }

  async recordSuccessAsync(key: string): Promise<void> {
    let wasOpen = this.fallback.getCircuitState(key) !== CircuitState.CLOSED;
    this.fallback.recordSuccess(key);
    try {
      // Fleet state may have been opened by another replica; read it before
      // closing so recovery telemetry fires on every replica that observes it.
      const state = await this.store.getString(this.namespacedKey(key, 'state'));
      if (state === CircuitState.OPEN || state === CircuitState.HALF_OPEN) {
        wasOpen = true;
      }
      await this.store.setString(
        this.namespacedKey(key, 'state'),
        CircuitState.CLOSED,
        this.failureTtlSeconds(),
      );
      await this.store.delete(this.namespacedKey(key, 'failures'));
      await this.store.delete(this.namespacedKey(key, 'last_failure'));
    } catch (error) {
      logger.warn(
        `[circuit_breaker] ${this.name}: Redis write failed; local state only: ${errorMessage(error)}`,
      );
    }
    if (wasOpen) {
      emitTransition(
        this.telemetry,
        this.name,
        key,
        CircuitState.CLOSED,
        'recovered',
        this.cooldownSeconds,
      );
    }
  }

  async recordFailureAsync(key: string, isRateLimit = false): Promise<void> {
    this.fallback.recordFailure(key, isRateLimit);
    try {
      const result = await this.store.evalScript(
        RECORD_FAILURE_SCRIPT,
        [
          this.namespacedKey(key, 'failures'),
          this.namespacedKey(key, 'last_failure'),
          this.namespacedKey(key, 'state'),
        ],
        [
          this.failureTtlSeconds(),
          Math.floor(this.now()),
          isRateLimit ? 1 : 0,
          this.failureThreshold,
        ],
      );
      const [, tripped] = Array.isArray(result) ? result : [0, 0];
      if (Number(tripped) === 1) {
        emitTransition(
          this.telemetry,
          this.name,
          key,
          CircuitState.OPEN,
          isRateLimit ? 'rate_limit' : 'failure_threshold',
          this.cooldownSeconds,
        );
      }
    } catch (error) {
      logger.warn(
        `[circuit_breaker] ${this.name}: Redis write failed; local state only: ${errorMessage(error)}`,
      );
    }
  }

  async getCircuitStateAsync(key: string): Promise<CircuitStateValue> {
    try {
      const state = await this.store.getString(this.namespacedKey(key, 'state'));
      if (state === 'OPEN' || state === 'HALF_OPEN') {
        return state;
      }
      return CircuitState.CLOSED;
    } catch (error) {
      logger.warn(
        `[circuit_breaker] ${this.name}: Redis read failed; using local state: ${errorMessage(error)}`,
      );
      return this.fallback.getCircuitState(key);
    }
  }

  async resetAsync(): Promise<void> {
    this.fallback.reset();
    try {
      for (const key of this.keys) {
        await this.store.delete(this.namespacedKey(key, 'state'));
        await this.store.delete(this.namespacedKey(key, 'failures'));
        await this.store.delete(this.namespacedKey(key, 'last_failure'));
      }
    } catch (error) {
      logger.warn(
        `[circuit_breaker] ${this.name}: Redis reset failed; local state cleared: ${errorMessage(error)}`,
      );
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
