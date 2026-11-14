import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';

import request from 'supertest';

import { createApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/config/index.js';
import { FallbackDatabase } from '../src/db/fallback.js';
import { createSqlitePaymentStore } from '../src/db/payment-store.js';
import { PaymentService } from '../src/services/payment-service.js';

const JWT_SECRET = 'test-secret-key-that-is-at-least-32-bytes-long';

function devConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
  return loadConfig({
    USE_LOCAL_AUTH: 'true',
    RAZORPAY_KEY_ID: '',
    RAZORPAY_KEY_SECRET: '',
    RAZORPAY_WEBHOOK_SECRET: '',
    ...overrides,
  });
}

function jwtConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
  return loadConfig({
    USE_LOCAL_AUTH: 'false',
    SUPABASE_JWT_SECRET: JWT_SECRET,
    ...overrides,
  });
}

interface AppHarness {
  readonly app: ReturnType<typeof createApp>;
  readonly db: FallbackDatabase;
  readonly service: PaymentService;
  readonly config: AppConfig;
}

async function withApp<T>(
  fn: (harness: AppHarness) => Promise<T> | T,
  config: AppConfig = devConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const db = new FallbackDatabase(':memory:', config);
  try {
    const service = new PaymentService({
      config,
      store: createSqlitePaymentStore(db),
      fetchImpl,
      now: () => new Date('2026-11-14T10:00:00.000Z'),
    });
    const app = createApp({ config, paymentService: service });
    return await fn({ app, db, service, config });
  } finally {
    db.close();
  }
}

function capturedEvent(notes: Record<string, string> = {}) {
  return {
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: 'pay_route_1',
          order_id: 'order_route_1',
          notes: { user_id: notes.user_id ?? '', plan_id: notes.plan_id ?? 'starter' },
        },
      },
    },
  };
}

describe('GET /api/payments/plans', () => {
  it('is public and returns the three pricing tiers', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app).get('/api/payments/plans').expect(200);
      assert.equal(response.body.length, 3);
      assert.deepEqual(
        response.body.map((plan: { id: string }) => plan.id),
        ['starter', 'pro', 'agency'],
      );
      assert.equal(response.body[0].amount, 149900);
    }, jwtConfig());
  });
});

describe('payments authentication', () => {
  it('requires a bearer token on protected routes only', async () => {
    await withApp(async ({ app }) => {
      const order = await request(app)
        .post('/api/payments/order')
        .send({ plan_id: 'starter' })
        .expect(401);
      assert.equal(order.headers['www-authenticate'], 'Bearer');
      assert.deepEqual(order.body, {
        detail: 'Authentication required. Please log in to continue.',
      });

      await request(app).get('/api/payments/status').expect(401);
      await request(app).get('/api/payments/plans').expect(200);
    }, jwtConfig());
  });
});

describe('POST /api/payments/order', () => {
  it('returns the checkout contract expected by the frontend', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app)
        .post('/api/payments/order')
        .send({ plan_id: 'starter' })
        .expect(200);

      assert.match(response.body.order_id, /^order_mock_[0-9a-f]{14}$/);
      assert.equal(response.body.amount, 149900);
      assert.equal(response.body.currency, 'INR');
      assert.equal(response.body.key_id, 'rzp_test_mock_key');
      assert.equal(response.body.plan_id, 'starter');
    });
  });

  it('maps an unknown plan to a 400 with the exact detail', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app)
        .post('/api/payments/order')
        .send({ plan_id: 'enterprise' })
        .expect(400);
      assert.deepEqual(response.body, { detail: "Plan 'enterprise' does not exist." });
    });
  });

  it('validates the body like FastAPI', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app).post('/api/payments/order').send({}).expect(422);
      assert.equal(response.body.detail[0].type, 'missing');
      assert.deepEqual(response.body.detail[0].loc, ['body', 'plan_id']);
    });
  });
});

