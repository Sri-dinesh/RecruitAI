import type { AppConfig } from '../config/index.js';
import { getSharedRedisStore, type RedisStore } from '../redis/client.js';
import { logEvent } from '../telemetry/logging.js';
import { createLogger } from '../telemetry/logger.js';

/**
 * LLM spend safety (Phase 23).
 *
 * Two independent controls live here:
 *
 * 1. **Concurrency lease** — a fleet-wide semaphore around Gemini attempts. A
 *    runaway fan-out (burst of chat turns, retries, graph branches) otherwise
 *    multiplies token spend across replicas with no ceiling. With Redis the
 *    semaphore is a sorted set of lease members scored by expiry, claimed in one
 *    Lua call; without Redis it degrades to a bounded in-process set.
 * 2. **Cost anomaly alert** — an approximate rolling spend window. Crossing the
 *    configured threshold emits `llm_cost_anomaly` (and a warn log) at most once
 *    per window fleet-wide, so paging does not repeat for every request.
 *
 * Fail-open policy: a Redis outage must not stop inference. The gate falls back
 * to local state and logs the degradation. Only a genuinely saturated local or
 * shared semaphore blocks a call (the caller degrades to deterministic rules).
 */

const logger = createLogger('recruitai.llm_budget');

export class LlmBudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmBudgetExceededError';
  }
}

/** A held concurrency slot. Always call `release()` when the attempt ends. */
export interface LlmLease {
  release(): Promise<void>;
}

/** Minimal surface `callLlm` needs, so tests can inject a stub. */
export interface LlmBudgetGateLike {
  acquire(): Promise<LlmLease | null>;
  recordCost(costUsd: number, model: string): Promise<void>;
}

export interface LlmBudgetGateOptions {
  readonly maxConcurrency: number;
  readonly leaseTtlMs: number;
  readonly acquireTimeoutMs: number;
  readonly costWindowMs: number;
  readonly costThresholdUsd: number;
  readonly store?: RedisStore | null;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

/**
 * Atomically prune expired leases and claim one slot.
 *
 * KEYS[1] leases sorted set
 * ARGV[1] now (ms), ARGV[2] lease TTL (ms), ARGV[3] max concurrency,
 * ARGV[4] member
 */
const ACQUIRE_LEASE_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now)
if redis.call('ZCARD', key) >= limit then
  return {0, 0}
