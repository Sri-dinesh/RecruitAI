import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import request from 'supertest';

import { createApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/config/index.js';
import { FallbackDatabase } from '../src/db/fallback.js';
import { createSqliteOutreachStore, type OutreachStore } from '../src/db/outreach-store.js';
import { createSqlitePaymentStore } from '../src/db/payment-store.js';
import type { EmailRequest } from '../src/schemas/email.js';
import {
  createEmailService,
  EmailService,
  type EmailSender,
} from '../src/services/email-service.js';
import { PaymentService } from '../src/services/payment-service.js';
import { sendEmailDraft } from '../src/tools/email-tool.js';

const JWT_SECRET = 'test-secret-key-that-is-at-least-32-bytes-long';
const USER_ID = 'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3';
const NOW = new Date('2026-11-14T10:00:00.000Z');
const SIMULATED_SUCCESS =
  'ℹ️ **Simulated outreach dispatch (SMTP simulation mode).**\n' +
  'Recipient: `al***@example.com`\n' +
  'Status: Recorded in hiring campaign.';
const SMTP_SUCCESS =
  '✅ **Email sent successfully via SMTP!**\n' +
  'Recipient: `ada@example.com`\n' +
  'Subject: `Interview`\n' +
  'Server: `smtp.test:587`';
const SMTP_FAILURE =
  '❌ **Failed to send email via SMTP:** connection refused\nRecipient: `ada@example.com`';

function devConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
  return loadConfig({
    USE_LOCAL_AUTH: 'true',
    SMTP_USERNAME: '',
    SMTP_PASSWORD: '',
    ...overrides,
  });
}

function jwtConfig(): AppConfig {
  return loadConfig({
    USE_LOCAL_AUTH: 'false',
    SUPABASE_JWT_SECRET: JWT_SECRET,
    SMTP_USERNAME: '',
    SMTP_PASSWORD: '',
  });
}

interface Harness {
  readonly app: ReturnType<typeof createApp>;
  readonly db: FallbackDatabase;
  readonly paymentService: PaymentService;
  readonly emailService: EmailService;
  readonly outreachStore: OutreachStore;
  readonly config: AppConfig;
}

interface HarnessOptions {
  readonly config?: AppConfig;
  readonly sender?: EmailSender;
}

/** Clock that advances one second per log write so ordering is deterministic. */
function clock(): () => Date {
  let tick = 0;
  return () => new Date(NOW.getTime() + tick++ * 1000);
}

async function withApp<T>(
  fn: (harness: Harness) => Promise<T> | T,
  options: HarnessOptions = {},
): Promise<T> {
  const config = options.config ?? devConfig();
  const db = new FallbackDatabase(':memory:', config);
  try {
    const paymentService = new PaymentService({
      config,
      store: createSqlitePaymentStore(db),
      now: () => NOW,
    });
    const outreachStore = createSqliteOutreachStore(db);
    const sender =
      options.sender ??
      ((draft: string, recipient: string) =>
        sendEmailDraft(draft, recipient, { config, log: () => undefined }));
    const emailService = createEmailService({
      config,
      paymentService,
      store: outreachStore,
      sendEmailDraft: sender,
      now: clock(),
    });
    const app = createApp({ config, paymentService, emailService });
    return await fn({ app, db, paymentService, emailService, outreachStore, config });
  } finally {
    db.close();
  }
}

function sendPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    recipient_email: 'alice@example.com',
    subject: 'Interview Invite',
    body: 'Dear Alice, we would like to invite you.',
    candidate_id: 'candidate-1',
    template_id: 'interview',
    ...overrides,
  };
}

/** Service-level payload (the schema wants every optional key present). */
function emailRequest(overrides: Record<string, unknown> = {}): EmailRequest {
  return sendPayload(overrides) as unknown as EmailRequest;
}

function logsFor(db: FallbackDatabase, userId = USER_ID): Array<Record<string, unknown>> {
  return db.table('outreach_logs').select().eq('user_id', userId).execute().data;
}

describe('email authentication', () => {
  it('requires a bearer token on all three routes', async () => {
    await withApp(
      async ({ app }) => {
        await request(app).post('/api/email/send').send(sendPayload()).expect(401);
        await request(app).get('/api/email/history').expect(401);
        await request(app).get('/api/email/stats').expect(401);
      },
      { config: jwtConfig() },
    );
  });
});

