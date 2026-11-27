import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { loadConfig, ROTATING_MODELS, type AppConfig } from '../src/config/index.js';
import type { GeminiInvoker, GeminiRequest } from '../src/llm/gemini.js';
import {
  AllProvidersFailedError,
  CircuitState,
  ModelCircuitBreaker,
  MODELS,
  callLlm,
  circuitBreaker,
  extractText,
  getNextModelOrder,
  parseJsonSafely,
  resetModelRotation,
} from '../src/llm/router.js';
import { getAllLogs, resetTelemetryForTests } from '../src/telemetry/logging.js';
import { RedMetricsRegistry } from '../src/telemetry/metrics.js';

const TEST_ENV = { GEMINI_API_KEY: 'gemini-test-key' } as const;

function testConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
  return loadConfig({ ...TEST_ENV, ...overrides });
}

function unusedInvoker(): GeminiInvoker {
  return async () => {
    throw new Error('invoker should not be called');
  };
}

beforeEach(() => {
  resetTelemetryForTests();
  resetModelRotation();
  circuitBreaker.reset();
});

describe('getNextModelOrder', () => {
  it('rotates round-robin across the verified pool', () => {
    const breaker = new ModelCircuitBreaker();

    assert.deepEqual(getNextModelOrder(undefined, breaker), [...ROTATING_MODELS]);
    assert.deepEqual(getNextModelOrder(undefined, breaker), [
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.7-flash',
      'gemini-2.5-flash-lite',
    ]);
    assert.deepEqual(MODELS, ROTATING_MODELS);
  });

  it('honours a provider override without advancing the rotation cursor', () => {
    const breaker = new ModelCircuitBreaker();
    const override = 'gemini-3.5-flash';

    const order = getNextModelOrder(override, breaker);
    assert.equal(order[0], override);
    assert.deepEqual(
      order.slice(1),
      ROTATING_MODELS.filter((model) => model !== override),
    );

    // Python does not advance `_model_index` for overrides.
    assert.deepEqual(getNextModelOrder(undefined, breaker), [...ROTATING_MODELS]);
  });

  it('prioritises healthy circuits and falls back to tripped models last', () => {
    const breaker = new ModelCircuitBreaker();
    const tripped = ROTATING_MODELS[0];

    breaker.recordFailure(tripped, true);
    const order = getNextModelOrder(undefined, breaker);

    assert.equal(order.at(-1), tripped);
    assert.equal(order.length, ROTATING_MODELS.length);
  });

  it('returns the full pool when every circuit is open', () => {
    const breaker = new ModelCircuitBreaker();
    for (const model of ROTATING_MODELS) {
      breaker.recordFailure(model, true);
    }

    assert.deepEqual(getNextModelOrder(undefined, breaker), [...ROTATING_MODELS]);
  });
});

describe('ModelCircuitBreaker', () => {
  it('opens after consecutive failures and probes HALF_OPEN after the cooldown', () => {
    let now = 1000;
    const breaker = new ModelCircuitBreaker({ now: () => now });
    const model = 'gemini-2.5-flash-lite';

    breaker.recordFailure(model);
    breaker.recordFailure(model);
    assert.equal(breaker.getCircuitState(model), CircuitState.CLOSED);

    breaker.recordFailure(model);
    assert.equal(breaker.getCircuitState(model), CircuitState.OPEN);
    assert.equal(breaker.canAttempt(model), false);

    now += 59.9;
    assert.equal(breaker.canAttempt(model), false);

    now = 1060;
    assert.equal(breaker.canAttempt(model), true);
    assert.equal(breaker.getCircuitState(model), CircuitState.HALF_OPEN);

    breaker.recordSuccess(model);
    assert.equal(breaker.getCircuitState(model), CircuitState.CLOSED);
    assert.equal(breaker.getLastSuccessTime(model), now);
  });

  it('trips immediately on a rate limit and resets all state', () => {
    const breaker = new ModelCircuitBreaker();
    const model = 'gemini-3.7-flash';

    breaker.recordFailure(model, true);
    assert.equal(breaker.getCircuitState(model), CircuitState.OPEN);
    assert.equal(breaker.canAttempt(model), false);

    breaker.reset();
    assert.equal(breaker.getCircuitState(model), CircuitState.CLOSED);
    assert.equal(breaker.canAttempt(model), true);
  });
});

describe('extractText', () => {
  it('handles every LangChain content shape Python handles', () => {
    assert.equal(extractText('plain'), 'plain');
    assert.equal(extractText([{ type: 'text', text: 'a' }, { text: 'b' }]), 'ab');
    assert.equal(extractText([{ content: 'c' }, 'd']), 'cd');
    assert.equal(extractText([{ text: 'e' }]), 'e');
    assert.equal(extractText({ content: 'f' }), 'f');
    assert.equal(extractText({ text: 'g' }), 'g');

    class Block {
      text = 'i';
    }
    assert.equal(extractText([new Block()]), 'i');

    assert.equal(extractText([]), '[]');
    assert.equal(extractText(42), '42');
  });
});

