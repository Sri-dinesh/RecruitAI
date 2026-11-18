import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  DEFAULT_ALLOWED_ORIGINS,
  DEFAULT_JWT_AUDIENCE,
  DEFAULT_LLM_DATA_USE_MODE,
  DEFAULT_LOCAL_DEV_USER_ID,
  REQUIRED_PRODUCTION_KEYS,
  ROTATING_MODELS,
  getConfig,
  getMissingKeys,
  isLlmAllowed,
  isLlmDataUseModeVerified,
  isLlmKilled,
  isProduction,
  loadConfig,
  resetConfig,
  verifyProviderCompliance,
  type AppConfig,
} from '../src/config/index.js';
import { loadEnvFileIfPresent } from '../src/config/env.js';
import {
  CREDIT_UPGRADE_URL,
  DEFAULT_INSUFFICIENT_CREDITS_MESSAGE,
  EVALUATION_QUOTA_MESSAGE,
  INSUFFICIENT_CREDITS,
  InsufficientCreditsError,
  OUTREACH_QUOTA_MESSAGE,
  insufficientCreditsBody,
} from '../src/types/errors.js';

/** Env that satisfies every production gate. */
const PRODUCTION_ENV = {
  ENVIRONMENT: 'production',
  GEMINI_API_KEY: 'gemini-key',
  TAVILY_API_KEY: 'tavily-key',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  LLM_DATA_USE_MODE: 'zero_retention_verified',
} as const;

function productionEnv(overrides: Record<string, string | undefined> = {}) {
  return { ...PRODUCTION_ENV, ...overrides };
}

/** Assert that a thunk throws with a message containing `fragment`. */
function assertThrowsWith(fn: () => unknown, fragment: string): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    return true;
  });
}

after(() => {
  resetConfig();
});

describe('config defaults (development)', () => {
  it('applies Python defaults when nothing is configured', () => {
    const config = loadConfig({});

    assert.equal(config.environment, 'development');
    assert.equal(config.isProduction, false);
    assert.equal(config.server.host, '0.0.0.0');
    assert.equal(config.server.port, 8000);
    assert.equal(config.server.reload, true);
    assert.equal(config.auth.useLocalAuth, false);
    assert.equal(config.auth.localDevUserId, DEFAULT_LOCAL_DEV_USER_ID);
    assert.equal(config.auth.jwtSecret, '');
    assert.equal(config.auth.jwtAudience, DEFAULT_JWT_AUDIENCE);
    assert.equal(config.llm.dataUseMode, DEFAULT_LLM_DATA_USE_MODE);
    assert.equal(config.llm.killSwitch, false);
    assert.deepEqual(config.llm.rotatingModels, [...ROTATING_MODELS]);
    assert.equal(config.supabase.anonKey, '');
    assert.equal(config.smtp.server, 'smtp.gmail.com');
    assert.equal(config.smtp.port, 587);
    assert.equal(config.smtp.sender, undefined);
    assert.equal(config.razorpay.keyId, '');
    assert.equal(config.razorpay.keySecret, '');
    assert.equal(config.razorpay.webhookSecret, '');
    assert.deepEqual(config.cors.allowedOrigins, [...DEFAULT_ALLOWED_ORIGINS]);
    assert.deepEqual(config.retention, {
      enabled: false,
      intervalSeconds: 86_400,
      rawResumeTtlDays: 90,
      chatTtlDays: 365,
    });
    assert.equal(config.telemetry.enabled, true);
    assert.equal(config.telemetry.eventLoopLagWarnMs, 200);
    assert.deepEqual(config.workers, { enabled: false, size: 2, maxQueue: 100 });
    assert.deepEqual(config.chat, { maxSseConnections: 200 });
    assert.equal(config.logging.level, 'info');
    assert.deepEqual(config.rateLimit, {
      enabled: false,
      windowSeconds: 60,
      maxRequests: 600,
      trustProxy: false,
    });
    assert.deepEqual(config.missingKeys, [...REQUIRED_PRODUCTION_KEYS]);
  });

  it('does not throw in development when production keys are missing', () => {
    const config = loadConfig({ GEMINI_API_KEY: 'only-this-one' });

    assert.deepEqual(config.missingKeys, [
      'TAVILY_API_KEY',
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
    ]);
  });
});

