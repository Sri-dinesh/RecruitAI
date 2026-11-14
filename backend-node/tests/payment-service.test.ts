import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';

import { loadConfig, type AppConfig } from '../src/config/index.js';
import { FallbackDatabase } from '../src/db/fallback.js';
import { createSqlitePaymentStore, type PaymentStore } from '../src/db/payment-store.js';
import {
  AVAILABLE_PLANS,
  DEFAULT_FREE_CREDITS,
  PaymentService,
  PaymentValidationError,
} from '../src/services/payment-service.js';

const NOW = new Date('2026-11-14T10:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function devConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
  return loadConfig({ USE_LOCAL_AUTH: 'true', ...overrides });
}

function productionConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
  return loadConfig({
    ENVIRONMENT: 'production',
    GEMINI_API_KEY: 'gemini-key',
    TAVILY_API_KEY: 'tavily-key',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    LLM_DATA_USE_MODE: 'zero_retention_verified',
    ...overrides,
  });
}

async function withDb<T>(
  fn: (db: FallbackDatabase, store: PaymentStore) => Promise<T> | T,
  config: AppConfig = devConfig(),
): Promise<T> {
  const db = new FallbackDatabase(':memory:', config);
  try {
    return await fn(db, createSqlitePaymentStore(db));
  } finally {
    db.close();
  }
}

function clock(start: Date = NOW): () => Date {
  let tick = 0;
  return () => new Date(start.getTime() + tick++ * 1000);
}

describe('plans', () => {
  it('exposes the three public tiers unchanged', () => {
    const service = new PaymentService({ config: devConfig(), store: {} as PaymentStore });
    assert.deepEqual(
      service.getPlans().map((plan) => plan.id),
      ['starter', 'pro', 'agency'],
    );
    assert.deepEqual(AVAILABLE_PLANS.starter, {
      id: 'starter',
      name: 'Starter Recruiter',
      amount: 149900,
      currency: 'INR',
      interval: 'monthly',
      candidate_quota: 50,
      features: [
        '50 Candidate Resume Parses/month',
        '5 Active Job Campaigns',
        'Automated Interview Outreach via Email',
        'Basic Analytics & Blind Hiring Mode',
      ],
    });
    assert.equal(AVAILABLE_PLANS.pro?.amount, 399900);
    assert.equal(AVAILABLE_PLANS.pro?.candidate_quota, 250);
    assert.equal(AVAILABLE_PLANS.agency?.amount, 799900);
    assert.equal(AVAILABLE_PLANS.agency?.candidate_quota, 1000);
  });

  it('resolves plan ids case-insensitively', () => {
    const service = new PaymentService({ config: devConfig(), store: {} as PaymentStore });
    assert.equal(service.getPlan('PRO')?.id, 'pro');
    assert.equal(service.getPlan('missing'), undefined);
  });
});

