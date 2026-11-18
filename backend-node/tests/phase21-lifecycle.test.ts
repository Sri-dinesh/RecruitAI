import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import request from 'supertest';

import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/index.js';
import type { WorkspaceQueryStore } from '../src/db/workspace-query-store.js';
import { InMemoryChatJobManager } from '../src/jobs/in-memory-job-manager.js';
import { createRetentionScheduler } from '../src/jobs/retention-scheduler.js';
import { beginDrain, resetDrainForTests } from '../src/lifecycle.js';
import { setSharedRedisStoreForTests, RedisStore } from '../src/redis/client.js';
import { SseRegistry } from '../src/routes/sse-registry.js';
import type { PrivacyService } from '../src/services/privacy-service.js';
import { createLogger } from '../src/telemetry/logger.js';
import type { RedisClient } from '../src/redis/client.js';

const quiet = createLogger({ name: 'phase21-test', sink: () => {} });

describe('SSE admission control', () => {
  it('caps concurrent streams per instance and releases slots', () => {
    const registry = new SseRegistry();
    const first = registry.acquire(2);
    const second = registry.acquire(2);
    assert.ok(first);
    assert.ok(second);
    assert.equal(registry.acquire(2), null);
    assert.equal(registry.size, 2);

    first.release();
    assert.equal(registry.size, 1);
    const third = registry.acquire(2);
    assert.ok(third);
    third.release();
    second.release();
    assert.equal(registry.size, 0);
  });

  it('drains every active stream', () => {
    const registry = new SseRegistry();
    const first = registry.acquire(5);
    const second = registry.acquire(5);
    assert.ok(first && second);
    let aborted = 0;
    first.controller.signal.addEventListener('abort', () => {
      aborted += 1;
    });
    second.controller.signal.addEventListener('abort', () => {
      aborted += 1;
    });

    registry.drain();
    assert.equal(aborted, 2);
    assert.equal(registry.size, 0);
  });
});

describe('readiness during shutdown and Redis outage', () => {
  it('returns 503 while draining without changing the payload shape', async () => {
    resetDrainForTests();
    const config = loadConfig({ USE_LOCAL_AUTH: 'true' });
    const app = createApp({
      config,
      chatJobManager: new InMemoryChatJobManager({ runner: async () => ({}) }),
    });

    beginDrain();
    try {
      const response = await request(app).get('/api/health/ready').expect(503);
      assert.equal(response.body.status, 'unhealthy');
      assert.ok('services' in response.body);
      assert.ok('database' in response.body.services);
    } finally {
      resetDrainForTests();
    }
  });

  it('returns 503 when Redis is configured but unreachable', async () => {
    const broken: RedisClient = {
      get: async () => null,
      set: async () => 'OK',
      del: async () => 1,
      exists: async () => 0,
      incr: async () => 1,
      expire: async () => 1,
      pexpire: async () => 1,
      pttl: async () => -1,
      eval: async () => 0,
      ping: async () => {
        throw new Error('down');
      },
      quit: async () => 'OK',
      on: () => {},
    };
    setSharedRedisStoreForTests(new RedisStore({ url: 'redis://unused', client: broken }));
    try {
      const config = loadConfig({ USE_LOCAL_AUTH: 'true', REDIS_URL: 'redis://unused' });
      const app = createApp({
        config,
        chatJobManager: new InMemoryChatJobManager({ runner: async () => ({}) }),
      });
      await request(app).get('/api/health/ready').expect(503);
    } finally {
      setSharedRedisStoreForTests(null);
    }
  });
});

describe('retention scheduler lock', () => {
  function fakeStore(acquireResult: string | null): {
    store: RedisStore;
    released: string[];
  } {
    const released: string[] = [];
    const store = {
      key: (...parts: Array<string | number>) => parts.join(':'),
      acquireLock: async () => acquireResult,
      releaseLock: async (_key: string, token: string) => {
        released.push(token);
        return true;
      },
    } as unknown as RedisStore;
    return { store, released };
  }

  it('skips the sweep when another instance owns the lock', async () => {
    const { store } = fakeStore(null);
    let called = false;
    const scheduler = createRetentionScheduler({
      config: loadConfig({ RETENTION_JOB_ENABLED: 'true' }),
      redisStore: store,
      logger: quiet,
      queryStore: {
        listUserIds: async () => ['tenant'],
      } as unknown as WorkspaceQueryStore,
      privacyService: {
        enforceRetentionPolicy: async () => {
          called = true;
          return { raw_resumes_cleared: 0, chat_messages_purged: 0 };
        },
        previewRetentionPolicy: async () => ({ raw_resumes_cleared: 0, chat_messages_purged: 0 }),
      } as unknown as PrivacyService,
    });

    const result = await scheduler.runOnce();
    assert.equal(result.status, 'skipped');
    assert.equal(called, false);
  });

  it('runs once and releases the lock', async () => {
    const { store, released } = fakeStore('owner-token');
    let calls = 0;
    const scheduler = createRetentionScheduler({
      config: loadConfig({ RETENTION_JOB_ENABLED: 'true' }),
      redisStore: store,
      logger: quiet,
      queryStore: {
        listUserIds: async () => ['tenant'],
      } as unknown as WorkspaceQueryStore,
      privacyService: {
        enforceRetentionPolicy: async () => {
          calls += 1;
          return { raw_resumes_cleared: 1, chat_messages_purged: 2 };
        },
        previewRetentionPolicy: async () => ({ raw_resumes_cleared: 0, chat_messages_purged: 0 }),
      } as unknown as PrivacyService,
    });

    const result = await scheduler.runOnce();
    assert.equal(result.status, 'completed');
    assert.equal(result.tenants_processed, 1);
    assert.deepEqual(result.summary, { raw_resumes_cleared: 1, chat_messages_purged: 2 });
    assert.equal(calls, 1);
    assert.deepEqual(released, ['owner-token']);
  });
});