end
redis.call('ZADD', key, now + ttl, member)
redis.call('PEXPIRE', key, ttl)
return {1, redis.call('ZCARD', key)}
`;

const RELEASE_LEASE_SCRIPT = `
return redis.call('ZREM', KEYS[1], ARGV[1])
`;

/**
 * Add the attempt cost to the rolling window and return the window total.
 *
 * KEYS[1] window key
 * ARGV[1] cost USD, ARGV[2] window seconds
 */
const ADD_COST_SCRIPT = `
local total = redis.call('INCRBYFLOAT', KEYS[1], ARGV[1])
redis.call('EXPIRE', KEYS[1], ARGV[2])
return tostring(total)
`;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export class LlmBudgetGate implements LlmBudgetGateLike {
  private readonly maxConcurrency: number;
  private readonly leaseTtlMs: number;
  private readonly acquireTimeoutMs: number;
  private readonly costWindowMs: number;
  private readonly costThresholdUsd: number;
  private readonly store: RedisStore | null;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly localLeases = new Map<string, number>();
  private readonly localCosts: Array<{ at: number; usd: number }> = [];
  private localLastAlertAt = Number.NEGATIVE_INFINITY;
  private memberCounter = 0;

  constructor(options: LlmBudgetGateOptions) {
    this.maxConcurrency = Math.max(1, options.maxConcurrency);
    this.leaseTtlMs = Math.max(1_000, options.leaseTtlMs);
    this.acquireTimeoutMs = Math.max(0, options.acquireTimeoutMs);
    this.costWindowMs = Math.max(1_000, options.costWindowMs);
    this.costThresholdUsd = Math.max(0, options.costThresholdUsd);
    this.store = options.store ?? null;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
  }

  private leaseKey(): string {
    return this.store ? this.store.key('llm', 'leases') : '';
  }

  async acquire(): Promise<LlmLease | null> {
    const deadline = this.now() + this.acquireTimeoutMs;
    for (;;) {
      const lease = await this.tryAcquire();
      if (lease) {
        return lease;
      }
      const remaining = deadline - this.now();
      if (remaining <= 0) {
        return null;
      }
      await this.sleep(Math.min(50, remaining));
    }
  }

  private nextMember(): string {
    this.memberCounter += 1;
    return `${this.now()}:${process.pid}:${this.memberCounter}`;
  }

  private tryLocalAcquire(member: string): LlmLease | null {
    const at = this.now();
    for (const [key, expiresAt] of this.localLeases) {
      if (expiresAt <= at) {
        this.localLeases.delete(key);
      }
    }
    if (this.localLeases.size >= this.maxConcurrency) {
      return null;
    }
    this.localLeases.set(member, at + this.leaseTtlMs);
    return {
      release: async () => {
        this.localLeases.delete(member);
      },
    };
  }

  private async tryAcquire(): Promise<LlmLease | null> {
    const member = this.nextMember();
    if (!this.store) {
      return this.tryLocalAcquire(member);
    }

    try {
      const result = await this.store.evalScript(
        ACQUIRE_LEASE_SCRIPT,
        [this.leaseKey()],
        [this.now(), this.leaseTtlMs, this.maxConcurrency, member],
      );
      const allowed = Number(Array.isArray(result) ? result[0] : 0) === 1;
      if (!allowed) {
        return null;
      }
      return {
        release: async () => {
          try {
            await this.store?.evalScript(RELEASE_LEASE_SCRIPT, [this.leaseKey()], [member]);
          } catch (error) {
            logger.warn(
              `[llm_budget] Could not release lease (it expires by TTL): ${errorMessage(error)}`,
            );
          }
        },
      };
    } catch (error) {
      logger.warn(`[llm_budget] Redis lease failed; using local semaphore: ${errorMessage(error)}`);
      return this.tryLocalAcquire(member);
    }
  }

  async recordCost(costUsd: number, model: string): Promise<void> {
    if (!Number.isFinite(costUsd) || costUsd <= 0) {
      return;
    }

    const at = this.now();
    this.localCosts.push({ at, usd: costUsd });
    const cutoff = at - this.costWindowMs;
    while (this.localCosts.length > 0 && (this.localCosts[0]?.at ?? at) <= cutoff) {
      this.localCosts.shift();
    }
    let total = this.localCosts.reduce((sum, entry) => sum + entry.usd, 0);

    if (this.store) {
      try {
        const raw = await this.store.evalScript(
          ADD_COST_SCRIPT,
          [this.store.key('llm', 'cost_window')],
          [costUsd, Math.ceil(this.costWindowMs / 1000)],
        );
        const shared = Number(raw);
        if (Number.isFinite(shared)) {
          total = shared;
        }
      } catch (error) {
        logger.warn(
          `[llm_budget] Cost window write failed; using local total: ${errorMessage(error)}`,
        );
      }
    }

    if (total < this.costThresholdUsd) {
      return;
    }
    if (!(await this.shouldAlert(at))) {
      return;
    }

    logger.warn(
      `[llm_budget] LLM spend anomaly: $${total.toFixed(4)} in ` +
        `${Math.round(this.costWindowMs / 1000)}s (threshold $${this.costThresholdUsd.toFixed(2)}, model ${model}).`,
      { model, status: 'cost_anomaly', cost_usd: total },
    );
    logEvent('llm_cost_anomaly', {
      provider: 'gemini',
      node: 'llm_budget',
      extra: {
        cost_usd: Number(total.toFixed(6)),
        model,
      },
    });
  }

  private async shouldAlert(at: number): Promise<boolean> {
    if (this.store) {
      try {
        const remaining = await this.store.claimTtl(
          this.store.key('llm', 'cost_alert'),
          this.costWindowMs,
        );
        return remaining === 0;
      } catch (error) {
        logger.warn(`[llm_budget] Alert claim failed; using local dedupe: ${errorMessage(error)}`);
      }
    }
    if (at - this.localLastAlertAt < this.costWindowMs) {
      return false;
    }
    this.localLastAlertAt = at;
    return true;
  }
}

let defaultGate: LlmBudgetGate | undefined;
let defaultFingerprint = '';

function fingerprint(config: AppConfig): string {
  return [
    config.jobs.redisUrl ?? 'local',
    config.llm.maxConcurrentCalls,
    config.llm.budgetLeaseSeconds,
    config.llm.budgetAcquireTimeoutMs,
    config.llm.costAlarmWindowSeconds,
    config.llm.costAlarmThresholdUsd,
  ].join(':');
}

/** Process-wide gate bound to the active LLM budget configuration. */
export function getDefaultLlmBudgetGate(config: AppConfig): LlmBudgetGate {
  const next = fingerprint(config);
  if (defaultGate && next === defaultFingerprint) {
    return defaultGate;
  }
  defaultGate = new LlmBudgetGate({
    maxConcurrency: config.llm.maxConcurrentCalls,
    leaseTtlMs: config.llm.budgetLeaseSeconds * 1000,
    acquireTimeoutMs: config.llm.budgetAcquireTimeoutMs,
    costWindowMs: config.llm.costAlarmWindowSeconds * 1000,
    costThresholdUsd: config.llm.costAlarmThresholdUsd,
    store: getSharedRedisStore(),
  });
  defaultFingerprint = next;
  return defaultGate;
}

/** Test helper: drop the memoised gate. */
export function resetDefaultLlmBudgetGateForTests(): void {
  defaultGate = undefined;
  defaultFingerprint = '';
}
