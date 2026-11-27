import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import express, { type Request } from 'express';
import request from 'supertest';

import type { RateLimitTier } from '../src/config/index.js';
import {
  classifyRateLimitTier,
  createTieredRateLimitMiddleware,
  RATE_LIMIT_EXCEEDED_CODE,
  type TieredRateLimitOptions,
} from '../src/middleware/tiered-rate-limit.js';
import { RATE_LIMIT_DETAIL } from '../src/middleware/rate-limit.js';
import type { RedisStore } from '../src/redis/client.js';

/**
 * Phase 23 tiered limiter tests.
 *
 * The middleware runs in a real Express app so the 429 body/headers are
 * asserted exactly as clients see them. User/IP keys and the clock are injected
 * so per-user isolation, the IP multiplier and the sliding window are
 * deterministic.
 */

const LIMITS: Record<RateLimitTier, number> = {
  chat: 2,
  email: 2,
  payments: 2,
  ingest: 2,
  evaluate: 2,
  write: 2,
  read: 2,
};

interface Harness {
  readonly app: express.Express;
  readonly clock: { now: number };
}

function buildApp(
  overrides: Partial<TieredRateLimitOptions> = {},
  options: { user?: string; ip?: string } = {},
): Harness {
  const clock = { now: 1_000_000 };
  const app = express();
  app.use((req, _res, next) => {
    req.userId = (req.headers['x-user'] as string | undefined) ?? options.user ?? 'user-a';
    next();
  });
  app.use(
    createTieredRateLimitMiddleware({
      enabled: true,
      windowMs: 60_000,
      limits: LIMITS,
      ipMultiplier: 100,
      tier: 'chat',
      now: () => clock.now,
      userKey: (req) => req.userId,
      ipKey: () => options.ip ?? '127.0.0.1',
      ...overrides,
    }),
  );
  app.get('/ping', (_req, res) => {
    res.json({ ok: true });
  });
  app.post('/ping', (_req, res) => {
    res.json({ ok: true });
  });
  return { app, clock };
}

function fakeRedisStore(): { store: RedisStore } {
  const sets = new Map<string, Array<{ score: number; member: string }>>();
  const store = {
    key: (...parts: Array<string | number>) => parts.join(':'),
    evalScript: async (
      _script: string,
      keys: readonly string[],
      args: readonly (string | number)[],
    ): Promise<unknown> => {
      const key = keys[0] ?? '';
      const now = Number(args[0]);
      const window = Number(args[1]);
      const limit = Number(args[2]);
      const member = String(args[3]);
      const cutoff = now - window;
      const live = (sets.get(key) ?? []).filter((entry) => entry.score > cutoff);
      if (live.length >= limit) {
        const oldest = live[0];
        const retry = oldest ? Math.max(1, oldest.score + window - now) : window;
        sets.set(key, live);
        return [0, retry];
      }
      live.push({ score: now, member });
      sets.set(key, live);
      return [1, 0];
    },
  } as unknown as RedisStore;
  return { store };
}

describe('tiered rate limit', () => {
  it('allows up to the per-user limit and rejects with the FastAPI-shaped 429', async () => {
    const { app, clock } = buildApp();

    assert.equal((await request(app).get('/ping')).status, 200);
    assert.equal((await request(app).get('/ping')).status, 200);

    const rejected = await request(app).get('/ping');
    assert.equal(rejected.status, 429);
    assert.equal(rejected.body.detail, RATE_LIMIT_DETAIL);
    assert.equal(rejected.body.code, RATE_LIMIT_EXCEEDED_CODE);
    assert.ok(rejected.body.retry_after >= 1);
    assert.equal(rejected.headers['retry-after'], String(rejected.body.retry_after));

    // The window slides: once the oldest request expires the user is admitted.
    clock.now += 60_001;
    assert.equal((await request(app).get('/ping')).status, 200);
  });

  it('isolates quotas per authenticated user', async () => {
    const { app } = buildApp();

    assert.equal((await request(app).get('/ping').set('x-user', 'alice')).status, 200);
    assert.equal((await request(app).get('/ping').set('x-user', 'alice')).status, 200);
    assert.equal((await request(app).get('/ping').set('x-user', 'alice')).status, 429);

    // Another tenant on the same IP still has its full budget.
    assert.equal((await request(app).get('/ping').set('x-user', 'bob')).status, 200);
    assert.equal((await request(app).get('/ping').set('x-user', 'bob')).status, 200);
    assert.equal((await request(app).get('/ping').set('x-user', 'bob')).status, 429);
  });

  it('applies the IP multiplier across users sharing one address', async () => {
    const { app } = buildApp({ limits: { ...LIMITS, chat: 2 }, ipMultiplier: 2 });

    // 2 users × 2 requests each = 4, exactly the IP budget.
    for (const user of ['u1', 'u1', 'u2', 'u2']) {
      assert.equal((await request(app).get('/ping').set('x-user', user)).status, 200);
    }
    const rejected = await request(app).get('/ping').set('x-user', 'u3');
    assert.equal(rejected.status, 429);
    assert.equal(rejected.body.code, RATE_LIMIT_EXCEEDED_CODE);
  });

  it('is a pass-through when disabled', async () => {
    const { app } = buildApp({ enabled: false, limits: { ...LIMITS, chat: 1 } });
    for (let index = 0; index < 5; index += 1) {
      assert.equal((await request(app).get('/ping')).status, 200);
    }
  });

  it('falls back to the bounded local window when Redis is unavailable', async () => {
    const failing = {
      key: (...parts: Array<string | number>) => parts.join(':'),
      evalScript: async () => {
        throw new Error('redis down');
      },
    } as unknown as RedisStore;
    const { app } = buildApp({ store: failing, limits: { ...LIMITS, chat: 2 } });

    assert.equal((await request(app).get('/ping')).status, 200);
    assert.equal((await request(app).get('/ping')).status, 200);
    assert.equal((await request(app).get('/ping')).status, 429);
  });

  it('shares one Redis sliding window across replicas', async () => {
    const { store } = fakeRedisStore();
    const replicaA = buildApp({ store, limits: { ...LIMITS, chat: 2 } });
    const replicaB = buildApp({ store, limits: { ...LIMITS, chat: 2 } });

    assert.equal((await request(replicaA.app).get('/ping')).status, 200);
    assert.equal((await request(replicaB.app).get('/ping')).status, 200);
    // The third request hits the shared budget even on the other instance.
    assert.equal((await request(replicaA.app).get('/ping')).status, 429);
  });

  it('classifies endpoints by cost and leaves health probes unlimited', () => {
    const cases: Array<[string, string, RateLimitTier | null]> = [
      ['POST', '/api/chat', 'chat'],
      ['GET', '/api/chat/jobs/123/stream', 'read'],
      ['POST', '/api/email/send', 'email'],
      ['GET', '/api/email/drafts', 'read'],
      ['POST', '/api/payments/order', 'payments'],
      ['POST', '/api/ingest/upload', 'ingest'],
      ['POST', '/api/candidates/abc/evaluate', 'evaluate'],
      ['POST', '/api/export/ats', 'evaluate'],
      ['POST', '/api/sessions', 'write'],
      ['GET', '/api/sessions', 'read'],
      ['DELETE', '/api/privacy/reset', 'write'],
      ['GET', '/api/health/ready', null],
      ['GET', '/health', null],
    ];

    for (const [method, url, expected] of cases) {
      assert.equal(
        classifyRateLimitTier({ method, originalUrl: url, url } as Request),
        expected,
        `${method} ${url}`,
      );
    }
  });
});
