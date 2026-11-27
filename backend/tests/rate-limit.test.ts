import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import express from 'express';
import request from 'supertest';

import {
  DEFAULT_MAX_TRACKED_KEYS,
  RATE_LIMIT_DETAIL,
  createRateLimitMiddleware,
} from '../src/middleware/rate-limit.js';
import type { RedisStore } from '../src/redis/client.js';

/**
 * Phase 19 limiter tests.
 *
 * The middleware is exercised through a real Express app so the 429 body and
 * headers are asserted exactly as a client sees them. The clock is injected so
 * window behavior is deterministic.
 */

interface Harness {
  readonly app: express.Express;
  readonly clock: { now: number };
}

function buildApp(
  overrides: Partial<Parameters<typeof createRateLimitMiddleware>[0]> = {},
): Harness {
  const clock = { now: 1_000_000 };
  const app = express();
  app.use(
    createRateLimitMiddleware({
      enabled: true,
      windowMs: 60_000,
      maxRequests: 2,
      now: () => clock.now,
      key: (req) => String(req.headers['x-key'] ?? 'default'),
      ...overrides,
    }),
  );
  app.get('/ping', (_req, res) => {
    res.json({ ok: true });
  });
  return { app, clock };
}

describe('rate limit middleware', () => {
  it('allows requests up to the limit, then returns a 429 with Retry-After', async () => {
    const { app } = buildApp();

    await request(app).get('/ping').expect(200);
    await request(app).get('/ping').expect(200);

    const blocked = await request(app).get('/ping').expect(429);
    assert.deepEqual(blocked.body, { detail: RATE_LIMIT_DETAIL });
    assert.equal(blocked.headers['retry-after'], '60');
    assert.equal(RATE_LIMIT_DETAIL, 'Too many requests. Please retry shortly.');
  });

  it('rounds Retry-After up from the remaining window', async () => {
    const { app, clock } = buildApp();
    await request(app).get('/ping').expect(200);
    await request(app).get('/ping').expect(200);

    clock.now += 30_500;
    const blocked = await request(app).get('/ping').expect(429);
    assert.equal(blocked.headers['retry-after'], '30');
  });

  it('starts a fresh window after the interval elapses', async () => {
    const { app, clock } = buildApp();
    await request(app).get('/ping').expect(200);
    await request(app).get('/ping').expect(200);
    await request(app).get('/ping').expect(429);

    clock.now += 60_000;
    await request(app).get('/ping').expect(200);
    await request(app).get('/ping').expect(200);
    await request(app).get('/ping').expect(429);
  });

  it('isolates keys so one client cannot exhaust another', async () => {
    const { app } = buildApp();

    await request(app).get('/ping').set('x-key', 'tenant-a').expect(200);
    await request(app).get('/ping').set('x-key', 'tenant-a').expect(200);
    await request(app).get('/ping').set('x-key', 'tenant-a').expect(429);

    await request(app).get('/ping').set('x-key', 'tenant-b').expect(200);
    await request(app).get('/ping').set('x-key', 'tenant-b').expect(200);
    await request(app).get('/ping').set('x-key', 'tenant-b').expect(429);
  });

  it('is a pass-through when disabled', async () => {
    const { app } = buildApp({ enabled: false });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app).get('/ping').expect(200);
    }
  });

  it('keeps the tracked-key map bounded under unique-key pressure', async () => {
    const app = express();
    app.use(
      createRateLimitMiddleware({
        enabled: true,
        windowMs: 60_000,
        maxRequests: 1,
        maxTrackedKeys: 2,
        key: (req) => String(req.headers['x-key']),
      }),
    );
    app.get('/ping', (_req, res) => {
      res.json({ ok: true });
    });

    for (const key of ['a', 'b', 'c', 'd']) {
      await request(app).get('/ping').set('x-key', key).expect(200);
    }
  });

  it('exposes a documented default bound', () => {
    assert.equal(DEFAULT_MAX_TRACKED_KEYS, 10_000);
  });
});

describe('fleet-wide rate limiting through Redis', () => {
  function fakeRedisWindow(): {
    store: RedisStore;
    windows: Map<string, { count: number; expiresAt: number }>;
    clock: { now: number };
  } {
    const windows = new Map<string, { count: number; expiresAt: number }>();
    const clock = { now: 1_000_000 };
    const store = {
      key: (...parts: Array<string | number>) => parts.join(':'),
      evalScript: async (
        _script: string,
        keys: readonly string[],
        args: readonly (string | number)[],
      ) => {
        const key = keys[0] ?? '';
        const ttl = Number(args[0]);
        let entry = windows.get(key);
        if (!entry || entry.expiresAt <= clock.now) {
          entry = { count: 0, expiresAt: clock.now + ttl };
          windows.set(key, entry);
        }
        entry.count += 1;
        return [entry.count, Math.max(0, entry.expiresAt - clock.now)];
      },
    } as unknown as RedisStore;
    return { store, windows, clock };
  }

  it('shares one window across replicas', async () => {
    const { store, windows, clock } = fakeRedisWindow();
    const first = buildApp({ store });
    const second = buildApp({ store });

    await request(first.app).get('/ping').set('x-key', 'shared').expect(200);
    await request(second.app).get('/ping').set('x-key', 'shared').expect(200);
    const blocked = await request(second.app).get('/ping').set('x-key', 'shared').expect(429);
    assert.equal(blocked.headers['retry-after'], '60');

    clock.now += 60_000;
    await request(first.app).get('/ping').set('x-key', 'shared').expect(200);
    assert.equal(windows.size, 1);
  });

  it('falls back to the local window when Redis fails', async () => {
    const store = {
      key: (...parts: Array<string | number>) => parts.join(':'),
      evalScript: async () => {
        throw new Error('down');
      },
    } as unknown as RedisStore;
    const { app } = buildApp({ store });

    await request(app).get('/ping').expect(200);
    await request(app).get('/ping').expect(200);
    await request(app).get('/ping').expect(429);
  });
});