describe('createOrder', () => {
  it('returns a simulated order when no Razorpay credentials are set', async () => {
    let called = false;
    await withDb(async (_db, store) => {
      const service = new PaymentService({
        config: devConfig({ RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '' }),
        store,
        fetchImpl: async () => {
          called = true;
          return Response.json({});
        },
      });

      const order = await service.createOrder('starter', 'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3');
      assert.match(order.order_id, /^order_mock_[0-9a-f]{14}$/);
      assert.equal(order.amount, 149900);
      assert.equal(order.currency, 'INR');
      assert.equal(order.key_id, 'rzp_test_mock_key');
      assert.equal(order.plan_id, 'starter');
      assert.equal(called, false);
    });
  });

  it("rejects an unknown plan with Python's exact message", async () => {
    await withDb(async (_db, store) => {
      const service = new PaymentService({
        config: devConfig({ RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '' }),
        store,
      });
      await assert.rejects(
        service.createOrder('enterprise', 'user-1'),
        (error: unknown) =>
          error instanceof PaymentValidationError &&
          error.message === "Plan 'enterprise' does not exist.",
      );
    });
  });

  it('creates a live order through the Razorpay REST API', async () => {
    let requestUrl = '';
    let requestInit: RequestInit | undefined;

    await withDb(async (_db, store) => {
      const config = devConfig({
        RAZORPAY_KEY_ID: 'rzp_live_key',
        RAZORPAY_KEY_SECRET: 'live-secret',
      });
      const service = new PaymentService({
        config,
        store,
        fetchImpl: async (input, init) => {
          requestUrl = String(input);
          requestInit = init;
          return Response.json({ id: 'order_live_123', amount: 399900, currency: 'INR' });
        },
      });

      const order = await service.createOrder('pro', 'abc12345-rest-of-user');
      assert.equal(requestUrl, 'https://api.razorpay.com/v1/orders');
      assert.equal(requestInit?.method, 'POST');
      assert.equal(
        (requestInit?.headers as Record<string, string>).authorization,
        `Basic ${Buffer.from('rzp_live_key:live-secret').toString('base64')}`,
      );

      const payload = JSON.parse(String(requestInit?.body)) as {
        amount: number;
        currency: string;
        receipt: string;
        notes: Record<string, string>;
      };
      assert.equal(payload.amount, 399900);
      assert.equal(payload.currency, 'INR');
      assert.match(payload.receipt, /^rcpt_abc12345_\d+$/);
      assert.deepEqual(payload.notes, { user_id: 'abc12345-rest-of-user', plan_id: 'pro' });

      assert.deepEqual(order, {
        order_id: 'order_live_123',
        amount: 399900,
        currency: 'INR',
        key_id: 'rzp_live_key',
        plan_id: 'pro',
      });
    });
  });

  it('falls back to a simulated order when Razorpay fails outside production', async () => {
    await withDb(async (_db, store) => {
      const service = new PaymentService({
        config: devConfig({ RAZORPAY_KEY_ID: 'rzp_live_key', RAZORPAY_KEY_SECRET: 'secret' }),
        store,
        fetchImpl: async () => Response.json({ error: 'down' }, { status: 503 }),
      });

      const order = await service.createOrder('agency', 'user-1');
      assert.match(order.order_id, /^order_mock_/);
      assert.equal(order.amount, 799900);
    });
  });

  it('surfaces the failure in production with the Python prefix', async () => {
    await withDb(async (_db, store) => {
      const service = new PaymentService({
        config: productionConfig({
          RAZORPAY_KEY_ID: 'rzp_live_key',
          RAZORPAY_KEY_SECRET: 'secret',
        }),
        store,
        fetchImpl: async () => Response.json({ error: 'down' }, { status: 500 }),
      });

      await assert.rejects(
        service.createOrder('starter', 'user-1'),
        /Razorpay order creation failed: Razorpay API responded with 500/,
      );
    }, devConfig());
  });

  it('keeps the configured key id in the simulated response', async () => {
    await withDb(async (_db, store) => {
      const service = new PaymentService({
        config: devConfig({ RAZORPAY_KEY_ID: 'rzp_test_configured', RAZORPAY_KEY_SECRET: '' }),
        store,
      });
      const order = await service.createOrder('starter', 'user-1');
      assert.equal(order.key_id, 'rzp_test_configured');
    });
  });
});

describe('payment signatures', () => {
  it('accepts mock signatures and every signature without a secret', () => {
    const service = new PaymentService({
      config: devConfig({ RAZORPAY_KEY_SECRET: '' }),
      store: {} as PaymentStore,
    });
    assert.equal(service.verifyPaymentSignature('o', 'p', 'mock_valid_signature'), true);
    assert.equal(service.verifyPaymentSignature('o', 'p', 'test_anything'), true);
    assert.equal(service.verifyPaymentSignature('o', 'p', 'arbitrary'), true);
  });

  it('verifies the checkout HMAC when a secret is configured', () => {
    const secret = 'checkout-secret';
    const service = new PaymentService({
      config: devConfig({ RAZORPAY_KEY_SECRET: secret }),
      store: {} as PaymentStore,
    });
    const expected = createHmac('sha256', secret).update('order_1|pay_1').digest('hex');

    assert.equal(service.verifyPaymentSignature('order_1', 'pay_1', expected), true);
    assert.equal(service.verifyPaymentSignature('order_1', 'pay_1', `${expected}00`), false);
    assert.equal(service.verifyPaymentSignature('order_1', 'pay_1', 'wrong'), false);
    assert.equal(service.verifyPaymentSignature('order_1', 'pay_1', 'mock_valid_signature'), true);
    assert.equal(service.verifyPaymentSignature('order_1', 'pay_1', 'test_anything'), false);
  });

  it('verifies webhook HMACs over the raw bytes and accepts all without a secret', () => {
    const secret = 'webhook-secret';
    const body = Buffer.from('{"event":"payment.captured"}', 'utf8');
    const expected = createHmac('sha256', secret).update(body).digest('hex');

    const signed = new PaymentService({
      config: devConfig({ RAZORPAY_WEBHOOK_SECRET: secret }),
      store: {} as PaymentStore,
    });
    assert.equal(signed.verifyWebhookSignature(body, expected), true);
    assert.equal(
      signed.verifyWebhookSignature(Buffer.from('{"event":"order.paid"}'), expected),
      false,
    );
    assert.equal(signed.verifyWebhookSignature(body, 'nope'), false);

    const open = new PaymentService({
      config: devConfig({ RAZORPAY_WEBHOOK_SECRET: '' }),
      store: {} as PaymentStore,
    });
    assert.equal(open.verifyWebhookSignature(body, 'anything'), true);
  });
});

