import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadConfig } from '../src/config/index.js';
import {
  MIN_JWT_SECRET_LENGTH,
  evaluatePreflight,
  formatPreflightReport,
  looksLikePlaceholder,
  runPreflight,
  type PreflightReport,
} from '../src/config/preflight.js';

/**
 * Phase 19 production preflight tests.
 *
 * The valid fixture satisfies every hard gate; each test changes one value and
 * asserts the check that must catch it. No check may echo a secret value.
 */

const VALID_ENV = {
  ENVIRONMENT: 'production',
  NODE_ENV: 'production',
  GEMINI_API_KEY: 'gemini-ci-key-1234567890',
  TAVILY_API_KEY: 'tvly-ci-key-1234567890',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-ci-value-1234567890',
  SUPABASE_JWT_SECRET: 'j'.repeat(48),
  DATABASE_URL: 'postgresql://ci_user:ci_password@db.internal:5432/recruitai',
  ALLOWED_ORIGINS: 'https://recruitai.test,https://app.recruitai.test',
  USE_LOCAL_AUTH: 'false',
  LLM_DATA_USE_MODE: 'zero_retention_verified',
} as const;

function reportFor(overrides: Record<string, string | undefined> = {}): PreflightReport {
  const env = { ...VALID_ENV, ...overrides };
  return evaluatePreflight(loadConfig(env), env);
}

function check(report: PreflightReport, id: string) {
  const result = report.checks.find((candidate) => candidate.id === id);
  assert.ok(result, `missing check ${id}`);
  return result;
}

describe('production preflight', () => {
  it('passes a complete production configuration with expected warnings', () => {
    const report = reportFor();

    assert.equal(report.ok, true);
    for (const id of [
      'environment',
      'required-keys',
      'llm-data-use',
      'jwt-secret',
      'database-url',
      'local-auth',
      'cors-origins',
      'secret-placeholders',
      'rate-limit',
    ]) {
      assert.equal(check(report, id).status, 'pass', id);
    }

    // Optional integrations are warnings, not failures.
    assert.equal(check(report, 'smtp').status, 'warn');
    assert.equal(check(report, 'razorpay').status, 'warn');
    assert.equal(check(report, 'redis').status, 'warn');
  });

  it('fails when the JWT secret is missing, short or a placeholder', () => {
    for (const secret of [undefined, 'short', 'changeme-'.padEnd(MIN_JWT_SECRET_LENGTH, 'x')]) {
      const report = reportFor({ SUPABASE_JWT_SECRET: secret });
      assert.equal(report.ok, false);
      assert.equal(check(report, 'jwt-secret').status, 'fail');
    }
  });

  it('fails when no direct PostgreSQL URL is configured', () => {
    for (const url of [undefined, 'https://project.supabase.co', 'postgresql://changeme@db/x']) {
      const report = reportFor({ DATABASE_URL: url, SUPABASE_DB_URL: undefined });
      assert.equal(report.ok, false);
      assert.equal(check(report, 'database-url').status, 'fail');
    }
  });

  it('accepts SUPABASE_DB_URL when DATABASE_URL is unset', () => {
    const report = reportFor({
      DATABASE_URL: undefined,
      SUPABASE_DB_URL: 'postgresql://ci_user:ci_password@db.internal:5432/recruitai',
    });
    assert.equal(check(report, 'database-url').status, 'pass');
  });

  it('fails on a loopback CORS origin', () => {
    const report = reportFor({
      ALLOWED_ORIGINS: 'https://recruitai.test,http://localhost:3000',
    });
    assert.equal(report.ok, false);
    assert.equal(check(report, 'cors-origins').status, 'fail');
    assert.match(check(report, 'cors-origins').detail, /localhost/);
  });

  it('fails when local development auth is requested', () => {
    const report = reportFor({ USE_LOCAL_AUTH: 'true' });
    assert.equal(report.ok, false);
    assert.equal(check(report, 'local-auth').status, 'fail');
  });

  it('detects placeholder secrets but never echoes their values', () => {
    const report = reportFor({ GEMINI_API_KEY: 'your_gemini_api_key' });
    assert.equal(report.ok, false);
    assert.deepEqual(
      check(report, 'secret-placeholders').detail,
      'placeholder values in GEMINI_API_KEY',
    );
    assert.doesNotMatch(JSON.stringify(report), /your_gemini_api_key/);
  });

  it('fails partial SMTP and Razorpay configuration', () => {
    const smtp = reportFor({ SMTP_USERNAME: 'outreach@recruitai.test' });
    assert.equal(check(smtp, 'smtp').status, 'fail');

    const razorpay = reportFor({ RAZORPAY_KEY_ID: 'rzp_test_123' });
    assert.equal(check(razorpay, 'razorpay').status, 'fail');
  });

  it('passes fully configured SMTP and Razorpay', () => {
    const report = reportFor({
      SMTP_USERNAME: 'outreach@recruitai.test',
      SMTP_PASSWORD: 'smtp-secret-value',
      SMTP_SENDER: 'outreach@recruitai.test',
      RAZORPAY_KEY_ID: 'rzp_test_123',
      RAZORPAY_KEY_SECRET: 'razorpay-secret',
      RAZORPAY_WEBHOOK_SECRET: 'webhook-secret',
    });
    assert.equal(check(report, 'smtp').status, 'pass');
    assert.equal(check(report, 'razorpay').status, 'pass');
    assert.equal(report.ok, true);
  });

  it('warns instead of failing for degraded-but-deliberate switches', () => {
    const report = reportFor({
      LLM_KILL_SWITCH: 'true',
      LOG_LEVEL: 'debug',
      RATE_LIMIT_ENABLED: 'false',
      TRUST_PROXY: 'true',
      RETENTION_JOB_ENABLED: 'true',
    });
    assert.equal(report.ok, true);
    for (const id of [
      'llm-kill-switch',
      'log-level',
      'rate-limit',
      'trust-proxy',
      'retention-scheduler',
    ]) {
      assert.equal(check(report, id).status, 'warn', id);
    }
  });

  it('fails outside production', () => {
    const report = runPreflight({
      ENVIRONMENT: 'staging',
      LLM_DATA_USE_MODE: 'zero_retention_verified',
    });
    assert.equal(report.ok, false);
    assert.equal(check(report, 'environment').status, 'fail');
  });

  it('reports a config-load failure instead of throwing', () => {
    const report = runPreflight({ ENVIRONMENT: 'production' });
    assert.equal(report.ok, false);
    assert.equal(report.checks.length, 1);
    assert.equal(check(report, 'config-load').status, 'fail');
    assert.match(check(report, 'config-load').detail, /Missing required production configuration/);
  });

  it('renders a summary with counts and no secrets', () => {
    const lines = formatPreflightReport(reportFor());
    assert.match(
      lines.at(-1) ?? '',
      /^PASS production preflight: \d+ passed, 3 warning\(s\), 0 failure\(s\)$/,
    );
    assert.ok(!lines.join('\n').includes(VALID_ENV.SUPABASE_JWT_SECRET));
  });

  it('recognises the documented placeholder markers', () => {
    assert.equal(looksLikePlaceholder('your_gemini_key'), true);
    assert.equal(looksLikePlaceholder('REPLACE_ME'), true);
    assert.equal(looksLikePlaceholder('a-real-looking-secret-123'), false);
  });
});