describe('ENVIRONMENT / NODE_ENV precedence', () => {
  it('prefers ENVIRONMENT over NODE_ENV and lowercases it', () => {
    const config = loadConfig(
      productionEnv({ ENVIRONMENT: 'PRODUCTION', NODE_ENV: 'development' }),
    );
    assert.equal(config.environment, 'production');
    assert.equal(config.isProduction, true);
    assert.equal(config.nodeEnv, 'development');
  });

  it('falls back to NODE_ENV when ENVIRONMENT is unset', () => {
    const config = loadConfig(productionEnv({ ENVIRONMENT: undefined, NODE_ENV: 'production' }));
    assert.equal(config.environment, 'production');
    assert.equal(config.isProduction, true);
  });

  it('treats non-"production" values as non-production', () => {
    assert.equal(loadConfig({ ENVIRONMENT: 'staging' }).isProduction, false);
    assert.equal(loadConfig({ ENVIRONMENT: 'production ' }).isProduction, false);
  });
});

describe('production gates', () => {
  it('forces USE_LOCAL_AUTH off in production even when enabled', () => {
    const config = loadConfig(productionEnv({ USE_LOCAL_AUTH: 'true' }));
    assert.equal(config.auth.useLocalAuth, false);
  });

  it('honors USE_LOCAL_AUTH outside production', () => {
    assert.equal(loadConfig({ USE_LOCAL_AUTH: 'TRUE' }).auth.useLocalAuth, true);
    assert.equal(loadConfig({ USE_LOCAL_AUTH: 'yes' }).auth.useLocalAuth, false);
    assert.equal(loadConfig({ USE_LOCAL_AUTH: '1' }).auth.useLocalAuth, false);
  });

  it('disables reload by default in production', () => {
    assert.equal(loadConfig(productionEnv()).server.reload, false);
    assert.equal(loadConfig(productionEnv({ RELOAD: 'true' })).server.reload, true);
  });

  it('throws AI-SEC-1 when LLM_DATA_USE_MODE is unverified in production', () => {
    for (const mode of ['unverified', 'training_allowed', 'opt_in', 'false', 'False', '']) {
      assertThrowsWith(
        () => loadConfig(productionEnv({ LLM_DATA_USE_MODE: mode })),
        'FATAL SECURITY VIOLATION (AI-SEC-1)',
      );
    }
  });

  it('throws AI-SEC-1 for case-mismatched verified mode (matches Python)', () => {
    assertThrowsWith(
      () => loadConfig(productionEnv({ LLM_DATA_USE_MODE: 'ZERO_RETENTION_VERIFIED' })),
      'FATAL SECURITY VIOLATION (AI-SEC-1)',
    );
  });

  it('accepts the verified mode in production', () => {
    const config = loadConfig(productionEnv());
    assert.equal(config.llm.dataUseMode, 'zero_retention_verified');
  });

  it('does not enforce AI-SEC-1 outside production', () => {
    const config = loadConfig({ LLM_DATA_USE_MODE: 'training_allowed' });
    assert.equal(config.isProduction, false);
    assert.equal(config.llm.dataUseMode, 'training_allowed');
  });

  it('fails fast in production when required keys are missing', () => {
    assertThrowsWith(
      () => loadConfig({ ENVIRONMENT: 'production' }),
      'Missing required production configuration: GEMINI_API_KEY, TAVILY_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY',
    );
  });

  it('fail-fast is a Node-side hardening: getMissingKeys mirrors Python', () => {
    assert.deepEqual(getMissingKeys(productionEnv()), []);
    assert.deepEqual(getMissingKeys({ GEMINI_API_KEY: 'x' }), [
      'TAVILY_API_KEY',
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
    ]);
  });
});