describe('credits and subscriptions', () => {
  it('defaults missing or unreadable users to the free credit grant', async () => {
    await withDb(async (_db, store) => {
      const service = new PaymentService({ config: devConfig(), store });
      assert.equal(await service.getUserCredits('missing-user'), DEFAULT_FREE_CREDITS);

      const failing = new PaymentService({
        config: devConfig(),
        store: {
          getCreditsBalance: async () => {
            throw new Error('database down');
          },
        } as unknown as PaymentStore,
      });
      assert.equal(await failing.getUserCredits('missing-user'), DEFAULT_FREE_CREDITS);
    });
  });

  it('defaults the status lookup to free/active before any subscription', async () => {
    await withDb(async (_db, store) => {
      const service = new PaymentService({ config: devConfig(), store });
      assert.deepEqual(await service.getSubscriptionStatus('missing-user'), {
        user_id: 'missing-user',
        plan_id: 'free',
        status: 'active',
        credits_remaining: 10,
        current_period_end: null,
      });
    });
  });

  it('activates a subscription, tops up credits, and writes the audit ledger', async () => {
    await withDb(async (db, store) => {
      const service = new PaymentService({ config: devConfig(), store, now: clock() });
      const result = await service.activateSubscription('user-1', 'starter', 'order_1', 'pay_1');

      assert.match(result.subscription_id, /^sub_[0-9a-f]{12}$/);
      assert.equal(result.plan_id, 'starter');
      assert.equal(result.status, 'active');
      assert.equal(result.credits_remaining, 60);
      assert.equal(result.current_period_end, new Date(NOW.getTime() + 30 * DAY_MS).toISOString());

      const subscription = db.table('subscriptions').select().eq('user_id', 'user-1').execute()
        .data[0];
      assert.equal(subscription?.plan_id, 'starter');
      assert.equal(subscription?.status, 'active');
      assert.equal(subscription?.razorpay_order_id, 'order_1');
      assert.equal(subscription?.razorpay_payment_id, 'pay_1');

      const user = db.table('users').select().eq('id', 'user-1').execute().data[0];
      assert.equal(user?.credits_balance, 60);
      assert.equal(user?.email, 'user-1@recruitai.local');
      assert.equal(user?.full_name, 'Recruiter');
      assert.equal(user?.role, 'recruiter');

      const transactions = db
        .table('credit_transactions')
        .select()
        .eq('user_id', 'user-1')
        .execute().data;
      assert.equal(transactions.length, 1);
      assert.match(String(transactions[0]?.id), /^tx_[0-9a-f]{12}$/);
      assert.equal(transactions[0]?.amount, 50);
      assert.equal(transactions[0]?.balance_after, 60);
      assert.equal(transactions[0]?.reason, 'Plan Upgrade: Starter Recruiter (+50 credits)');

      assert.deepEqual(await service.getSubscriptionStatus('user-1'), {
        user_id: 'user-1',
        plan_id: 'starter',
        status: 'active',
        credits_remaining: 60,
        current_period_end: new Date(NOW.getTime() + 30 * DAY_MS).toISOString(),
      });
    });
  });

  it('adds credits on renewal and keeps one consolidated subscription row', async () => {
    await withDb(async (db, store) => {
      const service = new PaymentService({ config: devConfig(), store, now: clock() });
      await service.activateSubscription('user-1', 'starter', 'order_1', 'pay_1');
      const second = await service.activateSubscription('user-1', 'pro', 'order_2', 'pay_2');

      assert.equal(second.credits_remaining, 310);
      assert.equal(
        db.table('subscriptions').select().eq('user_id', 'user-1').execute().data.length,
        1,
      );
      assert.equal(await service.getUserCredits('user-1'), 310);
      const status = await service.getSubscriptionStatus('user-1');
      assert.equal(status.plan_id, 'pro');
      assert.equal(status.credits_remaining, 310);
    });
  });

  it('rejects unknown plans during activation', async () => {
    await withDb(async (_db, store) => {
      const service = new PaymentService({ config: devConfig(), store });
      await assert.rejects(
        service.activateSubscription('user-1', 'nope', 'order_1', 'pay_1'),
        (error: unknown) =>
          error instanceof PaymentValidationError &&
          error.message === "Plan 'nope' does not exist.",
      );
    });
  });

  it('consumes credits and logs the immutable deduction', async () => {
    await withDb(async (db, store) => {
      const service = new PaymentService({ config: devConfig(), store, now: clock() });
      await service.activateSubscription('user-1', 'starter', 'order_1', 'pay_1');

      const result = await service.consumeCredits('user-1', 5, 'candidate_analysis');
      assert.deepEqual(result, {
        success: true,
        credits_remaining: 55,
        amount_deducted: 5,
        reason: 'candidate_analysis',
      });
      assert.equal(await service.getUserCredits('user-1'), 55);

      const deductions = db
        .table('credit_transactions')
        .select()
        .eq('user_id', 'user-1')
        .order('created_at', true)
        .execute()
        .data.filter((row) => Number(row.amount) < 0);
      assert.equal(deductions.length, 1);
      assert.equal(deductions[0]?.amount, -5);
      assert.equal(deductions[0]?.balance_after, 55);
    });
  });

  it('rejects zero/negative amounts and insufficient balances with exact messages', async () => {
    await withDb(async (_db, store) => {
      const service = new PaymentService({ config: devConfig(), store });
      await assert.rejects(
        service.consumeCredits('user-1', 0),
        (error: unknown) =>
          error instanceof PaymentValidationError &&
          error.message === 'Amount must be greater than 0.',
      );
      await assert.rejects(
        service.consumeCredits('user-1', 11),
        (error: unknown) =>
          error instanceof PaymentValidationError &&
          error.message === 'Insufficient credits. Remaining: 10, required: 11',
      );
    });
  });

  it('returns newest-first transactions and honours the limit', async () => {
    await withDb(async (_db, store) => {
      const service = new PaymentService({ config: devConfig(), store, now: clock() });
      await service.activateSubscription('user-1', 'starter', 'order_1', 'pay_1');
      await service.consumeCredits('user-1', 2, 'second');
      await service.consumeCredits('user-1', 3, 'third');

      const all = await service.getCreditTransactions('user-1');
      assert.equal(all.length, 3);
      assert.equal(all[0]?.reason, 'third');
      assert.equal(all[1]?.reason, 'second');
      assert.equal(all[2]?.reason, 'Plan Upgrade: Starter Recruiter (+50 credits)');
      assert.match(all[0]?.id ?? '', /^tx_[0-9a-f]{12}$/);
      assert.equal(all[0]?.user_id, 'user-1');
      assert.equal(all[0]?.amount, -3);
      assert.equal(all[0]?.balance_after, 55);
      assert.ok(all[0]?.created_at);

      assert.equal((await service.getCreditTransactions('user-1', 1)).length, 1);
      assert.deepEqual(await service.getCreditTransactions('unknown'), []);
    });
  });
});