describe('POST /api/email/send', () => {
  it('simulates dispatch, deducts one credit, and logs the outreach', async () => {
    await withApp(async ({ app, db }) => {
      const response = await request(app).post('/api/email/send').send(sendPayload()).expect(200);

      assert.deepEqual(response.body, {
        status: SIMULATED_SUCCESS,
        log_id: response.body.log_id,
        dispatch_type: 'simulated',
        credits_remaining: 9,
      });
      assert.match(response.body.log_id, /^[0-9a-f-]{36}$/);

      const row = logsFor(db)[0];
      assert.equal(row?.id, response.body.log_id);
      assert.equal(row?.user_id, USER_ID);
      assert.equal(row?.candidate_id, 'candidate-1');
      assert.equal(row?.recipient_email, 'alice@example.com');
      assert.equal(row?.subject, 'Interview Invite');
      assert.equal(row?.body, 'Dear Alice, we would like to invite you.');
      assert.equal(row?.template_id, 'interview');
      assert.equal(row?.status, 'simulated');
      assert.equal(row?.error_message, null);
      assert.equal(row?.created_at, '2026-11-14T10:00:00.000Z');

      const transaction = db.table('credit_transactions').select().eq('user_id', USER_ID).execute()
        .data[0];
      assert.equal(transaction?.amount, -1);
      assert.equal(transaction?.balance_after, 9);
      assert.equal(transaction?.reason, 'Candidate outreach email to alice@example.com');
    });
  });

  it('records SMTP success with dispatch_type smtp', async () => {
    const drafts: string[] = [];
    await withApp(
      async ({ app, db }) => {
        const response = await request(app)
          .post('/api/email/send')
          .send(sendPayload({ recipient_email: 'ada@example.com' }))
          .expect(200);

        assert.equal(response.body.status, SMTP_SUCCESS);
        assert.equal(response.body.dispatch_type, 'smtp');
        assert.equal(response.body.credits_remaining, 9);

        const row = logsFor(db)[0];
        assert.equal(row?.status, 'sent');
        assert.equal(row?.error_message, null);
        assert.match(drafts[0] ?? '', /Subject: Interview Invite/);
      },
      {
        sender: async (draft) => {
          drafts.push(draft);
          return SMTP_SUCCESS;
        },
      },
    );
  });

  it('logs an SMTP failure and returns a 500 without deducting credits', async () => {
    await withApp(
      async ({ app, db }) => {
        const response = await request(app)
          .post('/api/email/send')
          .send(sendPayload({ recipient_email: 'ada@example.com' }))
          .expect(500);

        assert.deepEqual(response.body, { detail: `SMTP dispatch failure: ${SMTP_FAILURE}` });

        const row = logsFor(db)[0];
        assert.equal(row?.status, 'failed');
        assert.equal(row?.error_message, SMTP_FAILURE);
        assert.equal(db.table('credit_transactions').select().execute().data.length, 0);
        // No consumption ran, so no row for this user was materialised either.
        assert.equal(db.table('users').select().eq('id', USER_ID).execute().data.length, 0);
      },
      { sender: async () => SMTP_FAILURE },
    );
  });

  it('returns a referenced 500 when the dispatch tool throws', async () => {
    await withApp(
      async ({ app, db }) => {
        const response = await request(app).post('/api/email/send').send(sendPayload()).expect(500);

        assert.match(
          response.body.detail,
          /^Email dispatch failed\. Please contact support with reference ref=[0-9a-f]{8}$/,
        );
        assert.equal(logsFor(db).length, 0);
      },
      {
        sender: async () => {
          throw new Error('provider exploded');
        },
      },
    );
  });

  it('classifies unknown tool output as a simulated dispatch', async () => {
    await withApp(
      async ({ app, db }) => {
        const response = await request(app).post('/api/email/send').send(sendPayload()).expect(200);
        assert.equal(response.body.status, 'queued');
        assert.equal(response.body.dispatch_type, 'simulated');
        assert.equal(logsFor(db)[0]?.status, 'simulated');
      },
      { sender: async () => 'queued' },
    );
  });

  it('returns the structured 402 body when outreach credits are exhausted', async () => {
    let called = false;
    await withApp(
      async ({ app, db, paymentService }) => {
        const store = createSqlitePaymentStore(db);
        await store.insertUser({
          id: USER_ID,
          email: 'recruiter@example.com',
          fullName: 'Recruiter',
          role: 'recruiter',
          creditsBalance: 0,
        });

        const response = await request(app).post('/api/email/send').send(sendPayload()).expect(402);
        assert.deepEqual(response.body, {
          detail: {
            error: 'INSUFFICIENT_CREDITS',
            message: 'Candidate outreach quota exhausted. Please upgrade to continue.',
            upgrade_url: '/pricing',
          },
        });
        assert.equal(await paymentService.getUserCredits(USER_ID), 0);
        assert.equal(logsFor(db).length, 0);
        assert.equal(called, false);
      },
      {
        sender: async () => {
          called = true;
          return SMTP_SUCCESS;
        },
      },
    );
  });

  it('validates and trims the recipient email', async () => {
    await withApp(async ({ app, db }) => {
      const invalid = await request(app)
        .post('/api/email/send')
        .send(sendPayload({ recipient_email: 'not-an-email' }))
        .expect(422);
      assert.equal(invalid.body.detail[0].type, 'value_error');
      assert.deepEqual(invalid.body.detail[0].loc, ['body', 'recipient_email']);
      assert.equal(
        invalid.body.detail[0].msg,
        "Value error, Invalid recipient email format: 'not-an-email'",
      );

      const missing = await request(app)
        .post('/api/email/send')
        .send({ subject: 'Hi' })
        .expect(422);
      assert.equal(missing.body.detail[0].type, 'missing');
      assert.deepEqual(missing.body.detail[0].loc, ['body', 'recipient_email']);

      await request(app)
        .post('/api/email/send')
        .send(sendPayload({ recipient_email: '  spaced@example.com  ' }))
        .expect(200);
      const row = logsFor(db).find((entry) => entry.recipient_email === 'spaced@example.com');
      assert.ok(row);
    });
  });

  it('prefers explicit subject/body fields over the draft', async () => {
    await withApp(async ({ app, db }) => {
      await request(app)
        .post('/api/email/send')
        .send(
          sendPayload({
            email_draft: 'Subject: Draft subject\n\nDraft body',
            subject: 'Explicit subject',
            body: 'Explicit body',
          }),
        )
        .expect(200);

      const row = logsFor(db)[0];
      assert.equal(row?.subject, 'Explicit subject');
      assert.equal(row?.body, 'Explicit body');
    });
  });

  it('derives a missing subject from the draft', async () => {
    await withApp(async ({ app, db }) => {
      await request(app)
        .post('/api/email/send')
        .send({
          recipient_email: 'alice@example.com',
          email_draft: 'Subject: From the draft\n\nDear Alice,',
        })
        .expect(200);

      const row = logsFor(db)[0];
      assert.equal(row?.subject, 'From the draft');
      assert.equal(row?.body, 'Dear Alice,');
    });
  });
});