describe('logging and rate limiting config', () => {
  it('enables the limiter by default only in production', () => {
    assert.equal(loadConfig({}).rateLimit.enabled, false);
    assert.equal(loadConfig({ ENVIRONMENT: 'staging' }).rateLimit.enabled, false);
    assert.equal(loadConfig(productionEnv()).rateLimit.enabled, true);
  });

  it('honours explicit limiter settings and bounds', () => {
    const config = loadConfig({
      RATE_LIMIT_ENABLED: 'true',
      RATE_LIMIT_WINDOW_SECONDS: '30',
      RATE_LIMIT_MAX_REQUESTS: '120',
      TRUST_PROXY: 'true',
    });
    assert.deepEqual(config.rateLimit, {
      enabled: true,
      windowSeconds: 30,
      maxRequests: 120,
      trustProxy: true,
    });

    const disabled = loadConfig(productionEnv({ RATE_LIMIT_ENABLED: 'false' }));
    assert.equal(disabled.rateLimit.enabled, false);
  });

  it('rejects invalid limiter bounds instead of silently changing them', () => {
    for (const key of ['RATE_LIMIT_WINDOW_SECONDS', 'RATE_LIMIT_MAX_REQUESTS']) {
      assertThrowsWith(() => loadConfig({ [key]: '0' }), `Invalid ${key}`);
      assertThrowsWith(() => loadConfig({ [key]: '-1' }), `Invalid ${key}`);
      assertThrowsWith(() => loadConfig({ [key]: 'abc' }), `Invalid ${key}`);
    }
  });

  it('parses and validates LOG_LEVEL', () => {
    assert.equal(loadConfig({ LOG_LEVEL: 'WARN' }).logging.level, 'warn');
    assert.equal(loadConfig({ LOG_LEVEL: '' }).logging.level, 'info');
    assertThrowsWith(() => loadConfig({ LOG_LEVEL: 'verbose' }), 'Invalid LOG_LEVEL');
  });

  it('parses TRUST_PROXY with the Python boolean rules', () => {
    assert.equal(loadConfig({ TRUST_PROXY: 'true' }).rateLimit.trustProxy, true);
    assert.equal(loadConfig({ TRUST_PROXY: 'TRUE' }).rateLimit.trustProxy, true);
    assert.equal(loadConfig({ TRUST_PROXY: '1' }).rateLimit.trustProxy, false);
  });
});

describe('verifyProviderCompliance', () => {
  it('is a no-op for a compliant production config', () => {
    assert.doesNotThrow(() => verifyProviderCompliance(loadConfig(productionEnv())));
  });

  it('is a no-op outside production regardless of mode', () => {
    const config = loadConfig({ ENVIRONMENT: 'development', LLM_DATA_USE_MODE: 'opt_in' });
    assert.doesNotThrow(() => verifyProviderCompliance(config));
  });
});

describe('CORS origins', () => {
  it('parses comma-separated origins, trims, and drops empty entries', () => {
    const config = loadConfig({ ALLOWED_ORIGINS: ' https://a.test ,, https://b.test , ' });
    assert.deepEqual(config.cors.allowedOrigins, ['https://a.test', 'https://b.test']);
  });

  it('treats whitespace-only ALLOWED_ORIGINS as an empty list', () => {
    assert.deepEqual(loadConfig({ ALLOWED_ORIGINS: '   ' }).cors.allowedOrigins, []);
  });

  it('exposes the Vercel preview regex', () => {
    const { previewOriginRegex } = loadConfig({}).cors;
    const matcher = new RegExp(previewOriginRegex);
    assert.match('https://recruitai-abc123.vercel.app', matcher);
    assert.match('https://recruitai.vercel.app', matcher);
    // Python's regex only allows alphanumerics after the hyphen, so more
    // complex preview origins (recruitai-git-main...) do not match.
    assert.doesNotMatch('https://recruitai-git-main.vercel.app', matcher);
    assert.doesNotMatch('https://evil-vercel.app', matcher);
  });
});