describe('POST /api/payments/verify', () => {
  it('activates the subscription and updates credits/status/transactions', async () => {
    await withApp(async ({ app }) => {
      const verify = await request(app)
        .post('/api/payments/verify')
        .send({
          razorpay_order_id: 'order_1',
          razorpay_payment_id: 'pay_1',
          razorpay_signature: 'mock_valid_signature',
          plan_id: 'starter',
        })
        .expect(200);

      assert.equal(verify.body.success, true);
      assert.equal(verify.body.message, 'Payment verified successfully. Subscription activated.');
      assert.equal(verify.body.status, 'active');
      assert.match(verify.body.subscription_id, /^sub_[0-9a-f]{12}$/);
      assert.equal(verify.body.plan_id, 'starter');
      assert.equal(verify.body.credits_remaining, 60);

      const status = await request(app).get('/api/payments/status').expect(200);
      assert.deepEqual(status.body, {
        user_id: 'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3',
        plan_id: 'starter',
        status: 'active',
        credits_remaining: 60,
        current_period_end: '2026-12-14T10:00:00.000Z',
      });

      const transactions = await request(app).get('/api/payments/transactions').expect(200);
      assert.equal(transactions.body.length, 1);
      assert.match(transactions.body[0].id, /^tx_[0-9a-f]{12}$/);
      assert.equal(transactions.body[0].amount, 50);
      assert.equal(transactions.body[0].balance_after, 60);
      assert.equal(transactions.body[0].reason, 'Plan Upgrade: Starter Recruiter (+50 credits)');
    });
  });

  it('defaults the plan to starter when plan_id is omitted', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app)
        .post('/api/payments/verify')
        .send({
          razorpay_order_id: 'order_1',
          razorpay_payment_id: 'pay_1',
          razorpay_signature: 'mock_valid_signature',
        })
        .expect(200);
      assert.equal(response.body.plan_id, 'starter');
      assert.equal(response.body.credits_remaining, 60);
    });
  });

  it('rejects an invalid checkout signature', async () => {
    await withApp(
      async ({ app }) => {
        const response = await request(app)
          .post('/api/payments/verify')
          .send({
            razorpay_order_id: 'order_1',
            razorpay_payment_id: 'pay_1',
            razorpay_signature: 'deadbeef',
            plan_id: 'starter',
          })
          .expect(400);
        assert.deepEqual(response.body, {
          detail: 'Invalid payment signature. Verification failed.',
        });
      },
      devConfig({ RAZORPAY_KEY_SECRET: 'checkout-secret' }),
    );
  });

  it('returns 400 for an unknown plan after a valid signature', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app)
        .post('/api/payments/verify')
        .send({
          razorpay_order_id: 'order_1',
          razorpay_payment_id: 'pay_1',
          razorpay_signature: 'mock_valid_signature',
          plan_id: 'nope',
        })
        .expect(400);
      assert.deepEqual(response.body, { detail: "Plan 'nope' does not exist." });
    });
  });
});

describe('POST /api/payments/consume-credit', () => {
  it('deducts credits and returns the consumption result', async () => {
    await withApp(async ({ app, service }) => {
      await service.activateSubscription(
        'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3',
        'starter',
        'order_1',
        'pay_1',
      );

      const response = await request(app)
        .post('/api/payments/consume-credit')
        .send({ amount: 5, reason: 'candidate_analysis' })
        .expect(200);
      assert.deepEqual(response.body, {
        success: true,
        credits_remaining: 55,
        amount_deducted: 5,
        reason: 'candidate_analysis',
      });

      const defaults = await request(app).post('/api/payments/consume-credit').send({}).expect(200);
      assert.deepEqual(defaults.body, {
        success: true,
        credits_remaining: 54,
        amount_deducted: 1,
        reason: 'candidate_analysis',
      });
    });
  });

  it('returns HTTP 402 with a plain-string detail when credits are insufficient', async () => {
    await withApp(async ({ app, service }) => {
      await service.activateSubscription(
        'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3',
        'starter',
        'order_1',
        'pay_1',
      );

      const response = await request(app)
        .post('/api/payments/consume-credit')
        .send({ amount: 61 })
        .expect(402);
      assert.deepEqual(response.body, {
        detail: 'Insufficient credits. Remaining: 60, required: 61',
      });
    });
  });

  it('validates the amount with the Pydantic ge=1 rule', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app)
        .post('/api/payments/consume-credit')
        .send({ amount: 0 })
        .expect(422);
      assert.equal(response.body.detail[0].type, 'greater_than_equal');
      assert.deepEqual(response.body.detail[0].loc, ['body', 'amount']);
    });
  });
});

