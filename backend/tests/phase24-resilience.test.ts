import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import express from 'express';
import request from 'supertest';

import { loadConfig, type AppConfig } from '../src/config/index.js';
import { withTransaction } from '../src/db/client.js';
import { userSafeLlmFailure, LLM_UNAVAILABLE_MESSAGE } from '../src/llm/errors.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { createTracingMiddleware } from '../src/middleware/tracing.js';
import { RedisStore, setSharedRedisStoreForTests, type RedisClient } from '../src/redis/client.js';
import { probeRedisHealth, resetRedisHealthForTests } from '../src/redis/health.js';
import type { WorkspaceQueryStore } from '../src/db/workspace-query-store.js';
import { createReadinessRouter } from '../src/routes/health.js';
import {
  CircuitBreaker,
  CircuitOpenError,
  CircuitState,
  RedisCircuitBreaker,
} from '../src/resilience/breaker.js';
import {
  DEPENDENCY_BREAKER_DEFAULTS,
  isRateLimitError,
  isTransientDatabaseError,
  isTransientDependencyError,
  recordDependencyProbe,
  resetDependencyBreakersForTests,
  runWithBreaker,
} from '../src/resilience/dependencies.js';
import { metricsRegistry } from '../src/telemetry/metrics.js';
import {
  currentTraceparent,
  formatTraceparent,
  getActiveTraceContext,
  parseTraceparent,
  runWithTraceparent,
  startSpan,
  traceStoreMethods,
  withSpan,
} from '../src/telemetry/tracing.js';

afterEach(() => {
  resetDependencyBreakersForTests();
  resetRedisHealthForTests();
});

function testConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
  return loadConfig({
    USE_LOCAL_AUTH: 'true',
    GEMINI_API_KEY: '',
    GOOGLE_API_KEY: '',
    ...overrides,
  });
}

function clockedBreaker(
  name: string,
  options: { failureThreshold?: number; cooldownSeconds?: number; clock?: { now: number } } = {},
) {
  const clock = options.clock ?? { now: 1_000 };
  return {
    clock,
    breaker: new CircuitBreaker({
      name,
      keys: ['op'],
      failureThreshold: options.failureThreshold ?? 3,
      cooldownSeconds: options.cooldownSeconds ?? 60,
      now: () => clock.now,
    }),
  };
}

