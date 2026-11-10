import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import express from 'express';
import { SignJWT, type JWTPayload } from 'jose';
import request from 'supertest';

import { createAuthService, DEV_BEARER_TOKENS } from '../src/auth/service.js';
import { parseBearerToken } from '../src/auth/bearer.js';
import { createSupabaseUserResolver } from '../src/auth/supabase-user.js';
import { assertTenantAccess, canAccessTenantResource } from '../src/auth/authorization.js';
import { INVALID_UUID_DETAIL, canonicalizeUuid, ensureValidUuid } from '../src/auth/uuid.js';
import { loadConfig, type AppConfig } from '../src/config/index.js';
import {
  createRequestContext,
  getCurrentUserId,
  getRequestContext,
  getSessionId,
  requireRequestContext,
  runWithRequestContext,
  setSessionId,
} from '../src/context/request-context.js';
import { requireAuth } from '../src/middleware/auth.js';
import { ForbiddenError, UnauthorizedError } from '../src/types/errors.js';

const SECRET = 'test-secret-key-that-is-at-least-32-bytes-long';
const USER_A = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';
const USER_B = 'b1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';
const LOCAL_DEV_USER_ID = 'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3';
const PRODUCTION_KEYS = {
  GEMINI_API_KEY: 'gemini',
  TAVILY_API_KEY: 'tavily',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
} as const;

const encoder = new TextEncoder();
const NOW = Math.floor(Date.now() / 1000);

function jwtConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
  return loadConfig({
    USE_LOCAL_AUTH: 'false',
    SUPABASE_JWT_SECRET: SECRET,
    ...overrides,
  });
}

function devConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
  return loadConfig({ USE_LOCAL_AUTH: 'true', ...overrides });
}

function productionConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
  return loadConfig({
    ENVIRONMENT: 'production',
    LLM_DATA_USE_MODE: 'zero_retention_verified',
    ...PRODUCTION_KEYS,
    ...overrides,
  });
}

function claims(overrides: JWTPayload = {}): JWTPayload {
  return { sub: USER_A, aud: 'authenticated', exp: NOW + 3600, ...overrides };
}

async function signToken(
  payload: JWTPayload,
  options: { alg?: 'HS256' | 'HS384'; key?: string } = {},
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: options.alg ?? 'HS256' })
    .sign(encoder.encode(options.key ?? SECRET));
}

function asRegExp(fragment: string | RegExp): RegExp {
  return fragment instanceof RegExp
    ? fragment
    : new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

async function assertUnauthorized(
  promise: Promise<unknown>,
  fragment?: string | RegExp,
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof UnauthorizedError);
    assert.equal(error.statusCode, 401);
    assert.deepEqual(error.headers, { 'WWW-Authenticate': 'Bearer' });
    if (fragment) {
      assert.match(String(error.detail), asRegExp(fragment));
    }
    return true;
  });
}

function service(
  config: AppConfig,
  resolver: (token: string) => Promise<string | undefined> = async () => undefined,
) {
  return createAuthService({ config, resolveSupabaseUser: resolver });
}

after(() => {
  assert.equal(getRequestContext(), undefined);
});