describe('POST /api/payments/webhook', () => {
  it('reports malformed JSON with its own 400 (not body-parser 422)', async () => {
    await withApp(async ({ app }) => {
      const webhook = await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .send('{"event":')
        .expect(400);
      assert.deepEqual(webhook.body, {
        detail: 'Invalid JSON payload in webhook body.',
      });

      // Other routes keep FastAPI's malformed-JSON 422.
      const order = await request(app)
        .post('/api/payments/order')
        .set('Content-Type', 'application/json')
        .send('{"plan_id":')
        .expect(422);
      assert.equal(order.body.detail[0].type, 'json_invalid');
    });
  });

  it('processes captured payments and activates the subscription', async () => {
    await withApp(async ({ app }) => {
      const event = capturedEvent({
        user_id: 'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3',
      });
      const response = await request(app).post('/api/payments/webhook').send(event).expect(200);

      assert.deepEqual(response.body, {
        status: 'ok',
        received: true,
        result: {
          status: 'processed',
          event: 'payment.captured',
          subscription_activated: true,
          plan_id: 'starter',
          user_id: 'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3',
          credits_remaining: 60,
        },
      });

      const status = await request(app).get('/api/payments/status').expect(200);
      assert.equal(status.body.credits_remaining, 60);
      assert.equal(status.body.plan_id, 'starter');
    });
  });

  it('accepts unsigned webhooks when no secret is configured', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app)
        .post('/api/payments/webhook')
        .send({ event: 'refund.created' })
        .expect(200);
      assert.deepEqual(response.body.result, { status: 'ignored', event: 'refund.created' });
    });
  });

  it('verifies the signature over the raw body when configured', async () => {
    const secret = 'webhook-secret';
    await withApp(
      async ({ app }) => {
        const event = capturedEvent({
          user_id: 'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3',
        });
        const rawBody = JSON.stringify(event);

        const rejected = await request(app)
          .post('/api/payments/webhook')
          .set('Content-Type', 'application/json')
          .set('x-razorpay-signature', 'wrong')
          .send(rawBody)
          .expect(400);
        assert.deepEqual(rejected.body, { detail: 'Invalid webhook signature.' });

        const signature = createHmac('sha256', secret).update(rawBody).digest('hex');
        const accepted = await request(app)
          .post('/api/payments/webhook')
          .set('Content-Type', 'application/json')
          .set('x-razorpay-signature', signature)
          .send(rawBody)
          .expect(200);
        assert.equal(accepted.body.result.status, 'processed');
      },
      devConfig({ RAZORPAY_WEBHOOK_SECRET: secret }),
    );
  });

  it('returns skipped for activation events without notes', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app)
        .post('/api/payments/webhook')
        .send({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1' } } } })
        .expect(200);
      assert.deepEqual(response.body.result, {
        status: 'skipped',
        event: 'payment.captured',
        reason: 'Missing user_id or plan_id in payload notes',
      });
    });
  });

  it('cancels a subscription from a cancellation webhook', async () => {
    await withApp(async ({ app }) => {
      const userId = 'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3';
      await request(app)
        .post('/api/payments/webhook')
        .send(capturedEvent({ user_id: userId }))
        .expect(200);

      await request(app)
        .post('/api/payments/webhook')
        .send({
          event: 'subscription.cancelled',
          payload: { subscription: { entity: { notes: { user_id: userId } } } },
        })
        .expect(200);

      const status = await request(app).get('/api/payments/status').expect(200);
      assert.equal(status.body.status, 'canceled');
    });
  });
});