describe('parseJsonSafely', () => {
  it('parses plain and fenced JSON', () => {
    assert.deepEqual(parseJsonSafely('{"a": 1}'), { a: 1 });
    assert.deepEqual(parseJsonSafely('```json\n{"a": 1}\n```'), { a: 1 });
    assert.deepEqual(parseJsonSafely('```\n{"a": 1}\n```'), { a: 1 });
    assert.deepEqual(parseJsonSafely('  {"a": 1}  '), { a: 1 });
  });

  it('strips trailing commas before closing braces and brackets', () => {
    assert.deepEqual(parseJsonSafely('{"a": 1, "b": [1, 2,],}'), { a: 1, b: [1, 2] });
  });

  it('rejects non-JSON without falling back to literal evaluation', () => {
    assert.throws(
      () => parseJsonSafely("{'a': 1}"),
      /Failed to parse text as valid JSON \(ast\.literal_eval disabled for security\)/,
    );
    assert.throws(() => parseJsonSafely('not json'), /Failed to parse text as valid JSON/);
  });
});

describe('callLlm', () => {
  it('returns text, provider and latency while recording accounting telemetry', async () => {
    const metrics = new RedMetricsRegistry();
    const breaker = new ModelCircuitBreaker();
    const requests: GeminiRequest[] = [];
    const invoker: GeminiInvoker = async (request) => {
      requests.push(request);
      return {
        content: 'generated answer',
        usage_metadata: { input_tokens: 200, output_tokens: 100 },
      };
    };

    const result = await callLlm('a prompt', {
      config: testConfig(),
      circuitBreaker: breaker,
      metrics,
      invoker,
      systemInstruction: 'system',
      jsonMode: true,
    });

    assert.equal(result.text, 'generated answer');
    assert.equal(result.provider, 'gemini');
    assert.ok(result.latencyMs >= 0);

    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.model, ROTATING_MODELS[0]);
    assert.equal(requests[0]?.systemInstruction, 'system');
    assert.equal(requests[0]?.jsonMode, true);
    assert.equal(requests[0]?.apiKey, 'gemini-test-key');

    const accounting = metrics.getSummary().token_accounting;
    assert.equal(accounting.tokens_in_total, 200);
    assert.equal(accounting.tokens_out_total, 100);
    assert.ok(Math.abs(accounting.cost_usd_total - 0.000045) < 1e-9);

    const [event] = getAllLogs();
    assert.ok(event);
    assert.equal(event.intent, 'llm_call_completed');
    assert.equal(event.model, ROTATING_MODELS[0]);
    assert.equal(event.tokens_in, 200);
    assert.equal(event.tokens_out, 100);
    assert.equal(event.status, 'success');
    assert.equal(event.circuit_state, CircuitState.CLOSED);
    assert.equal(event.cost_usd, 0.000045);
    assert.equal(event.provider, 'gemini');
  });

  it('falls back through the rotation and trips the failing circuit', async () => {
    const breaker = new ModelCircuitBreaker();
    const calls: GeminiRequest[] = [];
    const invoker: GeminiInvoker = async (request) => {
      calls.push(request);
      if (calls.length === 1) {
        throw new Error('429 Resource exhausted');
      }
      return { content: 'second model' };
    };

    const result = await callLlm('fallback', {
      config: testConfig(),
      circuitBreaker: breaker,
      invoker,
    });

    assert.equal(result.text, 'second model');
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.model, ROTATING_MODELS[0]);
    assert.equal(calls[1]?.model, ROTATING_MODELS[1]);
    assert.equal(breaker.getCircuitState(ROTATING_MODELS[0]), CircuitState.OPEN);
    assert.equal(breaker.getCircuitState(ROTATING_MODELS[1]), CircuitState.CLOSED);
  });

  it('throws AllProvidersFailedError with every failure in the details', async () => {
    const invoker: GeminiInvoker = async () => {
      throw new Error('boom');
    };

    await assert.rejects(
      callLlm('fails', {
        config: testConfig(),
        circuitBreaker: new ModelCircuitBreaker(),
        invoker,
      }),
      (error: unknown) => {
        assert.ok(error instanceof AllProvidersFailedError);
        assert.equal(error.name, 'AllProvidersFailedError');
        assert.match(error.message, /^All Gemini models in pool failed\. Details: /);
        for (const model of ROTATING_MODELS) {
          assert.match(error.message, new RegExp(`${model}: boom`));
        }
        return true;
      },
    );
  });

  it('short-circuits when the kill switch is active', async () => {
    await assert.rejects(
      callLlm('blocked', {
        config: testConfig({ LLM_KILL_SWITCH: 'true' }),
        invoker: unusedInvoker(),
      }),
      (error: unknown) => {
        assert.ok(error instanceof AllProvidersFailedError);
        assert.equal(
          error.message,
          'LLM kill-switch is active: AI model calls disabled. Gracefully degrading to rule-based evaluation.',
        );
        return true;
      },
    );
  });

  it('requires a real Gemini API key', async () => {
    await assert.rejects(
      callLlm('no key', { config: loadConfig({}), invoker: unusedInvoker() }),
      /No valid GEMINI_API_KEY is configured in backend\/\.env\./,
    );
    await assert.rejects(
      callLlm('placeholder', {
        config: loadConfig({ GEMINI_API_KEY: 'your_gemini_api_key' }),
        invoker: unusedInvoker(),
      }),
      /No valid GEMINI_API_KEY/,
    );
  });

  it('refuses unverified data-use modes in production', async () => {
    const production = loadConfig({
      ENVIRONMENT: 'production',
      GEMINI_API_KEY: 'key',
      TAVILY_API_KEY: 'tavily',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      LLM_DATA_USE_MODE: 'zero_retention_verified',
    });
    const unsafe: AppConfig = {
      ...production,
      llm: { ...production.llm, dataUseMode: 'unverified' },
    };

    await assert.rejects(
      callLlm('gated', { config: unsafe, invoker: unusedInvoker() }),
      /FATAL SECURITY VIOLATION \(AI-SEC-1\)/,
    );
  });
});
