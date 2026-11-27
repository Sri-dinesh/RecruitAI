import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import express from 'express';
import request from 'supertest';

import { RedisTtlCache } from '../src/cache/ttl-cache.js';
import { RATE_LIMIT_TIERS, type RateLimitTier } from '../src/config/index.js';
import { createTieredRateLimitMiddleware } from '../src/middleware/tiered-rate-limit.js';
import { RedisStore } from '../src/redis/client.js';
import { RedisCircuitBreaker } from '../src/resilience/breaker.js';

/**
 * Opt-in fleet-state proof for the Phase 21/23/24 contract.
 *
 * Each replica builds its own `RedisStore`, exactly like separate processes.
 * This test then shows that a rate-limit window, a cached value and a circuit
 * state written through replica A are observed by replica B:
 *
 *   REDIS_INTEGRATION_URL=redis://127.0.0.1:6390 npm run test:integration:redis
 *
 * Unique keys per run keep it safe to point at a shared disposable Redis.
 */
const REDIS_URL = process.env.REDIS_INTEGRATION_URL ?? '';
const skip = REDIS_URL ? false : 'set REDIS_INTEGRATION_URL to a disposable Redis';

function stores(): [RedisStore, RedisStore] {
  return [new RedisStore({ url: REDIS_URL }), new RedisStore({ url: REDIS_URL })];
}

/** `enableOfflineQueue` is off, so wait for the socket before issuing commands. */
async function ready(store: RedisStore): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (await store.ping()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Redis did not become ready');
}

describe('fleet state across two Redis stores', { skip }, () => {
  it('shares one rate-limit window between replicas', async () => {
    const [storeA, storeB] = stores();
    const user = `user-${randomUUID()}`;
    const limits = Object.fromEntries(RATE_LIMIT_TIERS.map((tier) => [tier, 5])) as Record<
      RateLimitTier,
      number
    >;
    const middleware = (store: RedisStore) =>
      createTieredRateLimitMiddleware({
        enabled: true,
        windowMs: 60_000,
        limits,
        ipMultiplier: 100,
        tier: 'chat',
        store,
        userKey: () => user,
        ipKey: () => '203.0.113.10',
      });
    const appFor = (store: RedisStore) => {
      const app = express();
      app.use(middleware(store));
      app.get('/api/probe', (_req, res) => res.json({ ok: true }));
      return app;
    };
    const appA = appFor(storeA);
    const appB = appFor(storeB);

    try {
      await Promise.all([ready(storeA), ready(storeB)]);
      // Five admissions split across two replicas: the sixth is over budget
      // regardless of which replica answers it.
      for (const app of [appA, appB, appA, appB, appA]) {
        const response = await request(app).get('/api/probe');
        assert.equal(response.status, 200);
      }

      const rejected = await request(appB).get('/api/probe');
      assert.equal(rejected.status, 429);
      assert.equal(rejected.body.code, 'rate_limit_exceeded');
      assert.ok(Number(rejected.headers['retry-after']) >= 1);
    } finally {
      await Promise.allSettled([storeA.close(), storeB.close()]);
    }
  });

  it('shares cached values between replicas', async () => {
    const [storeA, storeB] = stores();
    const namespace = `ns-${randomUUID()}`;
    const cacheA = new RedisTtlCache({ store: storeA, namespace });
    const cacheB = new RedisTtlCache({ store: storeB, namespace });

    try {
      await Promise.all([ready(storeA), ready(storeB)]);
      await cacheA.set('salary:engineer', { low: 100, high: 140 }, 30);
      assert.deepEqual(await cacheB.get('salary:engineer'), { low: 100, high: 140 });

      await cacheB.delete('salary:engineer');
      assert.equal(await cacheA.get('salary:engineer'), undefined);
    } finally {
      await Promise.allSettled([storeA.close(), storeB.close()]);
    }
  });

  it('shares an opened circuit between replicas', async () => {
    const [storeA, storeB] = stores();
    const name = `model-${randomUUID()}`;
    const breaker = (store: RedisStore) =>
      new RedisCircuitBreaker({
        store,
        name,
        keys: ['default'],
        failureThreshold: 2,
        cooldownSeconds: 60,
      });
    const breakerA = breaker(storeA);
    const breakerB = breaker(storeB);

    try {
      await Promise.all([ready(storeA), ready(storeB)]);
      assert.equal(await breakerA.canAttemptAsync('default'), true);
      assert.equal(await breakerB.canAttemptAsync('default'), true);

      await breakerA.recordFailureAsync('default');
      await breakerA.recordFailureAsync('default');
      // A's local state is open; B must read the same state from Redis.
      assert.equal(await breakerA.canAttemptAsync('default'), false);
      assert.equal(await breakerB.canAttemptAsync('default'), false);

      await breakerB.recordSuccessAsync('default');
      assert.equal(await breakerA.canAttemptAsync('default'), true);
    } finally {
      await Promise.allSettled([storeA.close(), storeB.close()]);
    }
  });
});