describe('processWebhookEvent', () => {
  const USER = 'user-1';

  function capturedEvent(notes: Record<string, unknown> = { user_id: USER, plan_id: 'starter' }) {
    return {
      event: 'payment.captured',
      payload: {
        payment: { entity: { id: 'pay_webhook_1', order_id: 'order_webhook_1', notes } },
        order: { entity: { id: 'order_webhook_1' } },
      },
    };
  }

  it('activates a subscription for captured payments with notes', async () => {
    await withDb(async (db, store) => {
      const service = new PaymentService({ config: devConfig(), store, now: clock() });
      const result = await service.processWebhookEvent(capturedEvent());

      assert.deepEqual(result, {
        status: 'processed',
        event: 'payment.captured',
        subscription_activated: true,
        plan_id: 'starter',
        user_id: USER,
        credits_remaining: 60,
      });
      const subscription = db.table('subscriptions').select().eq('user_id', USER).execute().data[0];
      assert.equal(subscription?.razorpay_order_id, 'order_webhook_1');
      assert.equal(subscription?.razorpay_payment_id, 'pay_webhook_1');
    });
  });

  it('handles order.paid, subscription.charged, and subscription.activated', async () => {
    await withDb(async (db, store) => {
      const service = new PaymentService({ config: devConfig(), store, now: clock() });

      const orderPaid = await service.processWebhookEvent({
        event: 'order.paid',
        payload: {
          order: { entity: { id: 'order_2', notes: { user_id: USER, plan_id: 'pro' } } },
          payment: { entity: { id: 'pay_2' } },
        },
      });
      assert.equal(orderPaid.status, 'processed');
      assert.equal(orderPaid.credits_remaining, 260);

      const charged = await service.processWebhookEvent({
        event: 'subscription.charged',
        payload: {
          subscription: { entity: { notes: { user_id: USER, plan_id: 'agency' } } },
        },
      });
      assert.equal(charged.status, 'processed');
      assert.equal(charged.credits_remaining, 1260);

      const activated = await service.processWebhookEvent({
        event: 'subscription.activated',
        payload: {
          subscription: { entity: { notes: { user_id: USER, plan_id: 'starter' } } },
        },
      });
      assert.equal(activated.status, 'processed');

      const subscription = db.table('subscriptions').select().eq('user_id', USER).execute().data[0];
      assert.equal(subscription?.plan_id, 'starter');
      assert.match(String(subscription?.razorpay_payment_id), /^pay_[0-9a-f]{8}$/);
      assert.match(String(subscription?.razorpay_order_id), /^order_[0-9a-f]{8}$/);
    });
  });

  it('skips activation events whose notes lack user_id or plan_id', async () => {
    await withDb(async (_db, store) => {
      const service = new PaymentService({ config: devConfig(), store });
      const result = await service.processWebhookEvent(
        capturedEvent({ user_id: USER } as Record<string, unknown>),
      );
      assert.deepEqual(result, {
        status: 'skipped',
        event: 'payment.captured',
        reason: 'Missing user_id or plan_id in payload notes',
      });
    });
  });

  it('falls back to order notes when payment notes are empty', async () => {
    await withDb(async (_db, store) => {
      const service = new PaymentService({ config: devConfig(), store, now: clock() });
      const result = await service.processWebhookEvent({
        event: 'payment.captured',
        payload: {
          payment: { entity: { id: 'pay_3', notes: {} } },
          order: { entity: { id: 'order_3', notes: { user_id: USER, plan_id: 'starter' } } },
        },
      });
      assert.equal(result.status, 'processed');
      assert.equal(result.user_id, USER);
    });
  });

  it('cancels subscriptions on cancellation and halting events', async () => {
    await withDb(async (db, store) => {
      const service = new PaymentService({ config: devConfig(), store, now: clock() });
      await service.activateSubscription(USER, 'starter', 'order_1', 'pay_1');

      const cancelled = await service.processWebhookEvent({
        event: 'subscription.cancelled',
        payload: { subscription: { entity: { notes: { user_id: USER } } } },
      });
      assert.deepEqual(cancelled, {
        status: 'processed',
        event: 'subscription.cancelled',
        subscription_canceled: true,
        user_id: USER,
      });
      let subscription = db.table('subscriptions').select().eq('user_id', USER).execute().data[0];
      assert.equal(subscription?.status, 'canceled');

      // A later charge reactivates the row; halting then cancels it again.
      await service.activateSubscription(USER, 'starter', 'order_2', 'pay_2');
      const halted = await service.processWebhookEvent({
        event: 'subscription.halted',
        payload: { subscription: { entity: { notes: { user_id: USER } } } },
      });
      assert.deepEqual(halted, {
        status: 'processed',
        event: 'subscription.halted',
        subscription_canceled: true,
        user_id: USER,
      });
      subscription = db.table('subscriptions').select().eq('user_id', USER).execute().data[0];
      assert.equal(subscription?.status, 'canceled');
    });
  });

  it('ignores unrelated events and missing cancellation identities', async () => {
    await withDb(async (_db, store) => {
      const service = new PaymentService({ config: devConfig(), store });
      assert.deepEqual(await service.processWebhookEvent({ event: 'refund.created' }), {
        status: 'ignored',
        event: 'refund.created',
      });
      assert.deepEqual(
        await service.processWebhookEvent({
          event: 'subscription.cancelled',
          payload: { subscription: { entity: { notes: {} } } },
        }),
        { status: 'ignored', event: 'subscription.cancelled' },
      );
    });
  });
});