describe('GET /api/email/history', () => {
  it('returns newest-first, tenant-scoped history with optional candidate filter', async () => {
    await withApp(async ({ app, outreachStore }) => {
      for (const [recipient, candidate] of [
        ['one@example.com', 'candidate-1'],
        ['two@example.com', 'candidate-2'],
        ['three@example.com', 'candidate-1'],
      ] as const) {
        await request(app)
          .post('/api/email/send')
          .send(sendPayload({ recipient_email: recipient, candidate_id: candidate }))
          .expect(200);
      }

      // Another tenant's row must never leak.
      await outreachStore.insertLog({
        id: '00000000-0000-4000-8000-000000000001',
        userId: 'someone-else',
        candidateId: 'candidate-1',
        recipientEmail: 'other@example.com',
        subject: 'Other',
        body: 'Other',
        templateId: null,
        status: 'simulated',
        errorMessage: null,
        createdAt: new Date(NOW.getTime() + 60_000),
      });

      const all = await request(app).get('/api/email/history').expect(200);
      assert.equal(all.body.total, 3);
      assert.deepEqual(
        all.body.items.map((item: { recipient_email: string }) => item.recipient_email),
        ['three@example.com', 'two@example.com', 'one@example.com'],
      );
      assert.deepEqual(Object.keys(all.body.items[0]).sort(), [
        'body',
        'candidate_id',
        'created_at',
        'error_message',
        'id',
        'recipient_email',
        'status',
        'subject',
        'template_id',
        'user_id',
      ]);

      const filtered = await request(app)
        .get('/api/email/history')
        .query({ candidate_id: 'candidate-1' })
        .expect(200);
      assert.equal(filtered.body.total, 2);

      const limited = await request(app).get('/api/email/history').query({ limit: 1 }).expect(200);
      assert.equal(limited.body.items.length, 1);
      assert.equal(limited.body.items[0].recipient_email, 'three@example.com');
    });
  });

  it('validates the limit with the FastAPI Query bounds', async () => {
    await withApp(async ({ app }) => {
      for (const [limit, type] of [
        [0, 'greater_than_equal'],
        [101, 'less_than_equal'],
      ] as const) {
        const response = await request(app).get('/api/email/history').query({ limit }).expect(422);
        assert.equal(response.body.detail[0].type, type);
        assert.deepEqual(response.body.detail[0].loc, ['query', 'limit']);
      }
    });
  });

  it('returns an empty result when the database read fails', async () => {
    const config = devConfig();
    const failing: OutreachStore = {
      insertLog: async () => undefined,
      listLogs: async () => {
        throw new Error('database down');
      },
      listStatuses: async () => {
        throw new Error('database down');
      },
    };
    const service = new EmailService({ config, store: failing });

    assert.deepEqual(await service.getHistory(USER_ID), { total: 0, items: [] });
    assert.deepEqual(await service.getStats(USER_ID), {
      total_sent: 0,
      smtp_count: 0,
      simulated_count: 0,
      failed_count: 0,
    });
  });
});

