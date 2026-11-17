import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import express from 'express';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/index.js';
import {
  createRequestContext,
  runWithRequestContext,
  runWithRequestId,
} from '../src/context/request-context.js';
import type { WorkspaceQueryStore } from '../src/db/workspace-query-store.js';
import { requireAuth } from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { createRequestIdMiddleware, resolveRequestId } from '../src/middleware/request-id.js';
import { resolveAuthMode } from '../src/routes/health.js';
import { createLogger } from '../src/telemetry/logger.js';
import { HttpError } from '../src/types/errors.js';
import { USER_ID } from './phase15-helpers.js';

afterEach(() => {
  mock.restoreAll();
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function readinessStore(
  kind: WorkspaceQueryStore['kind'] = 'postgresql',
  ping: () => Promise<void> = async () => {},
): WorkspaceQueryStore {
  return { kind, ping } as unknown as WorkspaceQueryStore;
}

function buildApp(
  env: Record<string, string | undefined> = {},
  store: WorkspaceQueryStore = readinessStore(),
) {
  const config = loadConfig({
    USE_LOCAL_AUTH: 'true',
    LOCAL_DEV_USER_ID: USER_ID,
    GEMINI_API_KEY: 'gemini-test-key',
    ...env,
  });
  return { app: createApp({ config, workspaceQueryStore: store }), config };
}

function parse(line: string | undefined): Record<string, unknown> {
  assert.ok(line);
  return JSON.parse(line) as Record<string, unknown>;
}

describe('request id propagation', () => {
  it('echoes an inbound request id on every response', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .get('/health')
      .set('X-Request-ID', 'gateway-abc.123:45')
      .expect(200);

    assert.equal(response.headers['x-request-id'], 'gateway-abc.123:45');
  });

  it('mints a UUID when the caller does not supply one', async () => {
    const { app } = buildApp();
    const response = await request(app).get('/health').expect(200);

    assert.match(String(response.headers['x-request-id']), UUID_PATTERN);
  });

  it('replaces unsafe inbound ids instead of logging them', async () => {
    assert.equal(resolveRequestId('a'.repeat(129)).length, 36);
    assert.match(resolveRequestId('bad id with spaces'), UUID_PATTERN);
    assert.match(resolveRequestId(undefined), UUID_PATTERN);
  });

  it('keeps the request id on 404 and authentication failures', async () => {
    const { app } = buildApp();
    const missing = await request(app).get('/nope').set('X-Request-ID', 'req-404').expect(404);
    assert.equal(missing.headers['x-request-id'], 'req-404');

    const protectedConfig = loadConfig({
      USE_LOCAL_AUTH: 'false',
      SUPABASE_JWT_SECRET: 'test-secret-key-that-is-at-least-32-bytes-long',
    });
    const protectedApp = createApp({
      config: protectedConfig,
      workspaceQueryStore: readinessStore(),
    });
    const denied = await request(protectedApp)
      .get('/api/metrics')
      .set('X-Request-ID', 'req-401')
      .expect(401);
    assert.equal(denied.headers['x-request-id'], 'req-401');
  });

  it('injects request, tenant and session context into logger records', () => {
    const lines: string[] = [];
    const logger = createLogger({ name: 'observability-test', sink: (line) => lines.push(line) });

    runWithRequestContext(createRequestContext('user-1', 'req-1'), () => {
      logger.info('inside request', { status: 'ok', user_id: 'ignored-override' });
    });
    runWithRequestId('req-pre-auth', () => logger.info('before auth'));

    const inside = parse(lines[0]);
    assert.equal(inside['request_id'], 'req-1');
    assert.equal(inside['user_id'], 'user-1');
    assert.equal(inside['tenant_id'], 'user-1');
    assert.equal(inside['status'], 'ok');

    const beforeAuth = parse(lines[1]);
    assert.equal(beforeAuth['request_id'], 'req-pre-auth');
    assert.equal(beforeAuth['user_id'], undefined);
    assert.equal(beforeAuth['tenant_id'], undefined);
  });

  it('logs unhandled errors with request and tenant identity', async () => {
    const config = loadConfig({ USE_LOCAL_AUTH: 'true', LOCAL_DEV_USER_ID: USER_ID });
    const app = express();
    app.use(createRequestIdMiddleware());
    app.get('/boom', requireAuth({ config }), () => {
      throw new Error('internal database password leaked');
    });
    app.use(errorHandler);

    const lines: string[] = [];
    mock.method(console, 'error', (...args: unknown[]) => {
      lines.push(String(args[0]));
    });

    const response = await request(app).get('/boom').set('X-Request-ID', 'req-error').expect(500);

    const record = parse(lines[0]);
    assert.equal(record['request_id'], 'req-error');
    assert.equal(record['user_id'], USER_ID);
    assert.equal(record['tenant_id'], USER_ID);
    assert.equal(record['method'], 'GET');
    assert.equal(record['path'], '/boom');
    assert.equal(record['ref'], response.body.ref);
    // The internal message is server-side only; the client sees the opaque ref.
    assert.equal(
      response.body.detail,
      `An unexpected server error occurred. (ref=${response.body.ref})`,
    );
  });

  it('logs 5xx HttpErrors server-side without changing the client contract', async () => {
    const config = loadConfig({ USE_LOCAL_AUTH: 'true', LOCAL_DEV_USER_ID: USER_ID });
    const app = express();
    app.use(createRequestIdMiddleware());
    app.get('/db-error', requireAuth({ config }), () => {
      throw new HttpError(500, 'Database error: connection refused');
    });
    app.use(errorHandler);

    const lines: string[] = [];
    mock.method(console, 'error', (...args: unknown[]) => {
      lines.push(String(args[0]));
    });

    const response = await request(app)
      .get('/db-error')
      .set('X-Request-ID', 'req-http-500')
      .expect(500);
    assert.deepEqual(response.body, { detail: 'Database error: connection refused' });

    const record = parse(lines[0]);
    assert.equal(record['request_id'], 'req-http-500');
    assert.equal(record['user_id'], USER_ID);
    assert.equal(record['status_code'], 500);
    assert.equal(record['error_type'], 'HttpError');
  });
});

describe('authenticated readiness', () => {
  it('reports healthy when the database, LLM and auth are configured', async () => {
    const { app } = buildApp();
    for (const path of ['/health/ready', '/api/health/ready']) {
      const response = await request(app).get(path).expect(200);
      assert.equal(response.body.status, 'healthy');
      assert.equal(response.body.message, 'RecruitAI readiness diagnostics completed.');
      assert.equal(response.body.version, '2.0.0');
      assert.equal(typeof response.body.uptime_seconds, 'number');

      assert.equal(response.body.services.database.status, 'healthy');
      assert.equal(response.body.services.database.type, 'supabase_postgresql');
      assert.equal(typeof response.body.services.database.latency_ms, 'number');

      assert.equal(response.body.services.llm.status, 'configured');
      assert.equal(response.body.services.llm.provider, 'google_gemini');
      assert.ok(response.body.services.llm.models.length > 0);
      // The key itself must never be echoed.
      assert.equal(JSON.stringify(response.body).includes('gemini-test-key'), false);

      assert.deepEqual(response.body.services.auth, {
        mode: 'local_dev',
        local_auth_enabled: true,
      });
    }
  });

  it('reports degraded for the SQLite fallback and an unconfigured LLM', async () => {
    const { app } = buildApp({ GEMINI_API_KEY: '' }, readinessStore('sqlite_fallback'));
    const response = await request(app).get('/api/health/ready').expect(200);

    assert.equal(response.body.status, 'degraded');
    assert.equal(response.body.services.database.status, 'healthy');
    assert.equal(response.body.services.database.type, 'sqlite_fallback');
    assert.deepEqual(response.body.services.llm, {
      status: 'unconfigured',
      warning: 'GEMINI_API_KEY is missing or unconfigured',
    });
  });

  it('treats placeholder LLM keys as unconfigured', async () => {
    const { app } = buildApp({ GEMINI_API_KEY: 'your_gemini_key_here' });
    const response = await request(app).get('/api/health/ready').expect(200);
    assert.equal(response.body.services.llm.status, 'unconfigured');
    assert.equal(response.body.status, 'degraded');
  });

  it('returns 503 and redacts the database error message when the ping fails', async () => {
    const store = readinessStore('postgresql', async () => {
      throw new Error('password=supersecret host=internal.db');
    });
    const { app } = buildApp({}, store);
    const response = await request(app).get('/api/health/ready').expect(503);

    assert.equal(response.body.status, 'unhealthy');
    assert.equal(response.body.services.database.status, 'unhealthy');
    assert.equal(response.body.services.database.error_type, 'Error');
    assert.equal(typeof response.body.services.database.latency_ms, 'number');

    const serialized = JSON.stringify(response.body);
    assert.equal(serialized.includes('supersecret'), false);
    assert.equal(serialized.includes('internal.db'), false);
  });

  it('requires authentication', async () => {
    const config = loadConfig({
      USE_LOCAL_AUTH: 'false',
      SUPABASE_JWT_SECRET: 'test-secret-key-that-is-at-least-32-bytes-long',
    });
    const app = createApp({ config, workspaceQueryStore: readinessStore() });

    for (const path of ['/health/ready', '/api/health/ready']) {
      const response = await request(app).get(path).expect(401);
      assert.equal(response.headers['www-authenticate'], 'Bearer');
      assert.deepEqual(response.body, {
        detail: 'Authentication required. Please log in to continue.',
      });
    }
  });

  it('reports the auth mode without exposing the JWT secret', () => {
    const local = loadConfig({ USE_LOCAL_AUTH: 'true' });
    assert.deepEqual(resolveAuthMode(local), { mode: 'local_dev', local_auth_enabled: true });

    const jwt = loadConfig({
      USE_LOCAL_AUTH: 'false',
      SUPABASE_JWT_SECRET: 'test-secret-key-that-is-at-least-32-bytes-long',
    });
    assert.deepEqual(resolveAuthMode(jwt), {
      mode: 'supabase_jwt',
      local_auth_enabled: false,
    });

    const unconfigured = loadConfig({ USE_LOCAL_AUTH: 'false', SUPABASE_JWT_SECRET: '' });
    assert.deepEqual(resolveAuthMode(unconfigured), {
      mode: 'unconfigured_jwt',
      local_auth_enabled: false,
    });
    assert.equal(JSON.stringify(resolveAuthMode(jwt)).includes('test-secret'), false);
  });
});
