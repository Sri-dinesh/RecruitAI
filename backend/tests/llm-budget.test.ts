import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { loadConfig } from '../src/config/index.js';
import {
  getDefaultLlmBudgetGate,
  LlmBudgetExceededError,
  LlmBudgetGate,
  resetDefaultLlmBudgetGateForTests,
  type LlmBudgetGateLike,
} from '../src/llm/budget.js';
import type { GeminiInvoker } from '../src/llm/gemini.js';
import { callLlm, ModelCircuitBreaker } from '../src/llm/router.js';
import type { RedisStore } from '../src/redis/client.js';
import { getAllLogs, resetTelemetryForTests } from '../src/telemetry/logging.js';
import { RedMetricsRegistry } from '../src/telemetry/metrics.js';

/**
 * Phase 23 LLM spend gate.
 *
 * The semaphore is per-gate (Redis-backed fleet-wide in production) and the
 * cost alert is an approximate rolling window with one event per window.
 */

function gate(
  overrides: Partial<ConstructorParameters<typeof LlmBudgetGate>[0]> = {},
): LlmBudgetGate {
  return new LlmBudgetGate({
    maxConcurrency: 1,
    leaseTtlMs: 60_000,
    acquireTimeoutMs: 0,
    costWindowMs: 60_000,
    costThresholdUsd: 1,
    ...overrides,
  });
}

beforeEach(() => {
  resetTelemetryForTests();
  resetDefaultLlmBudgetGateForTests();
});

describe('LLM concurrency lease', () => {
  it('caps concurrent holders and admits again after release', async () => {
    const budget = gate();
    const first = await budget.acquire();
    assert.ok(first);

    assert.equal(await budget.acquire(), null);

    await first.release();
    const second = await budget.acquire();
    assert.ok(second);
    await second.release();
  });

  it('waits for a slot up to the acquire timeout', async () => {
    let now = 1_000;
    const holder: { lease?: Awaited<ReturnType<LlmBudgetGate['acquire']>> } = {};
    const budget = gate({
      now: () => now,
      acquireTimeoutMs: 500,
      sleep: async (milliseconds) => {
        now += milliseconds;
        // Another request finishes while this one waits.
        await holder.lease?.release();
      },
    });

    holder.lease = await budget.acquire();
    assert.ok(holder.lease);

    const second = await budget.acquire();
    assert.ok(second);
    await second.release();
  });

  it('recovers an expired lease without an explicit release', async () => {
    let now = 1_000;
    const budget = gate({ now: () => now, leaseTtlMs: 5_000 });
    assert.ok(await budget.acquire());

    now += 5_001;
    const next = await budget.acquire();
    assert.ok(next);
    await next.release();
  });

  it('falls back to the local semaphore when Redis fails', async () => {
    const failing = {
      key: (...parts: Array<string | number>) => parts.join(':'),
      evalScript: async () => {
        throw new Error('redis down');
      },
    } as unknown as RedisStore;

    const budget = gate({ store: failing });
    const lease = await budget.acquire();
    assert.ok(lease);
    assert.equal(await budget.acquire(), null);
    await lease.release();
  });

  it('memoises the process-wide gate per budget configuration', () => {
    const first = getDefaultLlmBudgetGate(loadConfig({}));
    const same = getDefaultLlmBudgetGate(loadConfig({}));
    const changed = getDefaultLlmBudgetGate(loadConfig({ LLM_MAX_CONCURRENT_CALLS: '3' }));

    assert.equal(same, first);
    assert.notEqual(changed, first);
  });
});

describe('LLM cost anomaly alert', () => {
  it('emits one event per rolling window once the threshold is crossed', async () => {
    let now = 1_000;
    const budget = gate({
      now: () => now,
      costWindowMs: 60_000,
      costThresholdUsd: 0.1,
    });

    await budget.recordCost(0.06, 'gemini-3.5-flash');
    assert.equal(getAllLogs().filter((event) => event.intent === 'llm_cost_anomaly').length, 0);

    await budget.recordCost(0.06, 'gemini-3.5-flash');
    const alerts = getAllLogs().filter((event) => event.intent === 'llm_cost_anomaly');
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0]?.provider, 'gemini');
    assert.equal(alerts[0]?.node, 'llm_budget');
    assert.ok(Number(alerts[0]?.cost_usd) >= 0.1);

    // Same window: no duplicate alert.
    await budget.recordCost(0.5, 'gemini-3.5-flash');
    assert.equal(getAllLogs().filter((event) => event.intent === 'llm_cost_anomaly').length, 1);

    // Next window: the old cost is pruned and a new anomaly can alert.
    now += 61_000;
    await budget.recordCost(0.2, 'gemini-3.5-flash');
    assert.equal(getAllLogs().filter((event) => event.intent === 'llm_cost_anomaly').length, 2);
  });

  it('ignores non-positive or non-finite costs', async () => {
    const budget = gate({ costThresholdUsd: 0.01 });
    await budget.recordCost(0, 'model');
    await budget.recordCost(-1, 'model');
    await budget.recordCost(Number.NaN, 'model');
    assert.equal(getAllLogs().filter((event) => event.intent === 'llm_cost_anomaly').length, 0);
  });
});

describe('callLlm spend-gate integration', () => {
  it('acquires a lease, records cost, and releases on success', async () => {
    let acquired = 0;
    let released = 0;
    let recordedCost = 0;
    const budget: LlmBudgetGateLike = {
      acquire: async () => {
        acquired += 1;
        return {
          release: async () => {
            released += 1;
          },
        };
      },
      recordCost: async (costUsd) => {
        recordedCost = costUsd;
      },
    };
    const invoker: GeminiInvoker = async () => ({
      content: 'answer',
      usage_metadata: { input_tokens: 100, output_tokens: 50 },
    });

    const result = await callLlm('prompt', {
      config: loadConfig({ GEMINI_API_KEY: 'gemini-test-key' }),
      circuitBreaker: new ModelCircuitBreaker(),
      metrics: new RedMetricsRegistry(),
      invoker,
      budget,
    });

    assert.equal(result.text, 'answer');
    assert.equal(acquired, 1);
    assert.equal(released, 1);
    assert.ok(recordedCost > 0);
  });

  it('releases the lease when every provider fails', async () => {
    let released = 0;
    const budget: LlmBudgetGateLike = {
      acquire: async () => ({
        release: async () => {
          released += 1;
        },
      }),
      recordCost: async () => undefined,
    };
    const invoker: GeminiInvoker = async () => {
      throw new Error('provider unavailable');
    };

    await assert.rejects(
      callLlm('prompt', {
        config: loadConfig({ GEMINI_API_KEY: 'gemini-test-key' }),
        circuitBreaker: new ModelCircuitBreaker(),
        metrics: new RedMetricsRegistry(),
        invoker,
        budget,
      }),
    );
    assert.equal(released, 1);
  });

  it('fails fast with a budget error when no slot is available', async () => {
    const budget: LlmBudgetGateLike = {
      acquire: async () => null,
      recordCost: async () => undefined,
    };
    let invoked = false;
    const invoker: GeminiInvoker = async () => {
      invoked = true;
      return { content: 'never' };
    };

    await assert.rejects(
      callLlm('prompt', {
        config: loadConfig({ GEMINI_API_KEY: 'gemini-test-key' }),
        circuitBreaker: new ModelCircuitBreaker(),
        metrics: new RedMetricsRegistry(),
        invoker,
        budget,
      }),
      LlmBudgetExceededError,
    );
    assert.equal(invoked, false);
  });
});
