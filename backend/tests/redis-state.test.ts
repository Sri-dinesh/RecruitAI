import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { InMemoryTtlCache, RedisTtlCache, ResilientTtlCache } from '../src/cache/ttl-cache.js';
import { ModelCircuitBreaker, RedisModelCircuitBreaker, CircuitState } from '../src/llm/router.js';
import { RedisStore, type RedisClient } from '../src/redis/client.js';
import { RedisResetThrottle } from '../src/services/reset-throttle.js';

interface StoredValue {
  value: string;
  expiresAt: number | null;
}

/** Small in-process Redis double with the commands Phase 21 uses. */
class FakeRedisClient implements RedisClient {
  readonly data = new Map<string, StoredValue>();
  constructor(private readonly clock: { now: number }) {}

  private live(key: string): StoredValue | undefined {
    const value = this.data.get(key);
    if (!value) {
      return undefined;
    }
    if (value.expiresAt !== null && value.expiresAt <= this.clock.now) {
      this.data.delete(key);
      return undefined;
    }
    return value;
  }

  async get(key: string): Promise<string | null> {
    return this.live(key)?.value ?? null;
  }

  async set(key: string, value: string, ...options: Array<string | number>): Promise<'OK' | null> {
    const upper = options.map((option) =>
      typeof option === 'string' ? option.toUpperCase() : option,
    );
    const nx = upper.includes('NX');
    if (nx && this.live(key)) {
      return null;
    }
    let expiresAt: number | null = null;
    const exIndex = upper.indexOf('EX');
    const pxIndex = upper.indexOf('PX');
    if (exIndex >= 0) {
      const seconds = Number(options[exIndex + 1]);
      expiresAt = this.clock.now + seconds * 1000;
    } else if (pxIndex >= 0) {
      const milliseconds = Number(options[pxIndex + 1]);
      expiresAt = this.clock.now + milliseconds;
    }
    this.data.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) {
      if (this.data.delete(key)) {
        removed += 1;
      }
    }
    return removed;
  }

  async exists(key: string): Promise<number> {
    return this.live(key) ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const current = Number(this.live(key)?.value ?? '0') + 1;
    const previous = this.live(key);
    this.data.set(key, { value: String(current), expiresAt: previous?.expiresAt ?? null });
    return current;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const value = this.live(key);
    if (!value) {
      return 0;
    }
    value.expiresAt = this.clock.now + seconds * 1000;
    return 1;
  }

  async pexpire(key: string, milliseconds: number): Promise<number> {
    const value = this.live(key);
    if (!value) {
      return 0;
    }
    value.expiresAt = this.clock.now + milliseconds;
    return 1;
  }

  async pttl(key: string): Promise<number> {
    const value = this.live(key);
    if (!value) {
      return -2;
    }
    return value.expiresAt === null ? -1 : Math.max(0, value.expiresAt - this.clock.now);
  }

  async eval(
    script: string,
    keys: readonly string[],
    args: readonly (string | number)[],
  ): Promise<unknown> {
    if (script.includes("redis.call('GET', KEYS[1]) == ARGV[1]")) {
      const key = keys[0] ?? '';
      if ((await this.get(key)) === String(args[0] ?? '')) {
        await this.del(key);
        return 1;
      }
      return 0;
    }
    if (script.includes("redis.call('INCR', KEYS[1])")) {
      const [failuresKey, lastFailureKey, stateKey] = keys;
      const [failureTtl, now, rateLimit, threshold] = args;
      if (!failuresKey || !lastFailureKey || !stateKey) {
        return [0, 0];
      }
      const count = await this.incr(failuresKey);
      await this.expire(failuresKey, Number(failureTtl));
      await this.set(lastFailureKey, String(now));
      await this.expire(lastFailureKey, Number(failureTtl));
      const shouldTrip = Number(rateLimit) === 1 || count >= Number(threshold);
      if (!shouldTrip) {
        return [count, 0];
      }
      const wasOpen = (await this.get(stateKey)) === 'OPEN';
      await this.set(stateKey, 'OPEN');
      await this.expire(stateKey, Number(failureTtl));
      return [count, wasOpen ? 0 : 1];
    }
    throw new Error(`Unexpected script: ${script.slice(0, 40)}`);
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  async quit(): Promise<unknown> {
    return 'OK';
  }

  on(): void {
    // no-op
  }
}

function storeWithFake(clock: { now: number }): { store: RedisStore; fake: FakeRedisClient } {
  const fake = new FakeRedisClient(clock);
  return { store: new RedisStore({ url: 'redis://unused', client: fake }), fake };
}

describe('RedisStore', () => {
  it('namespaces keys and round-trips JSON', async () => {
    const clock = { now: 1_000 };
    const { store } = storeWithFake(clock);
    assert.equal(store.key('cache', 'tavily', 1), 'recruitai:cache:tavily:1');

    await store.setJson('recruitai:test', { value: 1 }, 10);
    assert.deepEqual(await store.getJson('recruitai:test'), { value: 1 });
    clock.now += 10_001;
    assert.equal(await store.getJson('recruitai:test'), undefined);
  });

  it('deletes malformed JSON instead of throwing', async () => {
    const clock = { now: 1_000 };
    const { store, fake } = storeWithFake(clock);
    fake.data.set('recruitai:bad', { value: '{not-json', expiresAt: null });
    assert.equal(await store.getJson('recruitai:bad'), undefined);
    assert.equal(fake.data.has('recruitai:bad'), false);
  });

  it('claims TTL slots and reports the remaining window', async () => {
    const clock = { now: 1_000 };
    const { store } = storeWithFake(clock);
    assert.equal(await store.claimTtl('recruitai:rl:reset:user', 30_000), 0);
    clock.now += 5_000;
    assert.equal(await store.claimTtl('recruitai:rl:reset:user', 30_000), 25_000);
  });

  it('acquires and releases a lock only for the owner', async () => {
    const clock = { now: 1_000 };
    const { store } = storeWithFake(clock);
    const token = await store.acquireLock('recruitai:lock:retention', 60_000);
    assert.ok(token);
    assert.equal(await store.acquireLock('recruitai:lock:retention', 60_000), null);
    assert.equal(await store.releaseLock('recruitai:lock:retention', 'wrong'), false);
    assert.equal(await store.releaseLock('recruitai:lock:retention', token ?? ''), true);
  });
});