describe('bearer token parsing', () => {
  it('extracts a bearer token case-insensitively', () => {
    assert.equal(parseBearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
    assert.equal(parseBearerToken('bearer abc'), 'abc');
    assert.equal(parseBearerToken('BEARER   spaced'), '  spaced');
  });

  it('returns undefined for missing or malformed headers', () => {
    for (const header of [
      undefined,
      '',
      'Bearer',
      'Basic abc',
      'Token abc',
      ' Bearer abc',
      'Bearer ',
    ]) {
      assert.equal(parseBearerToken(header), undefined);
    }
  });
});

describe('UUID validation', () => {
  it('canonicalizes the forms Python uuid.UUID accepts', () => {
    assert.equal(canonicalizeUuid(USER_A), USER_A);
    assert.equal(canonicalizeUuid(USER_A.toUpperCase()), USER_A);
    assert.equal(canonicalizeUuid(USER_A.replaceAll('-', '')), USER_A);
    assert.equal(canonicalizeUuid(`{${USER_A}}`), USER_A);
    assert.equal(canonicalizeUuid(`urn:uuid:${USER_A}`), USER_A);
  });

  it('rejects non-UUID subjects', () => {
    for (const value of ['not-a-valid-uuid', 'user_A', '', '1234', 42, null, undefined]) {
      assert.equal(canonicalizeUuid(value), undefined);
    }
  });

  it('throws the Python 401 detail for invalid subjects', () => {
    assert.throws(
      () => ensureValidUuid('arbitrary-login-name'),
      (error: unknown) =>
        error instanceof UnauthorizedError && error.detail === INVALID_UUID_DETAIL,
    );
    assert.equal(
      INVALID_UUID_DETAIL,
      'Invalid user identification: token subject must be a valid UUID.',
    );
  });
});

describe('local HS256 verification', () => {
  it('accepts a valid token and returns the canonical subject', async () => {
    const token = await signToken(claims());
    assert.equal(await service(jwtConfig()).getCurrentUserId(token), USER_A);
  });

  it('canonicalizes an uppercase subject', async () => {
    const token = await signToken(claims({ sub: USER_A.toUpperCase() }));
    assert.equal(await service(jwtConfig()).getCurrentUserId(token), USER_A);
  });

  it('rejects a non-HS256 algorithm', async () => {
    const token = await signToken(claims(), { alg: 'HS384' });
    await assertUnauthorized(service(jwtConfig()).getCurrentUserId(token));
  });

  it('rejects an expired token immediately with an "expired" detail', async () => {
    const token = await signToken(claims({ exp: NOW - 3600 }));
    await assertUnauthorized(service(jwtConfig()).getCurrentUserId(token), /expired/i);
  });

  it('rejects the wrong audience', async () => {
    const token = await signToken(claims({ aud: 'untrusted-audience' }));
    await assertUnauthorized(service(jwtConfig()).getCurrentUserId(token));
  });

  it('rejects a missing audience', async () => {
    const token = await signToken({ sub: USER_A, exp: NOW + 3600 });
    await assertUnauthorized(service(jwtConfig()).getCurrentUserId(token));
  });

  it('rejects a non-UUID subject', async () => {
    const token = await signToken(claims({ sub: 'not-a-valid-uuid-string' }));
    await assertUnauthorized(service(jwtConfig()).getCurrentUserId(token), /UUID/);
  });

  it('rejects a bad signature', async () => {
    const token = await signToken(claims(), { key: 'a-different-secret-key-32-bytes-long!!' });
    await assertUnauthorized(service(jwtConfig()).getCurrentUserId(token));
  });

  it('rejects malformed tokens', async () => {
    await assertUnauthorized(service(jwtConfig()).getCurrentUserId('not-a-jwt'));
  });

  it('falls back to Supabase when local verification fails', async () => {
    const token = await signToken(claims(), { key: 'a-different-secret-key-32-bytes-long!!' });
    const seen: string[] = [];
    const svc = service(jwtConfig(), async (value) => {
      seen.push(value);
      return USER_B;
    });

    assert.equal(await svc.getCurrentUserId(token), USER_B);
    assert.deepEqual(seen, [token]);
  });

  it('rejects a Supabase fallback that returns a non-UUID id', async () => {
    await assertUnauthorized(
      service(jwtConfig(), async () => 'not-a-uuid').getCurrentUserId('opaque-token'),
      /UUID/,
    );
  });

  it('treats a throwing Supabase fallback as unresolved', async () => {
    await assertUnauthorized(
      service(jwtConfig(), async () => {
        throw new Error('supabase down');
      }).getCurrentUserId('opaque-token'),
    );
  });
});

describe('local development fallback', () => {
  it('resolves missing credentials to the local dev user only in dev', async () => {
    const config = devConfig();
    assert.equal(await service(config).getCurrentUserId(undefined), LOCAL_DEV_USER_ID);
    assert.equal(config.auth.useLocalAuth, true);
  });

  it('rejects missing credentials when local auth is disabled', async () => {
    await assertUnauthorized(
      service(jwtConfig()).getCurrentUserId(undefined),
      /Authentication required/,
    );
  });

  it('accepts every Python dev bearer token and the configured dev user id', async () => {
    const config = devConfig();
    for (const token of [...DEV_BEARER_TOKENS, LOCAL_DEV_USER_ID]) {
      assert.equal(await service(config).getCurrentUserId(token), LOCAL_DEV_USER_ID);
    }
  });

  it('accepts an unverified JWT with a UUID subject in dev', async () => {
    const token = await signToken(claims({ sub: USER_B }), {
      key: 'unverified-dev-key-that-is-32-bytes!!',
    });
    assert.equal(await service(devConfig()).getCurrentUserId(token), USER_B);
  });

  it('rejects an unverified JWT with a non-UUID subject in dev', async () => {
    const token = await signToken(claims({ sub: 'user_A' }), {
      key: 'unverified-dev-key-that-is-32-bytes!!',
    });
    await assertUnauthorized(service(devConfig()).getCurrentUserId(token), /UUID/);
  });

  it('still rejects expired tokens in dev when a JWT secret is configured', async () => {
    const token = await signToken(claims({ exp: NOW - 3600 }));
    await assertUnauthorized(
      service(devConfig({ SUPABASE_JWT_SECRET: SECRET })).getCurrentUserId(token),
    );
  });

  it('never enables the dev fallback in production', async () => {
    const config = productionConfig({ USE_LOCAL_AUTH: 'true' });
    assert.equal(config.auth.useLocalAuth, false);
    await assertUnauthorized(service(config).getCurrentUserId(undefined));
  });
});

describe('Supabase user resolver', () => {
  type FakeResponse = { ok: boolean; json: () => Promise<unknown> };

  function fakeFetch(handler: (url: string, init?: RequestInit) => FakeResponse) {
    return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
      handler(String(input), init)) as unknown as typeof fetch;
  }

  it('is a no-op without a Supabase URL or service role key', async () => {
    let called = false;
    const resolver = createSupabaseUserResolver({
      supabaseUrl: undefined,
      serviceRoleKey: 'key',
      fetchImpl: fakeFetch(() => {
        called = true;
        return { ok: true, json: async () => ({ id: USER_A }) };
      }),
    });
    assert.equal(await resolver('token'), undefined);
    assert.equal(called, false);
  });

  it('calls /auth/v1/user with the service-role apikey and bearer token', async () => {
    let seenUrl = '';
    let seenInit: Parameters<typeof fetch>[1];
    const resolver = createSupabaseUserResolver({
      supabaseUrl: 'https://example.supabase.co/',
      serviceRoleKey: 'service-role-key',
      fetchImpl: fakeFetch((url, init) => {
        seenUrl = url;
        seenInit = init;
        return { ok: true, json: async () => ({ id: USER_A }) };
      }),
    });

    assert.equal(await resolver('caller-token'), USER_A);
    assert.equal(seenUrl, 'https://example.supabase.co/auth/v1/user');
    assert.deepEqual(seenInit?.headers, {
      apikey: 'service-role-key',
      Authorization: 'Bearer caller-token',
    });
  });

  it('returns undefined for non-OK responses and malformed bodies', async () => {
    const notOk = createSupabaseUserResolver({
      supabaseUrl: 'https://example.supabase.co',
      serviceRoleKey: 'key',
      fetchImpl: fakeFetch(() => ({ ok: false, json: async () => ({ id: USER_A }) })),
    });
    assert.equal(await notOk('token'), undefined);

    const malformed = createSupabaseUserResolver({
      supabaseUrl: 'https://example.supabase.co',
      serviceRoleKey: 'key',
      fetchImpl: fakeFetch(() => ({ ok: true, json: async () => ({ email: 'x' }) })),
    });
    assert.equal(await malformed('token'), undefined);
  });

  it('returns undefined when the network layer throws', async () => {
    const resolver = createSupabaseUserResolver({
      supabaseUrl: 'https://example.supabase.co',
      serviceRoleKey: 'key',
      fetchImpl: (async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
    });
    assert.equal(await resolver('token'), undefined);
  });
});

describe('requireAuth middleware', () => {
  function buildApp(config: AppConfig, resolver?: (token: string) => Promise<string | undefined>) {
    const app = express();
    const guard = requireAuth({ config, resolveSupabaseUser: resolver ?? (async () => undefined) });

    app.get('/whoami', guard, (req, res) => {
      const context = getRequestContext();
      res.json({
        userId: req.userId,
        contextUserId: context?.userId,
        tenantId: context?.tenantId,
        requestId: context?.requestId,
        sessionId: context?.sessionId,
      });
    });

    app.get('/session', guard, async (_req, res) => {
      const before = getSessionId();
      setSessionId('session-123');
      await new Promise((resolve) => setTimeout(resolve, 10));
      res.json({ before, after: getSessionId(), userId: getCurrentUserId() });
    });

    app.get('/slow/:delay', guard, async (req, res) => {
      await new Promise((resolve) => setTimeout(resolve, Number(req.params.delay)));
      res.json({ userId: getCurrentUserId() });
    });

    return app;
  }

  it('attaches the authenticated user and request context', async () => {
    const token = await signToken(claims());
    const response = await request(buildApp(jwtConfig()))
      .get('/whoami')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    assert.equal(response.body.userId, USER_A);
    assert.equal(response.body.contextUserId, USER_A);
    assert.equal(response.body.tenantId, USER_A);
    assert.match(response.body.requestId, /^[0-9a-f-]{36}$/);
    assert.equal(response.body.sessionId, undefined);
  });

  it('uses the dev bypass when no token is sent in development', async () => {
    const response = await request(buildApp(devConfig())).get('/whoami').expect(200);
    assert.equal(response.body.userId, LOCAL_DEV_USER_ID);
  });

  it('returns FastAPI-style 401 for missing credentials', async () => {
    const response = await request(buildApp(jwtConfig())).get('/whoami').expect(401);

    assert.equal(response.headers['www-authenticate'], 'Bearer');
    assert.deepEqual(response.body, {
      detail: 'Authentication required. Please log in to continue.',
    });
  });

  it('returns 401 for invalid credentials', async () => {
    const response = await request(buildApp(jwtConfig()))
      .get('/whoami')
      .set('Authorization', 'Bearer not-a-token')
      .expect(401);

    assert.equal(response.headers['www-authenticate'], 'Bearer');
    assert.match(response.body.detail, /Invalid or expired authentication token/);
  });

  it('carries the context across async boundaries and allows session attachment', async () => {
    const token = await signToken(claims());
    const response = await request(buildApp(jwtConfig()))
      .get('/session')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    assert.equal(response.body.before, undefined);
    assert.equal(response.body.after, 'session-123');
    assert.equal(response.body.userId, USER_A);
  });

  it('keeps concurrent request contexts isolated', async () => {
    const app = buildApp(jwtConfig());
    const tokenA = await signToken(claims({ sub: USER_A }));
    const tokenB = await signToken(claims({ sub: USER_B }));

    const [slowA, fastB] = await Promise.all([
      request(app).get('/slow/40').set('Authorization', `Bearer ${tokenA}`),
      request(app).get('/slow/5').set('Authorization', `Bearer ${tokenB}`),
    ]);

    assert.equal(slowA.body.userId, USER_A);
    assert.equal(fastB.body.userId, USER_B);
  });
});

describe('request context', () => {
  it('is absent outside a request', () => {
    assert.equal(getRequestContext(), undefined);
    assert.throws(() => requireRequestContext(), /No request context/);
  });

  it('scopes values to the callback and exposes identity helpers', () => {
    const context = createRequestContext(USER_A, 'req-123');
    assert.equal(context.requestId, 'req-123');
    assert.equal(context.tenantId, USER_A);

    const result = runWithRequestContext(context, () => {
      assert.equal(getRequestContext()?.requestId, 'req-123');
      assert.equal(getCurrentUserId(), USER_A);
      setSessionId('session-abc');
      return getSessionId();
    });

    assert.equal(result, 'session-abc');
    assert.equal(getRequestContext(), undefined);
  });

  it('does not leak context between sibling runs', () => {
    const first = createRequestContext(USER_A);
    const second = createRequestContext(USER_B);

    const valueA = runWithRequestContext(first, () => getCurrentUserId());
    const valueB = runWithRequestContext(second, () => getCurrentUserId());

    assert.equal(valueA, USER_A);
    assert.equal(valueB, USER_B);
  });
});

describe('tenant authorization helpers', () => {
  it('allows the matching tenant, case-insensitively for UUIDs', () => {
    assert.equal(canAccessTenantResource(USER_A, USER_A), true);
    assert.equal(canAccessTenantResource(USER_A, USER_A.toUpperCase()), true);
    assert.equal(canAccessTenantResource('user_A', 'user_A'), true);
  });

  it('denies other tenants and missing owners', () => {
    assert.equal(canAccessTenantResource(USER_A, USER_B), false);
    assert.equal(canAccessTenantResource(USER_A, null), false);
    assert.equal(canAccessTenantResource(USER_A, undefined), false);
    assert.equal(canAccessTenantResource(USER_A, ''), false);
  });

  it('throws 403 with the default or custom detail', () => {
    assert.throws(
      () => assertTenantAccess(USER_A, USER_B),
      (error: unknown) =>
        error instanceof ForbiddenError &&
        error.statusCode === 403 &&
        error.detail === 'Access denied: resource belongs to another tenant.',
    );

    assert.doesNotThrow(() => assertTenantAccess(USER_A, USER_A));
    assert.throws(
      () => assertTenantAccess(USER_A, USER_B, 'custom denial'),
      (error: unknown) => error instanceof ForbiddenError && error.detail === 'custom denial',
    );
  });
});