describe('generic circuit breaker', () => {
  it('opens after the failure threshold and blocks until the cooldown', async () => {
    const { clock, breaker } = clockedBreaker('test-generic-open');

    assert.equal(await breaker.canAttemptAsync('op'), true);
    await breaker.recordFailureAsync('op');
    await breaker.recordFailureAsync('op');
    assert.equal(await breaker.getCircuitStateAsync('op'), CircuitState.CLOSED);

    await breaker.recordFailureAsync('op');
    assert.equal(await breaker.getCircuitStateAsync('op'), CircuitState.OPEN);
    assert.equal(await breaker.canAttemptAsync('op'), false);

    clock.now += 59;
    assert.equal(await breaker.canAttemptAsync('op'), false);
    clock.now += 2;
    assert.equal(await breaker.canAttemptAsync('op'), true);
    assert.equal(await breaker.getCircuitStateAsync('op'), CircuitState.HALF_OPEN);

    await breaker.recordSuccessAsync('op');
    assert.equal(await breaker.getCircuitStateAsync('op'), CircuitState.CLOSED);
    assert.equal(await breaker.canAttemptAsync('op'), true);
  });

  it('trips immediately on a rate limit', async () => {
    const { breaker } = clockedBreaker('test-generic-rate-limit');
    await breaker.recordFailureAsync('op', true);
    assert.equal(await breaker.getCircuitStateAsync('op'), CircuitState.OPEN);
  });

  it('exposes transition state on the Prometheus gauge', async () => {
    const name = 'test-generic-gauge';
    const breaker = new CircuitBreaker({ name, keys: ['op'], failureThreshold: 1 });
    await breaker.recordFailureAsync('op');

    const text = await metricsRegistry.toPrometheusFormat();
    assert.match(
      text,
      new RegExp(`recruitai_dependency_circuit_state\\{dependency="${name}"\\} 2`),
    );
    assert.match(
      text,
      new RegExp(
        `recruitai_dependency_circuit_trips_total\\{dependency="${name}",reason="failure_threshold"\\} 1`,
      ),
    );
  });

  it('shares state through Redis and namespaces per dependency', async () => {
    const clock = { now: 1_000 };
    const { fake, store } = fakeRedis(clock);
    const first = new RedisCircuitBreaker({
      store,
      name: 'test-redis',
      keys: ['op'],
      failureThreshold: 2,
      cooldownSeconds: 30,
      now: () => clock.now,
    });
    const replica = new RedisCircuitBreaker({
      store,
      name: 'test-redis',
      keys: ['op'],
      failureThreshold: 2,
      cooldownSeconds: 30,
      now: () => clock.now,
    });

    await first.recordFailureAsync('op');
    await first.recordFailureAsync('op');
    assert.equal(await replica.getCircuitStateAsync('op'), CircuitState.OPEN);
    assert.equal(await replica.canAttemptAsync('op'), false);
    assert.ok(fake.data.has('recruitai:breaker:test-redis:op:state'));

    clock.now += 31;
    assert.equal(await replica.canAttemptAsync('op'), true);
    assert.equal(await replica.getCircuitStateAsync('op'), CircuitState.HALF_OPEN);
    await replica.recordSuccessAsync('op');
    assert.equal(await first.getCircuitStateAsync('op'), CircuitState.CLOSED);
  });

  it('falls back to local state when Redis is unreachable', async () => {
    const store = new RedisStore({
      url: 'redis://unused',
      client: {
        get: async () => {
          throw new Error('redis down');
        },
        set: async () => {
          throw new Error('redis down');
        },
        del: async () => {
          throw new Error('redis down');
        },
        exists: async () => 0,
        incr: async () => 0,
        expire: async () => 0,
        pexpire: async () => 0,
        pttl: async () => -2,
        eval: async () => {
          throw new Error('redis down');
        },
        ping: async () => 'PONG',
        quit: async () => 'OK',
        on: () => {},
      } satisfies RedisClient,
    });
    const breaker = new RedisCircuitBreaker({
      store,
      name: 'test-redis-fallback',
      keys: ['op'],
      failureThreshold: 1,
    });
    await breaker.recordFailureAsync('op');
    assert.equal(await breaker.getCircuitStateAsync('op'), CircuitState.OPEN);
    assert.equal(await breaker.canAttemptAsync('op'), false);
  });
});