describe('TTL caches', () => {
  it('expires in-memory entries and bounds growth', async () => {
    let now = 0;
    const cache = new InMemoryTtlCache({ maxEntries: 2, now: () => now });
    await cache.set('a', { value: 1 }, 1);
    assert.deepEqual(await cache.get('a'), { value: 1 });
    now = 1_001;
    assert.equal(await cache.get('a'), undefined);

    await cache.set('b', 1, 10);
    await cache.set('c', 2, 10);
    await cache.set('d', 3, 10);
    assert.equal(await cache.get('b'), undefined);
  });

  it('uses Redis JSON values and TTLs', async () => {
    const clock = { now: 1_000 };
    const { store } = storeWithFake(clock);
    const cache = new RedisTtlCache({ store, namespace: 'tavily' });
    await cache.set('salary:engineer', { kind: 'salary', value: 1 }, 2);
    assert.deepEqual(await cache.get('salary:engineer'), { kind: 'salary', value: 1 });
    clock.now += 2_001;
    assert.equal(await cache.get('salary:engineer'), undefined);
  });

  it('falls back locally when Redis operations fail', async () => {
    const broken = {
      get: async () => {
        throw new Error('down');
      },
      set: async () => {
        throw new Error('down');
      },
      delete: async () => {
        throw new Error('down');
      },
      clear: async () => {
        throw new Error('down');
      },
    };
    const cache = new ResilientTtlCache(broken, new InMemoryTtlCache());
    await cache.set('k', { value: 1 });
    assert.deepEqual(await cache.get('k'), { value: 1 });
  });
});

describe('fleet-wide circuit breaker', () => {
  it('trips and recovers across instances through Redis', async () => {
    const clock = { now: 1_000_000 };
    const { store } = storeWithFake(clock);
    const breaker = new RedisModelCircuitBreaker({
      store,
      models: ['gemini-a'],
      failureThreshold: 3,
      cooldownSeconds: 60,
      now: () => clock.now / 1000,
    });

    assert.equal(await breaker.canAttemptAsync('gemini-a'), true);
    await breaker.recordFailureAsync('gemini-a');
    await breaker.recordFailureAsync('gemini-a');
    assert.equal(await breaker.getCircuitStateAsync('gemini-a'), CircuitState.CLOSED);
    await breaker.recordFailureAsync('gemini-a');
    assert.equal(await breaker.getCircuitStateAsync('gemini-a'), CircuitState.OPEN);
    assert.equal(await breaker.canAttemptAsync('gemini-a'), false);

    // A second instance sees the same OPEN state.
    const other = new RedisModelCircuitBreaker({
      store,
      models: ['gemini-a'],
      failureThreshold: 3,
      cooldownSeconds: 60,
      now: () => clock.now / 1000,
    });
    assert.equal(await other.canAttemptAsync('gemini-a'), false);

    clock.now += 60_001;
    assert.equal(await other.canAttemptAsync('gemini-a'), true);
    assert.equal(await other.getCircuitStateAsync('gemini-a'), CircuitState.HALF_OPEN);
    await other.recordSuccessAsync('gemini-a');
    assert.equal(await breaker.getCircuitStateAsync('gemini-a'), CircuitState.CLOSED);
  });

  it('keeps the local breaker working when Redis is unavailable', async () => {
    const broken = {
      key: (...parts: Array<string | number>) => parts.join(':'),
      getString: async () => {
        throw new Error('down');
      },
      setString: async () => {
        throw new Error('down');
      },
      delete: async () => {
        throw new Error('down');
      },
      evalScript: async () => {
        throw new Error('down');
      },
    } as unknown as RedisStore;
    const breaker = new RedisModelCircuitBreaker({
      store: broken,
      models: ['gemini-a'],
      failureThreshold: 2,
    });
    await breaker.recordFailureAsync('gemini-a');
    await breaker.recordFailureAsync('gemini-a');
    assert.equal(await breaker.getCircuitStateAsync('gemini-a'), CircuitState.OPEN);
  });

  it('keeps the process-local breaker synchronous for existing callers', () => {
    const breaker = new ModelCircuitBreaker({ models: ['m'], failureThreshold: 1 });
    breaker.recordFailure('m');
    assert.equal(breaker.canAttempt('m'), false);
  });
});

describe('reset throttle', () => {
  it('enforces one reset window through Redis', async () => {
    const clock = { now: 1_000_000 };
    const { store } = storeWithFake(clock);
    const throttle = new RedisResetThrottle(store, () => clock.now / 1000);
    assert.equal(await throttle.claim('user-1', 30), 0);
    assert.equal(await throttle.claim('user-1', 30), 30);
    clock.now += 31_000;
    assert.equal(await throttle.claim('user-1', 30), 0);
  });
});
