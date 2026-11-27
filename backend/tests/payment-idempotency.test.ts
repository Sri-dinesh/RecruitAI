import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { HotReadCache } from '../src/cache/hot-read-cache.js';
import { InMemoryTtlCache } from '../src/cache/ttl-cache.js';
import { loadConfig, type AppConfig } from '../src/config/index.js';
import { FallbackDatabase } from '../src/db/fallback.js';
import { createSqlitePaymentStore, type PaymentStore } from '../src/db/payment-store.js';
import { PaymentService, PaymentValidationError } from '../src/services/payment-service.js';

const USER = 'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3';
const NOW = new Date('2026-11-19T10:00:00.000Z');

function devConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({ USE_LOCAL_AUTH: 'true', ...overrides });
}

interface Harness {
  readonly db: FallbackDatabase;
  readonly store: PaymentStore;
  readonly cache: HotReadCache;
  readonly service: PaymentService;
}

function withHarness<T>(
  fn: (harness: Harness) => Promise<T> | T,
  config = devConfig(),
): Promise<T> {
  const db = new FallbackDatabase(':memory:', config);
  const store = createSqlitePaymentStore(db);
  const cache = new HotReadCache({ config, cache: new InMemoryTtlCache() });
  db.table('users')
    .insert({ id: USER, email: 'idempotency@example.test', credits_balance: 10 })
    .execute();
  const service = new PaymentService({
    config,
    store,
    hotReadCache: cache,
    now: () => NOW,
  });
  return (async () => fn({ db, store, cache, service }))().finally(() => db.close());
}

function ledgerCount(db: FallbackDatabase): number {
  return db.table('credit_transactions').select().eq('user_id', USER).execute().data.length;
}

function credits(db: FallbackDatabase): number {
  return Number(
    db.table('users').select('credits_balance').eq('id', USER).execute().data[0]?.[
      'credits_balance'
    ],
  );
}

describe('payment idempotency', () => {
  it('grants plan credits once when verify is replayed with the same payment id', async () => {
    await withHarness(async ({ db, service }) => {
      const first = await service.activateSubscription(USER, 'starter', 'order_1', 'pay_replay_1');
      assert.equal(first.credits_remaining, 60);
      assert.equal(credits(db), 60);
      assert.equal(ledgerCount(db), 1);
      assert.match(first.subscription_id, /^sub_/);

      const second = await service.activateSubscription(USER, 'starter', 'order_1', 'pay_replay_1');
      assert.equal(second.credits_remaining, 60, 'replay must not add credits again');
      assert.equal(second.subscription_id, first.subscription_id);
      assert.equal(credits(db), 60);
      assert.equal(ledgerCount(db), 1);
    });
  });

  it('shares the payment fence between verify and webhook delivery', async () => {
    await withHarness(async ({ db, service }) => {
      await service.activateSubscription(USER, 'starter', 'order_2', 'pay_shared_1');
      assert.equal(credits(db), 60);

      const webhook = await service.processWebhookEvent({
        id: 'evt_shared_1',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_shared_1',
              order_id: 'order_2',
              notes: { user_id: USER, plan_id: 'starter' },
            },
          },
        },
      });

      assert.equal(webhook.status, 'processed');
      assert.equal(webhook.credits_remaining, 60, 'webhook replay must not double-credit');
      assert.equal(credits(db), 60);
      assert.equal(ledgerCount(db), 1);
    });
  });

  it('marks a redelivered webhook event as a duplicate', async () => {
    await withHarness(async ({ db, service }) => {
      const event = {
        id: 'evt_dup_1',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_dup_1',
              order_id: 'order_dup_1',
              notes: { user_id: USER, plan_id: 'starter' },
            },
          },
        },
      };

      const first = await service.processWebhookEvent(event);
      const second = await service.processWebhookEvent(event);

      assert.equal(first.status, 'processed');
      assert.equal(first.credits_remaining, 60);
      assert.deepEqual(second, { status: 'duplicate', event: 'payment.captured' });
      assert.equal(credits(db), 60);
      assert.equal(ledgerCount(db), 1);
    });
  });

  it('deduplicates distinct events that carry the same payment id', async () => {
    await withHarness(async ({ db, service }) => {
      const payment = {
        payment: {
          entity: {
            id: 'pay_multi_event',
            order_id: 'order_multi_event',
            notes: { user_id: USER, plan_id: 'starter' },
          },
        },
      };

      await service.processWebhookEvent({ id: 'evt_a', event: 'order.paid', payload: payment });
      await service.processWebhookEvent({
        id: 'evt_b',
        event: 'payment.captured',
        payload: payment,
      });

      assert.equal(credits(db), 60);
      assert.equal(ledgerCount(db), 1);
    });
  });
});

describe('hot-read cache correctness', () => {
  it('serves the cached balance but spends against the primary row', async () => {
    await withHarness(async ({ db, cache, service, store }) => {
      assert.equal(await service.getUserCredits(USER), 10);

      // Mutate the database behind the cache's back: the cached read is stale
      // but a spend must still use the authoritative balance.
      await store.updateCreditsBalance(USER, 3);
      assert.equal(await service.getUserCredits(USER), 10);
      await assert.rejects(
        () => service.consumeCredits(USER, 8, 'candidate_analysis'),
        PaymentValidationError,
      );
      assert.equal(credits(db), 3);

      await cache.invalidateTenant(USER);
      assert.equal(await service.getUserCredits(USER), 3);
    });
  });

  it('invalidates cached credits and subscription after a verified top-up', async () => {
    await withHarness(async ({ service }) => {
      assert.equal(await service.getUserCredits(USER), 10);
      const before = await service.getSubscriptionStatus(USER);
      assert.equal(before.plan_id, 'free');

      await service.activateSubscription(USER, 'pro', 'order_cache_1', 'pay_cache_1');

      assert.equal(await service.getUserCredits(USER), 260);
      const after = await service.getSubscriptionStatus(USER);
      assert.equal(after.plan_id, 'pro');
      assert.equal(after.credits_remaining, 260);
    });
  });

  it('bypasses the cache entirely when hot reads are disabled', async () => {
    const config = devConfig({ CACHE_HOT_READS_ENABLED: 'false' });
    await withHarness(async ({ service, store }) => {
      assert.equal(await service.getUserCredits(USER), 10);
      await store.updateCreditsBalance(USER, 4);
      assert.equal(await service.getUserCredits(USER), 4);
    }, config);
  });
});