describe('dependency classifiers and breaker wiring', () => {
  it('classifies connectivity, database and rate-limit failures', () => {
    const refused = Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' });
    assert.equal(isTransientDependencyError(refused), true);
    assert.equal(isTransientDatabaseError(refused), true);
    assert.equal(isTransientDependencyError(new Error('invalid input')), false);

    const shutdown = Object.assign(new Error('database shutting down'), { code: '57P03' });
    assert.equal(isTransientDatabaseError(shutdown), true);
    assert.equal(isTransientDependencyError(shutdown), false);

    assert.equal(isRateLimitError(new Error('HTTP 429 Too Many Requests')), true);
    assert.equal(isRateLimitError(new Error('RESOURCE_EXHAUSTED')), true);
    assert.equal(isRateLimitError(new Error('bad request')), false);
  });

  it('opens a dependency circuit after transient failures', async () => {
    const config = testConfig();
    const operation = async () => {
      throw Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
    };

    for (
      let attempt = 0;
      attempt < DEPENDENCY_BREAKER_DEFAULTS.tavily.failureThreshold;
      attempt += 1
    ) {
      await assert.rejects(
        runWithBreaker({ config, dependency: 'tavily', key: 'search' }, operation),
        /timed out/,
      );
    }

    await assert.rejects(
      runWithBreaker({ config, dependency: 'tavily', key: 'search' }, operation),
      (error: unknown) =>
        error instanceof CircuitOpenError &&
        error.dependency === 'tavily' &&
        error.key === 'search',
    );
  });

  it('does not trip on non-transient errors and honours the disable switch', async () => {
    const config = testConfig();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await assert.rejects(
        runWithBreaker({ config, dependency: 'smtp' }, async () => {
          throw new Error('invalid address');
        }),
        /invalid address/,
      );
    }
    let calls = 0;
    await runWithBreaker({ config, dependency: 'smtp' }, async () => {
      calls += 1;
      return 'ok';
    });
    assert.equal(calls, 1);

    const disabled = testConfig({ RESILIENCE_BREAKERS_ENABLED: 'false' });
    await assert.rejects(
      runWithBreaker({ config: disabled, dependency: 'smtp' }, async () => {
        throw Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
      }),
      /timed out/,
    );
    // Breaker disabled means every attempt reaches the dependency.
    let disabledCalls = 0;
    await runWithBreaker({ config: disabled, dependency: 'smtp' }, async () => {
      disabledCalls += 1;
      return 'ok';
    });
    assert.equal(disabledCalls, 1);
  });

  it('records readiness probes into the same breaker state', async () => {
    const config = testConfig();
    for (
      let attempt = 0;
      attempt < DEPENDENCY_BREAKER_DEFAULTS.redis.failureThreshold;
      attempt += 1
    ) {
      await recordDependencyProbe('redis', config, false, new Error('connection refused'));
    }
    await assert.rejects(
      runWithBreaker({ config, dependency: 'redis', key: 'default' }, async () => 'unused'),
      CircuitOpenError,
    );
  });
});