describe('parsing quirks', () => {
  it('falls back to the default SMTP port on invalid input (Python _parse_port)', () => {
    assert.equal(loadConfig({ SMTP_PORT: 'not-a-port' }).smtp.port, 587);
    assert.equal(loadConfig({ SMTP_PORT: '' }).smtp.port, 587);
    assert.equal(loadConfig({ SMTP_PORT: '2525' }).smtp.port, 2525);
  });

  it('falls back to SMTP_USERNAME only when SMTP_SENDER is unset', () => {
    assert.equal(loadConfig({ SMTP_USERNAME: 'ops@test.dev' }).smtp.sender, 'ops@test.dev');
    assert.equal(
      loadConfig({ SMTP_USERNAME: 'ops@test.dev', SMTP_SENDER: 'hr@test.dev' }).smtp.sender,
      'hr@test.dev',
    );
    assert.equal(loadConfig({ SMTP_USERNAME: 'ops@test.dev', SMTP_SENDER: '' }).smtp.sender, '');
  });

  it('parses booleans with Python semantics (only "true" is truthy)', () => {
    assert.equal(loadConfig({ LLM_KILL_SWITCH: 'TRUE' }).llm.killSwitch, true);
    assert.equal(loadConfig({ LLM_KILL_SWITCH: 'yes' }).llm.killSwitch, false);
    assert.equal(loadConfig({ LLM_KILL_SWITCH: '1' }).llm.killSwitch, false);
  });

  it('throws on a non-integer PORT (mirrors int() crashing the launcher)', () => {
    assertThrowsWith(() => loadConfig({ PORT: 'eighty' }), 'Invalid PORT');
    assert.equal(loadConfig({ PORT: ' 9001 ' }).server.port, 9001);
    assert.equal(loadConfig({ PORT: '' }).server.port, 8000);
  });

  it('keeps GROQ_API_KEY available for parity', () => {
    assert.equal(loadConfig({ GROQ_API_KEY: 'groq-key' }).llm.groqApiKey, 'groq-key');
  });

  it('parses the opt-in retention scheduler settings', () => {
    const config = loadConfig({
      RETENTION_JOB_ENABLED: 'true',
      RETENTION_JOB_INTERVAL_SECONDS: '3600',
      RETENTION_RAW_RESUME_TTL_DAYS: '30',
      RETENTION_CHAT_TTL_DAYS: '0',
    });
    assert.deepEqual(config.retention, {
      enabled: true,
      intervalSeconds: 3600,
      rawResumeTtlDays: 30,
      chatTtlDays: 0,
    });
    assert.equal(loadConfig({ RETENTION_JOB_ENABLED: 'yes' }).retention.enabled, false);
    assertThrowsWith(
      () => loadConfig({ RETENTION_RAW_RESUME_TTL_DAYS: '-1' }),
      'non-negative integer',
    );
    assertThrowsWith(() => loadConfig({ RETENTION_JOB_INTERVAL_SECONDS: '0' }), 'positive integer');
  });

  it('enables the worker pool by default only in production', () => {
    assert.equal(loadConfig({}).workers.enabled, false);
    assert.equal(loadConfig(productionEnv()).workers.enabled, true);
    assert.equal(
      loadConfig(productionEnv({ WORKER_POOL_ENABLED: 'false' })).workers.enabled,
      false,
    );
    assert.equal(loadConfig({ WORKER_POOL_ENABLED: 'true' }).workers.enabled, true);
  });

  it('parses worker, SSE and event-loop bounds', () => {
    const config = loadConfig({
      WORKER_POOL_SIZE: '4',
      WORKER_POOL_MAX_QUEUE: '25',
      CHAT_MAX_SSE_CONNECTIONS: '50',
      EVENT_LOOP_LAG_WARN_MS: '500',
    });
    assert.deepEqual(config.workers, { enabled: false, size: 4, maxQueue: 25 });
    assert.equal(config.chat.maxSseConnections, 50);
    assert.equal(config.telemetry.eventLoopLagWarnMs, 500);

    for (const key of [
      'WORKER_POOL_SIZE',
      'WORKER_POOL_MAX_QUEUE',
      'CHAT_MAX_SSE_CONNECTIONS',
      'EVENT_LOOP_LAG_WARN_MS',
    ]) {
      assertThrowsWith(() => loadConfig({ [key]: '0' }), 'positive integer');
    }
  });
});

