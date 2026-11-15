import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SignJWT } from 'jose';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/config/index.js';
import { FallbackDatabase } from '../src/db/fallback.js';
import { createSqliteWorkspaceStore, type WorkspaceStore } from '../src/db/workspace-store.js';
import { InMemoryChatJobManager } from '../src/jobs/in-memory-job-manager.js';
import { CampaignService, type ExecuteAgentTurnInput } from '../src/services/campaign-service.js';
import { fakeDeps } from './graph-helpers.js';

const JWT_SECRET = 'test-secret-key-that-is-at-least-32-bytes-long';
const USER_ID = 'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3';
const OTHER_USER = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function devConfig(): AppConfig {
  return loadConfig({
    USE_LOCAL_AUTH: 'true',
    LOCAL_DEV_USER_ID: USER_ID,
    GEMINI_API_KEY: '',
    GOOGLE_API_KEY: '',
  });
}

function jwtConfig(): AppConfig {
  return loadConfig({
    USE_LOCAL_AUTH: 'false',
    SUPABASE_JWT_SECRET: JWT_SECRET,
    GEMINI_API_KEY: '',
    GOOGLE_API_KEY: '',
  });
}

async function signToken(userId: string): Promise<string> {
  return new SignJWT({
    sub: userId,
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .sign(new TextEncoder().encode(JWT_SECRET));
}

interface Harness {
  readonly app: ReturnType<typeof createApp>;
  readonly db: FallbackDatabase;
  readonly store: WorkspaceStore;
  readonly service: CampaignService;
  readonly manager: InMemoryChatJobManager;
  readonly config: AppConfig;
}

interface HarnessOptions {
  readonly config?: AppConfig;
  /** Override the turn execution; defaults to the real campaign service. */
  readonly execute?: (input: ExecuteAgentTurnInput) => Promise<unknown>;
}

async function withApp<T>(
  fn: (harness: Harness) => Promise<T> | T,
  options: HarnessOptions = {},
): Promise<T> {
  const config = options.config ?? devConfig();
  const db = new FallbackDatabase(':memory:', config);
  try {
    const store = createSqliteWorkspaceStore(db);
    const service = new CampaignService({ config, store, graphDeps: fakeDeps() });
    const campaign = options.execute
      ? (new Proxy(service, {
          get(target, property, receiver) {
            if (property === 'executeAgentTurn') {
              return options.execute;
            }
            return Reflect.get(target, property, receiver) as unknown;
          },
        }) as CampaignService)
      : service;

    const manager = new InMemoryChatJobManager({
      runner: (payload) => campaign.executeAgentTurn(payload as unknown as ExecuteAgentTurnInput),
      schedule: (task) => task(),
    });
    const app = createApp({ config, campaignService: campaign, chatJobManager: manager });
    return await fn({ app, db, store, service, manager, config });
  } finally {
    db.close();
  }
}

function getJob(app: ReturnType<typeof createApp>, jobId: string): request.Test {
  return request(app).get(`/api/chat/jobs/${jobId}`);
}

async function waitForJob(
  app: ReturnType<typeof createApp>,
  jobId: string,
  statuses: readonly string[] = ['completed', 'failed'],
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await getJob(app, jobId).expect(200);
    const body = response.body as Record<string, unknown>;
    if (statuses.includes(String(body.status))) {
      return body;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Job ${jobId} did not reach ${statuses.join('/')}`);
}

describe('POST /api/chat (synchronous)', () => {
  it('runs the agent turn and returns the ChatResponse shape', async () => {
    await withApp(async ({ app, db }) => {
      const response = await request(app)
        .post('/api/chat')
        .send({ message: 'hello', conversation_history: [] })
        .expect(200);

      const body = response.body as Record<string, unknown>;
      assert.equal(typeof body.response, 'string');
      assert.match(String(body.response), /Here are some of the things I can help you with/);
      assert.equal(body.last_intent, 'other');
      assert.match(String(body.session_id), UUID_RE);
      assert.equal(body.jd_structured, null);
      assert.deepEqual(body.resumes, []);
      assert.equal(body.last_shortlist, null);
      assert.equal(body.pending_confirmation, null);
      assert.ok(Array.isArray(body.router_logs));
      assert.equal(body.scheduled_interviews, null);

      const history = body.conversation_history as Array<Record<string, unknown>>;
      assert.equal(history.length, 2);
      assert.equal(history[0]?.role, 'user');
      assert.equal(history[0]?.content, 'hello');
      assert.equal(history[1]?.role, 'assistant');

      // Session + both messages were persisted.
      const sessions = db.table('chat_sessions').select().execute().data;
      assert.equal(sessions.length, 1);
      assert.equal(sessions[0]?.id, body.session_id);
      assert.equal(db.table('chat_messages').select().execute().data.length, 2);
    });
  });

  it('reuses the provided session id', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app)
        .post('/api/chat')
        .send({ message: 'how many candidates?', session_id: SESSION })
        .expect(200);

      assert.equal(response.body.session_id, SESSION);
    });
  });

  it('returns FastAPI validation errors for a missing message', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app).post('/api/chat').send({}).expect(422);
      const detail = response.body.detail as Array<Record<string, unknown>>;
      assert.equal(detail[0]?.type, 'missing');
      assert.deepEqual(detail[0]?.loc, ['body', 'message']);
    });
  });

  it('validates the async_mode query parameter', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app)
        .post('/api/chat?async_mode=maybe')
        .send({ message: 'hello' })
        .expect(422);

      const detail = response.body.detail as Array<Record<string, unknown>>;
      assert.deepEqual(detail[0]?.loc, ['query', 'async_mode']);
    });
  });

  it('rejects non-object JSON bodies like FastAPI', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app)
        .post('/api/chat')
        .set('Content-Type', 'application/json')
        .send('[]')
        .expect(422);

      assert.equal(
        (response.body.detail as Array<Record<string, unknown>>)[0]?.type,
        'model_attributes_type',
      );
    });
  });

  it('maps an agent failure to the Python 500 body with a ref', async () => {
    await withApp(
      async ({ app }) => {
        const response = await request(app)
          .post('/api/chat')
          .send({ message: 'hello' })
          .expect(500);

        assert.match(
          String((response.body as Record<string, unknown>).detail),
          /^Agent execution failed\. \(ref=[0-9a-f]{8}\)$/,
        );
      },
      {
        execute: async () => {
          throw new Error('graph down');
        },
      },
    );
  });
});

describe('POST /api/chat (asynchronous jobs)', () => {
  it('returns 202 with job metadata when async_mode is in the body', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app)
        .post('/api/chat')
        .send({ message: 'hello', async_mode: true })
        .expect(202);

      const body = response.body as Record<string, unknown>;
      assert.match(String(body.job_id), UUID_RE);
      assert.match(String(body.session_id), UUID_RE);
      assert.equal(body.status, 'queued');
      assert.equal(body.check_url, `/api/chat/jobs/${body.job_id}`);
      assert.equal(body.stream_url, `/api/chat/jobs/${body.job_id}/stream`);
    });
  });

  it('accepts the async_mode query parameter too', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app)
        .post('/api/chat?async_mode=true')
        .send({ message: 'hello' })
        .expect(202);

      assert.match(String(response.body.job_id), UUID_RE);
    });
  });

  it('completes the background turn and exposes the result', async () => {
    await withApp(async ({ app }) => {
      const queued = await request(app)
        .post('/api/chat')
        .send({ message: 'hello', async_mode: true })
        .expect(202);

      const finished = await waitForJob(app, String(queued.body.job_id));
      assert.equal(finished.status, 'completed');
      assert.equal(finished.steps_count, 0);
      assert.equal(finished.error, null);

      const result = finished.result as Record<string, unknown>;
      assert.match(String(result.response), /Here are some of the things I can help you with/);
      assert.equal(result.last_intent, 'other');
      assert.match(String(result.session_id), UUID_RE);
    });
  });

  it('returns the Python job status shape', async () => {
    await withApp(async ({ app }) => {
      const queued = await request(app)
        .post('/api/chat')
        .send({ message: 'hello', async_mode: true })
        .expect(202);

      const response = await getJob(app, String(queued.body.job_id)).expect(200);
      assert.deepEqual(Object.keys(response.body as Record<string, unknown>), [
        'job_id',
        'session_id',
        'status',
        'created_at',
        'updated_at',
        'steps_count',
        'result',
        'error',
      ]);
    });
  });

  it('returns 404 for an unknown job', async () => {
    await withApp(async ({ app }) => {
      const response = await getJob(app, '00000000-0000-4000-8000-000000000000').expect(404);
      assert.deepEqual(response.body, { detail: 'Agent job not found.' });
    });
  });
});

describe('GET /api/chat/jobs/:id/stream', () => {
  it('streams init and complete for a finished job', async () => {
    await withApp(async ({ app }) => {
      const queued = await request(app)
        .post('/api/chat')
        .send({ message: 'hello', async_mode: true })
        .expect(202);
      await waitForJob(app, String(queued.body.job_id));

      const response = await request(app)
        .get(`/api/chat/jobs/${queued.body.job_id}/stream`)
        .expect(200);

      assert.match(String(response.headers['content-type']), /text\/event-stream/);
      assert.equal(response.headers['cache-control'], 'no-cache');
      assert.match(String(response.text), /^event: init\ndata: /);
      assert.match(String(response.text), /event: complete\ndata: /);
      assert.match(String(response.text), /"response":"/);
    });
  });

  it('returns 404 for an unknown job before opening a stream', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app)
        .get('/api/chat/jobs/00000000-0000-4000-8000-000000000000/stream')
        .expect(404);

      assert.deepEqual(response.body, { detail: 'Agent job not found.' });
    });
  });
});

describe('chat tenant isolation', () => {
  it("hides another user's job behind a 404", async () => {
    await withApp(
      async ({ app }) => {
        const tokenA = await signToken(USER_ID);
        const tokenB = await signToken(OTHER_USER);

        const queued = await request(app)
          .post('/api/chat')
          .set('Authorization', `Bearer ${tokenA}`)
          .send({ message: 'hello', async_mode: true })
          .expect(202);
        const jobId = String(queued.body.job_id);

        await request(app)
          .get(`/api/chat/jobs/${jobId}`)
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200);

        const denied = await request(app)
          .get(`/api/chat/jobs/${jobId}`)
          .set('Authorization', `Bearer ${tokenB}`)
          .expect(404);
        assert.deepEqual(denied.body, { detail: 'Agent job not found.' });

        await request(app)
          .get(`/api/chat/jobs/${jobId}/stream`)
          .set('Authorization', `Bearer ${tokenB}`)
          .expect(404);
      },
      { config: jwtConfig() },
    );
  });

  it('requires authentication when local auth is disabled', async () => {
    await withApp(
      async ({ app }) => {
        await request(app).post('/api/chat').send({ message: 'hello' }).expect(401);
        await request(app).get('/api/chat/jobs/any').expect(401);
      },
      { config: jwtConfig() },
    );
  });
});
