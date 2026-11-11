import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import express, { type Request } from 'express';
import request from 'supertest';

import { errorHandler, notFoundHandler } from '../src/middleware/error-handler.js';
import { jsonBodyParser } from '../src/middleware/json-body.js';
import { resumeUpload } from '../src/middleware/upload.js';
import {
  getValidatedHeaders,
  getValidatedQuery,
  validateBody,
  validateForm,
  validateHeaders,
  validateQuery,
} from '../src/middleware/validate.js';
import {
  analyticsDaysQuerySchema,
  candidateEvaluationRequestSchema,
  consumeCreditRequestSchema,
  emailRequestSchema,
  ingestFormSchema,
  razorpayWebhookHeadersSchema,
  retentionRunRequestSchema,
} from '../src/schemas/index.js';

function buildJsonApp(limit?: string) {
  const app = express();
  app.use(limit === undefined ? jsonBodyParser : express.json({ strict: false, limit }));

  app.post('/email', validateBody(emailRequestSchema), (req, res) => {
    res.json(req.body);
  });
  app.post('/credit', validateBody(consumeCreditRequestSchema), (req, res) => {
    res.json(req.body);
  });
  app.post('/evaluation', validateBody(candidateEvaluationRequestSchema), (req, res) => {
    res.json(req.body);
  });
  app.post(
    '/retention',
    validateBody(retentionRunRequestSchema, { required: false }),
    (req, res) => {
      res.json(req.body);
    },
  );

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function buildQueryApp() {
  const app = express();
  app.get('/days', validateQuery(analyticsDaysQuerySchema), (req, res) => {
    res.json(getValidatedQuery<{ days: number }>(req));
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function buildHeaderApp() {
  const app = express();
  app.post('/webhook', validateHeaders(razorpayWebhookHeadersSchema), (req, res) => {
    res.json(getValidatedHeaders<{ 'x-razorpay-signature': string | null }>(req));
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function buildFormApp() {
  const app = express();
  app.post('/ingest', resumeUpload, validateForm(ingestFormSchema), (req, res) => {
    res.json(req.body);
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe('validateBody', () => {
  it('replaces req.body with coerced, trimmed values and strips unknown keys', async () => {
    const response = await request(buildJsonApp())
      .post('/email')
      .send({ recipient_email: '  a@b.co ', unknown: 'drop-me' })
      .expect(200);

    assert.deepEqual(response.body, {
      recipient_email: 'a@b.co',
      email_draft: null,
      subject: null,
      body: null,
      candidate_id: null,
      template_id: null,
    });
  });

  it('returns the exact FastAPI 422 shape for field errors', async () => {
    const response = await request(buildJsonApp()).post('/credit').send({ amount: 0 }).expect(422);

    assert.deepEqual(response.body, {
      detail: [
        {
          type: 'greater_than_equal',
          loc: ['body', 'amount'],
          msg: 'Input should be greater than or equal to 1',
          input: 0,
          ctx: { ge: 1 },
        },
      ],
    });
  });

  it('reports both missing scores with the parent input object', async () => {
    const response = await request(buildJsonApp())
      .post('/evaluation')
      .send({ candidate_id: 'c1' })
      .expect(422);

    assert.deepEqual(response.body, {
      detail: [
        {
          type: 'missing',
          loc: ['body', 'tech_score'],
          msg: 'Field required',
          input: { candidate_id: 'c1' },
        },
        {
          type: 'missing',
          loc: ['body', 'comm_score'],
          msg: 'Field required',
          input: { candidate_id: 'c1' },
        },
      ],
    });
  });

  it('treats a missing body as FastAPI missing on ["body"]', async () => {
    const response = await request(buildJsonApp()).post('/credit').expect(422);
    assert.deepEqual(response.body, {
      detail: [{ type: 'missing', loc: ['body'], msg: 'Field required', input: null }],
    });
  });

  it('treats an explicit JSON null body as missing', async () => {
    const response = await request(buildJsonApp())
      .post('/credit')
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(422);

    assert.deepEqual(response.body, {
      detail: [{ type: 'missing', loc: ['body'], msg: 'Field required', input: null }],
    });
  });

  it('reports model_attributes_type for non-object JSON roots', async () => {
    for (const [body, expectedInput] of [
      ['[1,2]', [1, 2]],
      ['"hi"', 'hi'],
      ['5', 5],
      ['true', true],
    ] as const) {
      const response = await request(buildJsonApp())
        .post('/credit')
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(422);

      assert.deepEqual(response.body, {
        detail: [
          {
            type: 'model_attributes_type',
            loc: ['body'],
            msg: 'Input should be a valid dictionary or object to extract fields from',
            input: expectedInput,
          },
        ],
      });
    }
  });

  it('maps malformed JSON to FastAPI json_invalid (422, not 400)', async () => {
    const response = await request(buildJsonApp())
      .post('/credit')
      .set('Content-Type', 'application/json')
      .send('{oops')
      .expect(422);

    const detail = response.body.detail as Array<Record<string, unknown>>;
    assert.equal(detail.length, 1);
    const [error] = detail;
    assert.ok(error);
    const loc = error['loc'] as unknown[];
    assert.equal(error['type'], 'json_invalid');
    assert.equal(loc[0], 'body');
    assert.equal(typeof loc[1], 'number');
    assert.equal(error['msg'], 'JSON decode error');
    assert.deepEqual(error['input'], {});
    assert.equal(typeof (error['ctx'] as Record<string, unknown>)['error'], 'string');
  });

  it('maps an oversized body to 413', async () => {
    const response = await request(buildJsonApp('10b'))
      .post('/credit')
      .send({ amount: 1, reason: 'this body is definitely too large' })
      .expect(413);

    assert.deepEqual(response.body, { detail: 'Request body too large.' });
  });

  it('uses schema defaults when the body is optional and absent or null', async () => {
    const missing = await request(buildJsonApp()).post('/retention').expect(200);
    assert.deepEqual(missing.body, { raw_resume_ttl_days: 90, chat_ttl_days: 365 });

    const nullBody = await request(buildJsonApp())
      .post('/retention')
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(200);
    assert.deepEqual(nullBody.body, { raw_resume_ttl_days: 90, chat_ttl_days: 365 });
  });

  it('still rejects a non-object body when the body is optional', async () => {
    const response = await request(buildJsonApp())
      .post('/retention')
      .set('Content-Type', 'application/json')
      .send('[1]')
      .expect(422);

    assert.equal(response.body.detail[0].type, 'model_attributes_type');
  });
});

describe('validateQuery', () => {
  it('applies defaults and exposes the parsed value', async () => {
    const response = await request(buildQueryApp()).get('/days').expect(200);
    assert.deepEqual(response.body, { days: 30 });
  });

  it('coerces and validates the value', async () => {
    const valid = await request(buildQueryApp()).get('/days?days=30.0').expect(200);
    assert.deepEqual(valid.body, { days: 30 });

    const invalid = await request(buildQueryApp()).get('/days?days=5').expect(422);
    assert.deepEqual(invalid.body, {
      detail: [
        {
          type: 'greater_than_equal',
          loc: ['query', 'days'],
          msg: 'Input should be greater than or equal to 7',
          input: '5',
          ctx: { ge: 7 },
        },
      ],
    });
  });

  it('uses the last repeated scalar value, matching FastAPI', async () => {
    const response = await request(buildQueryApp()).get('/days?days=7&days=9').expect(200);
    assert.deepEqual(response.body, { days: 9 });
  });

  it('throws if a handler reads query values without the middleware', () => {
    assert.throws(() => getValidatedQuery({} as Request), /validateQuery middleware has not run/);
  });
});

describe('validateHeaders', () => {
  it('defaults the optional webhook signature to null', async () => {
    const response = await request(buildHeaderApp()).post('/webhook').expect(200);
    assert.deepEqual(response.body, { 'x-razorpay-signature': null });
  });

  it('passes a present signature through unchanged', async () => {
    const response = await request(buildHeaderApp())
      .post('/webhook')
      .set('x-razorpay-signature', 'sig-123')
      .expect(200);
    assert.deepEqual(response.body, { 'x-razorpay-signature': 'sig-123' });
  });

  it('throws if a handler reads headers without the middleware', () => {
    assert.throws(
      () => getValidatedHeaders({} as Request),
      /validateHeaders middleware has not run/,
    );
  });
});

describe('validateForm', () => {
  it('defaults session_id to null when the multipart field is absent', async () => {
    const response = await request(buildFormApp())
      .post('/ingest')
      .attach('files', Buffer.from('resume'), 'resume.txt')
      .expect(200);
    assert.deepEqual(response.body, { session_id: null });
  });

  it('keeps a multipart session_id value', async () => {
    const response = await request(buildFormApp())
      .post('/ingest')
      .field('session_id', 'sess-1')
      .attach('files', Buffer.from('resume'), 'resume.txt')
      .expect(200);
    assert.deepEqual(response.body, { session_id: 'sess-1' });
  });
});