describe('mode helpers', () => {
  const devConfig: AppConfig = loadConfig({});
  const prodConfig: AppConfig = loadConfig(productionEnv());

  it('reports production correctly', () => {
    assert.equal(isProduction(devConfig), false);
    assert.equal(isProduction(prodConfig), true);
  });

  it('reports the runtime LLM kill switch', () => {
    const killed = loadConfig({ LLM_KILL_SWITCH: 'true' });
    assert.equal(isLlmKilled(killed), true);
    assert.equal(isLlmAllowed(killed), false);
    assert.equal(isLlmKilled(devConfig), false);
    assert.equal(isLlmAllowed(devConfig), true);
  });

  it('reports the AI-SEC-1 data-use mode', () => {
    assert.equal(isLlmDataUseModeVerified(devConfig), true);
    assert.equal(isLlmDataUseModeVerified(loadConfig({ LLM_DATA_USE_MODE: 'opt_in' })), false);
  });
});

describe('getConfig singleton', () => {
  it('memoizes the loaded config and resets on demand', () => {
    resetConfig();
    const env = { GEMINI_API_KEY: 'first' };
    const first = getConfig(env);
    // Second call ignores the new source because the singleton already exists.
    const second = getConfig({ GEMINI_API_KEY: 'second' });
    assert.equal(second, first);
    assert.equal(second.llm.geminiApiKey, 'first');

    resetConfig();
    const third = getConfig({ GEMINI_API_KEY: 'third' });
    assert.equal(third.llm.geminiApiKey, 'third');
  });
});

describe('loadEnvFileIfPresent', () => {
  it('loads a .env file into process.env without overriding existing values', () => {
    const dir = mkdtempSync(join(tmpdir(), 'recruitai-env-'));
    const file = join(dir, '.env');
    writeFileSync(file, 'RECRUITAI_TEST_FROM_FILE=loaded\nRECRUITAI_TEST_PRECEDENCE=from-file\n');

    process.env.RECRUITAI_TEST_PRECEDENCE = 'from-process';
    try {
      loadEnvFileIfPresent(file);
      assert.equal(process.env.RECRUITAI_TEST_FROM_FILE, 'loaded');
      assert.equal(process.env.RECRUITAI_TEST_PRECEDENCE, 'from-process');
    } finally {
      delete process.env.RECRUITAI_TEST_FROM_FILE;
      delete process.env.RECRUITAI_TEST_PRECEDENCE;
    }
  });

  it('is a no-op when the file is absent', () => {
    assert.doesNotThrow(() => loadEnvFileIfPresent('/nonexistent/recruitai/.env'));
  });
});

describe('credit quota error contract', () => {
  it('builds the exact 402 detail body', () => {
    assert.deepEqual(insufficientCreditsBody(), {
      error: INSUFFICIENT_CREDITS,
      message: DEFAULT_INSUFFICIENT_CREDITS_MESSAGE,
      upgrade_url: CREDIT_UPGRADE_URL,
    });
    assert.equal(CREDIT_UPGRADE_URL, '/pricing');
    assert.equal(INSUFFICIENT_CREDITS, 'INSUFFICIENT_CREDITS');
  });

  it('supports the route-specific messages verbatim', () => {
    assert.equal(
      insufficientCreditsBody(EVALUATION_QUOTA_MESSAGE).message,
      'Candidate evaluation quota reached. Please upgrade to continue.',
    );
    assert.equal(
      insufficientCreditsBody(OUTREACH_QUOTA_MESSAGE).message,
      'Candidate outreach quota exhausted. Please upgrade to continue.',
    );
  });

  it('exposes a typed 402 error', () => {
    const error = new InsufficientCreditsError();
    assert.ok(error instanceof Error);
    assert.equal(error.statusCode, 402);
    assert.equal(error.name, 'InsufficientCreditsError');
    assert.deepEqual(error.detail, insufficientCreditsBody());

    const custom = new InsufficientCreditsError(OUTREACH_QUOTA_MESSAGE);
    assert.equal(custom.message, OUTREACH_QUOTA_MESSAGE);
    assert.equal(custom.detail.message, OUTREACH_QUOTA_MESSAGE);
  });
});