describe('GET /api/email/stats', () => {
  it('counts sent/simulated/failed statuses for the tenant', async () => {
    await withApp(
      async ({ app, db, outreachStore }) => {
        await request(app).post('/api/email/send').send(sendPayload()).expect(200);
        await request(app).post('/api/email/send').send(sendPayload()).expect(200);

        // SMTP success (sent) and SMTP failure (failed).
        const smtpService = createEmailService({
          config: devConfig(),
          paymentService: new PaymentService({
            config: devConfig(),
            store: createSqlitePaymentStore(db),
            now: () => NOW,
          }),
          store: outreachStore,
          sendEmailDraft: async () => SMTP_SUCCESS,
          now: () => new Date(NOW.getTime() + 10_000),
        });
        await smtpService.sendEmail(emailRequest({ recipient_email: 'ada@example.com' }), USER_ID);

        const failingService = createEmailService({
          config: devConfig(),
          paymentService: new PaymentService({
            config: devConfig(),
            store: createSqlitePaymentStore(db),
            now: () => NOW,
          }),
          store: outreachStore,
          sendEmailDraft: async () => SMTP_FAILURE,
          now: () => new Date(NOW.getTime() + 20_000),
        });
        await assert.rejects(
          failingService.sendEmail(emailRequest({ recipient_email: 'ada@example.com' }), USER_ID),
        );

        // Another tenant's failed row must not be counted.
        await outreachStore.insertLog({
          id: '00000000-0000-4000-8000-000000000002',
          userId: 'someone-else',
          candidateId: null,
          recipientEmail: 'other@example.com',
          subject: 'Other',
          body: 'Other',
          templateId: null,
          status: 'failed',
          errorMessage: 'x',
          createdAt: new Date(NOW.getTime() + 30_000),
        });

        const response = await request(app).get('/api/email/stats').expect(200);
        assert.deepEqual(response.body, {
          total_sent: 4,
          smtp_count: 1,
          simulated_count: 2,
          failed_count: 1,
        });
      },
      { sender: async () => SIMULATED_SUCCESS },
    );
  });

  it('returns zeroed stats for a user without outreach', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app).get('/api/email/stats').expect(200);
      assert.deepEqual(response.body, {
        total_sent: 0,
        smtp_count: 0,
        simulated_count: 0,
        failed_count: 0,
      });
    });
  });
});