describe('Redis health and degraded mode', () => {
  it('reports an unconfigured Redis as healthy local mode', async () => {
    const result = await probeRedisHealth(testConfig(), null);
    assert.deepEqual(
      { configured: result.configured, healthy: result.healthy },
      { configured: false, healthy: true },
    );
  });

  it('keeps readiness serving as degraded only when degraded mode is enabled', async () => {
    setSharedRedisStoreForTests(null);
    const config = (degraded: boolean) =>
      testConfig({
        REDIS_URL: 'redis://cache:6379',
        REDIS_DEGRADED_MODE_ENABLED: degraded ? 'true' : 'false',
      });
    const auth = (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
      next();
    const appFor = (degraded: boolean) => {
      const app = express();
      app.use(
        createReadinessRouter({
          config: config(degraded),
          queryStore: { kind: 'postgresql', ping: async () => {} } as WorkspaceQueryStore,
          auth,
        }),
      );
      return app;
    };

    resetRedisHealthForTests();
    const degraded = await request(appFor(true)).get('/health/ready').expect(200);
    assert.equal(degraded.body.status, 'degraded');

    resetRedisHealthForTests();
    await request(appFor(false)).get('/health/ready').expect(503);

    resetRedisHealthForTests();
  });

  it('caches probe results and reports an unreachable Redis', async () => {
    const config = testConfig({ REDIS_URL: 'redis://cache:6379' });
    let pings = 0;
    const store = {
      ping: async () => {
        pings += 1;
        return false;
      },
    } as unknown as RedisStore;

    const first = await probeRedisHealth(config, store);
    const second = await probeRedisHealth(config, store);
    assert.equal(first.configured, true);
    assert.equal(first.healthy, false);
    assert.equal(second.checkedAt, first.checkedAt);
    assert.equal(pings, 1);
  });
});

describe('W3C trace context', () => {
  const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
  const spanId = '00f067aa0ba902b7';

  it('parses and formats traceparent, rejecting invalid headers', () => {
    const parsed = parseTraceparent(`00-${traceId}-${spanId}-01`);
    assert.deepEqual(parsed, { traceId, spanId, traceFlags: 1 });
    assert.equal(formatTraceparent(parsed!), `00-${traceId}-${spanId}-01`);

    assert.equal(parseTraceparent(''), null);
    assert.equal(parseTraceparent('00-not-a-trace-01'), null);
    assert.equal(parseTraceparent(`ff-${traceId}-${spanId}-01`), null);
    assert.equal(parseTraceparent(`00-${'0'.repeat(32)}-${spanId}-01`), null);
  });

  it('keeps nested spans in one trace and propagates the active context', async () => {
    const parent = startSpan(
      'parent',
      {},
      { parent: parseTraceparent(`00-${traceId}-${spanId}-01`) },
    );
    const seen = await runWithTraceparent(parent.traceparent(), () =>
      withSpan('child', async () => {
        const active = getActiveTraceContext();
        assert.equal(active?.traceId, traceId);
        assert.match(currentTraceparent() ?? '', new RegExp(`^00-${traceId}-[0-9a-f]{16}-01$`));
        return active?.spanId;
      }),
    );
    assert.ok(seen);
    assert.notEqual(seen, parent.spanId);
    parent.finish();
  });

  it('resumes a remote trace for async jobs', async () => {
    const value = runWithTraceparent(`00-${traceId}-${spanId}-01`, () => {
      assert.equal(getActiveTraceContext()?.traceId, traceId);
      return withSpan('agent.node', () => getActiveTraceContext()?.spanId);
    });
    assert.ok(value);
  });

  it('drops PII-bearing span attributes', async () => {
    const span = startSpan('safe', {
      'http.method': 'POST',
      prompt: 'secret prompt',
      'candidate.email': 'a@example.com',
      job_description: 'do not record',
    });
    span.setAttribute('resume', 'raw text');
    span.addEvent('call', { message: 'hello', 'llm.model': 'gemini' });
    assert.deepEqual({ ...span.attributes }, { 'http.method': 'POST' });
    assert.deepEqual({ ...span.events[0]?.attributes }, { 'llm.model': 'gemini' });
  });

  it('wraps store methods in spans without changing their result', async () => {
    const store = traceStoreMethods('db.test', {
      async ping(): Promise<string> {
        return 'pong';
      },
    });
    assert.equal(await store.ping(), 'pong');
  });
});

describe('HTTP tracing and degraded error mapping', () => {
  it('adopts inbound traceparent and echoes a child traceparent', async () => {
    const app = express();
    app.use(createTracingMiddleware());
    app.get('/ok', (_req, res) => {
      res.json({ ok: true });
    });

    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const spanId = '00f067aa0ba902b7';
    const response = await request(app)
      .get('/ok')
      .set('traceparent', `00-${traceId}-${spanId}-01`)
      .expect(200);

    const header = String(response.headers.traceparent);
    const parsed = parseTraceparent(header);
    assert.equal(parsed?.traceId, traceId);
    assert.notEqual(parsed?.spanId, spanId);
    assert.equal(parsed?.traceFlags, 1);
  });

  it('maps an open circuit or a dead database to 503', async () => {
    const app = express();
    app.get('/circuit', () => {
      throw new CircuitOpenError('postgres', 'transaction');
    });
    app.get('/db', () => {
      throw Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' });
    });
    app.use(errorHandler);

    const circuit = await request(app).get('/circuit').expect(503);
    assert.equal(
      circuit.body.detail,
      'A required service is temporarily unavailable. Please retry shortly.',
    );
    assert.equal(circuit.headers['retry-after'], '5');

    const database = await request(app).get('/db').expect(503);
    assert.equal(database.body.detail, circuit.body.detail);
  });
});

describe('user-safe LLM errors', () => {
  it('replaces typed LLM outages but preserves generic messages', () => {
    const outage = new Error('every model failed with key=secret');
    outage.name = 'AllProvidersFailedError';
    assert.equal(userSafeLlmFailure(outage, 'fallback'), LLM_UNAVAILABLE_MESSAGE);

    const circuit = new CircuitOpenError('gemini', 'model');
    assert.equal(userSafeLlmFailure(circuit, 'fallback'), LLM_UNAVAILABLE_MESSAGE);
    assert.equal(userSafeLlmFailure(new Error('validation failed'), 'fallback'), 'fallback');
  });
});

describe('withTransaction degradation', () => {
  it('maps an open Postgres circuit to CircuitOpenError without querying', async () => {
    const config = testConfig();
    for (
      let attempt = 0;
      attempt < DEPENDENCY_BREAKER_DEFAULTS.postgres.failureThreshold;
      attempt += 1
    ) {
      await recordDependencyProbe('postgres', config, false, new Error('connection refused'));
    }
    let queried = false;
    await assert.rejects(
      withTransaction(async () => {
        queried = true;
      }, config),
      CircuitOpenError,
    );
    assert.equal(queried, false);
  });
});

interface StoredValue {
  value: string;
  expiresAt: number | null;
}

/** Minimal Redis double supporting the breaker script and TTLs. */
function fakeRedis(clock: { now: number }): {
  fake: RedisClient & { data: Map<string, StoredValue> };
  store: RedisStore;
} {
  const data = new Map<string, StoredValue>();

  const live = (key: string): StoredValue | undefined => {
    const entry = data.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt !== null && entry.expiresAt <= clock.now) {
      data.delete(key);
      return undefined;
    }
    return entry;
  };

  const fake: RedisClient & { data: Map<string, StoredValue> } = {
    data,
    get: async (key) => live(key)?.value ?? null,
    set: async (key, value, ...options) => {
      const upper = options.map((option) =>
        typeof option === 'string' ? option.toUpperCase() : option,
      );
      const exIndex = upper.indexOf('EX');
      data.set(key, {
        value,
        expiresAt: exIndex >= 0 ? clock.now + Number(options[exIndex + 1]) * 1000 : null,
      });
      return 'OK';
    },
    del: async (...keys) => {
      let removed = 0;
      for (const key of keys) {
        if (data.delete(key)) {
          removed += 1;
        }
      }
      return removed;
    },
    exists: async (key) => (live(key) ? 1 : 0),
    incr: async (key) => {
      const current = Number(live(key)?.value ?? '0') + 1;
      data.set(key, { value: String(current), expiresAt: null });
      return current;
    },
    expire: async (key, seconds) => {
      const entry = live(key);
      if (!entry) {
        return 0;
      }
      entry.expiresAt = clock.now + seconds * 1000;
      return 1;
    },
    pexpire: async (key, milliseconds) => {
      const entry = live(key);
      if (!entry) {
        return 0;
      }
      entry.expiresAt = clock.now + milliseconds;
      return 1;
    },
    pttl: async (key) => {
      const entry = live(key);
      if (!entry) {
        return -2;
      }
      return entry.expiresAt === null ? -1 : Math.max(0, entry.expiresAt - clock.now);
    },
    eval: async (script, keys, args) => {
      if (!script.includes("redis.call('INCR', KEYS[1])")) {
        throw new Error(`Unexpected script: ${script.slice(0, 30)}`);
      }
      const [failuresKey, lastFailureKey, stateKey] = keys;
      const [ttl, now, rateLimit, threshold] = args;
      if (!failuresKey || !lastFailureKey || !stateKey) {
        return [0, 0];
      }
      const count = await fake.incr(failuresKey);
      await fake.expire(failuresKey, Number(ttl));
      await fake.set(lastFailureKey, String(now));
      await fake.expire(lastFailureKey, Number(ttl));
      const shouldTrip = Number(rateLimit) === 1 || count >= Number(threshold);
      if (!shouldTrip) {
        return [count, 0];
      }
      const wasOpen = (await fake.get(stateKey)) === 'OPEN';
      await fake.set(stateKey, 'OPEN');
      await fake.expire(stateKey, Number(ttl));
      return [count, wasOpen ? 0 : 1];
    },
    ping: async () => 'PONG',
    quit: async () => 'OK',
    on: () => {},
  };

  return { fake, store: new RedisStore({ url: 'redis://unused', client: fake }) };
}
