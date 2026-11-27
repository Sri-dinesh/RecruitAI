import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_STABILIZATION_THRESHOLDS,
  STABLE_METRIC_NAMES,
  evaluateStabilization,
  formatStabilizationReport,
  parseMetricsSnapshot,
  readStabilizationConfig,
  runStabilizationCli,
  summarizeStatusBreakdown,
  type ProbeResult,
  type StabilizationFlags,
  type StabilizationInput,
  type StabilizationThresholds,
} from '../src/cli/stabilization.js';

/**
 * Phase 20 stabilization checks.
 *
 * These tests pin the evaluation logic, not the network probes: fixtures are
 * the exact JSON/HTTP shapes the backend already returns, with one field
 * changed per case to prove the corresponding check fires.
 */

const HEALTHY_FLAGS: StabilizationFlags = {
  allowDegraded: false,
  allowSqlite: false,
  allowLocalAuth: false,
  strict: false,
};

const THRESHOLDS: StabilizationThresholds = { ...DEFAULT_STABILIZATION_THRESHOLDS };

function liveness(overrides: Record<string, unknown> = {}): ProbeResult {
  return {
    ok: true,
    status: 200,
    body: { status: 'healthy', version: '2.0.0', ...overrides },
  };
}

function readiness(overrides: Record<string, unknown> = {}): ProbeResult {
  return {
    ok: true,
    status: 200,
    body: {
      status: 'healthy',
      services: {
        database: { status: 'healthy', type: 'supabase_postgresql', latency_ms: 4 },
        llm: { status: 'configured' },
        auth: { mode: 'supabase_jwt' },
      },
      ...overrides,
    },
  };
}

function metricsBody(
  statusBreakdown: Record<string, number>,
  options: { queueDepth?: number; sloCompliant?: boolean; errorRate?: number } = {},
): unknown {
  return {
    red_metrics: {
      status_breakdown: statusBreakdown,
      error_rate: options.errorRate ?? 0,
    },
    use_metrics: { queue_depth: options.queueDepth ?? 0 },
    slo_health: { slo_compliant: options.sloCompliant ?? true },
  };
}

function metrics(body: unknown = metricsBody({ '/api/sessions:200': 1_000 })): ProbeResult {
  return { ok: true, status: 200, body };
}

function prometheus(): ProbeResult {
  return { ok: true, status: 200, text: STABLE_METRIC_NAMES.join('\n') };
}

function input(overrides: Partial<StabilizationInput> = {}): StabilizationInput {
  return {
    liveness: liveness(),
    readiness: readiness(),
    metrics: metrics(),
    prometheus: prometheus(),
    thresholds: THRESHOLDS,
    flags: HEALTHY_FLAGS,
    ...overrides,
  };
}

function check(report: ReturnType<typeof evaluateStabilization>, id: string) {
  const found = report.checks.find((candidate) => candidate.id === id);
  assert.ok(found, `missing check ${id}`);
  return found;
}

describe('stabilization status buckets', () => {
  it('separates 5xx, auth, payment, validation and webhook statuses', () => {
    const buckets = summarizeStatusBreakdown({
      '/api/sessions:200': 80,
      '/api/users/me:401': 4,
      '/api/email/send:402': 3,
      '/api/chat:422': 2,
      '/api/sessions:500': 1,
      '/api/payments/webhook:400': 2,
      '/api/payments/webhook:200': 8,
      'unmatched:404': 1,
    });

    assert.deepEqual(buckets, {
      total: 101,
      fiveXx: 1,
      fourXx: 12,
      authFailures: 4,
      paymentRequired: 3,
      validation: 2,
      webhookTotal: 10,
      webhookFailures: 2,
      webhook5xx: 0,
    });
  });

  it('rejects a metrics body without the expected shape', () => {
    assert.throws(() => parseMetricsSnapshot({}), /missing red_metrics/);
    assert.throws(
      () => parseMetricsSnapshot({ red_metrics: {} }),
      /missing red_metrics.status_breakdown/,
    );
  });
});

describe('stabilization evaluation', () => {
  it('passes a healthy production window', () => {
    const report = evaluateStabilization(input());

    assert.equal(report.ok, true);
    for (const id of [
      'liveness',
      'readiness',
      'readiness-database',
      'readiness-auth',
      'readiness-llm',
      'metrics',
      'prometheus',
      'error-budget',
      'queue-depth',
    ]) {
      assert.equal(check(report, id).status, 'pass', id);
    }
    assert.equal(check(report, 'webhook').status, 'skip'); // no deliveries in fixture
  });

  it('fails liveness, readiness and unhealthy databases', () => {
    const dead = evaluateStabilization(
      input({
        liveness: { ok: false, error: 'ECONNREFUSED' },
        readiness: { ok: false, error: 'ECONNREFUSED' },
      }),
    );
    assert.equal(dead.ok, false);
    assert.equal(check(dead, 'liveness').status, 'fail');
    assert.equal(check(dead, 'readiness').status, 'fail');

    const unhealthy = evaluateStabilization(
      input({
        readiness: {
          ok: true,
          status: 503,
          body: { status: 'unhealthy', services: {} },
        },
      }),
    );
    assert.equal(unhealthy.ok, false);
    assert.equal(check(unhealthy, 'readiness').status, 'fail');
  });

  it('fails a SQLite fallback or local auth unless explicitly allowed', () => {
    const fallback = readiness({
      status: 'degraded',
      services: {
        database: { status: 'healthy', type: 'sqlite_fallback', latency_ms: 1 },
        llm: { status: 'configured' },
        auth: { mode: 'local_dev' },
      },
    });

    const strict = evaluateStabilization(input({ readiness: fallback }));
    assert.equal(strict.ok, false);
    assert.equal(check(strict, 'readiness-database').status, 'fail');
    assert.equal(check(strict, 'readiness-auth').status, 'fail');
    assert.equal(check(strict, 'readiness').status, 'warn');

    const local = evaluateStabilization(
      input({
        readiness: fallback,
        flags: { ...HEALTHY_FLAGS, allowSqlite: true, allowLocalAuth: true, allowDegraded: true },
      }),
    );
    assert.equal(local.ok, true);
    assert.equal(check(local, 'readiness-database').status, 'warn');
    assert.equal(check(local, 'readiness-auth').status, 'warn');
  });

  it('fails when 5xx is above the availability budget', () => {
    const report = evaluateStabilization(
      input({
        metrics: metrics(
          metricsBody({ '/api/sessions:200': 998, '/api/sessions:500': 2 }, { errorRate: 0.002 }),
        ),
      }),
    );

    assert.equal(report.ok, false);
    assert.equal(check(report, 'error-budget').status, 'fail');
    assert.match(check(report, 'error-budget').detail, /0\.20%/);
  });

  it('warns on 401/402/422 spikes and strict mode turns warnings into failures', () => {
    const body = metricsBody({
      '/api/sessions:200': 900,
      '/api/users/me:401': 40,
      '/api/email/send:402': 60,
      '/api/chat:422': 30,
    });

    const standard = evaluateStabilization(input({ metrics: metrics(body) }));
    assert.equal(standard.ok, true);
    for (const id of ['auth-failures', 'payment-required', 'validation']) {
      assert.equal(check(standard, id).status, 'warn', id);
    }

    const strict = evaluateStabilization(
      input({ metrics: metrics(body), flags: { ...HEALTHY_FLAGS, strict: true } }),
    );
    assert.equal(strict.ok, false);
    assert.equal(check(strict, 'auth-failures').status, 'fail');
  });

  it('skips noisy rate checks below the sample floor', () => {
    const report = evaluateStabilization(
      input({ metrics: metrics(metricsBody({ '/api/sessions:500': 1 })) }),
    );

    assert.equal(report.ok, true);
    assert.equal(check(report, 'error-budget').status, 'skip');
    assert.equal(check(report, 'auth-failures').status, 'skip');
  });

  it('fails queue backpressure and webhook handler errors', () => {
    const body = metricsBody(
      {
        '/api/sessions:200': 1_000,
        '/api/payments/webhook:500': 1,
        '/api/payments/webhook:200': 10,
      },
      { queueDepth: 75 },
    );
    const report = evaluateStabilization(input({ metrics: metrics(body) }));

    assert.equal(report.ok, false);
    assert.equal(check(report, 'queue-depth').status, 'fail');
    assert.equal(check(report, 'webhook').status, 'fail');
    assert.match(check(report, 'webhook').detail, /1 are 5xx/);
  });

  it('warns on rejected webhook deliveries that are 4xx only', () => {
    const body = metricsBody({
      '/api/sessions:200': 1_000,
      '/api/payments/webhook:400': 2,
      '/api/payments/webhook:200': 20,
    });
    const report = evaluateStabilization(input({ metrics: metrics(body) }));

    assert.equal(report.ok, true);
    assert.equal(check(report, 'webhook').status, 'warn');
  });

  it('warns when the 5xx rate drifts above the Python baseline', () => {
    const node = metrics(metricsBody({ '/api/sessions:200': 999, '/api/sessions:500': 1 }));
    const baseline: ProbeResult = {
      ok: true,
      status: 200,
      body: metricsBody({ '/api/sessions:200': 1_000 }),
    };
    const report = evaluateStabilization(input({ metrics: node, baseline }));

    assert.equal(report.ok, true);
    assert.equal(check(report, 'baseline').status, 'warn');
    assert.match(check(report, 'baseline').detail, /5xx drift/);
  });

  it('warns when the reported SLO disagrees only because 4xx counts as an error', () => {
    const body = metricsBody(
      { '/api/sessions:200': 950, '/api/users/me:401': 50 },
      { sloCompliant: false, errorRate: 0.05 },
    );
    const report = evaluateStabilization(input({ metrics: metrics(body) }));

    assert.equal(report.ok, true);
    assert.equal(check(report, 'slo-health').status, 'warn');
    assert.match(check(report, 'slo-health').detail, /count 4xx in error_rate/);
  });
});

describe('stabilization CLI configuration', () => {
  it('reads thresholds and local-verification flags from the environment', () => {
    const config = readStabilizationConfig(
      {
        STABILIZATION_BASE_URL: 'https://node.example.com/',
        STABILIZATION_BEARER_TOKEN: 'token',
        STABILIZATION_ALLOW_SQLITE: 'true',
        STABILIZATION_ALLOW_LOCAL_AUTH: 'true',
        STABILIZATION_MIN_REQUESTS: '500',
      },
      [],
    );

    assert.equal(config.nodeBaseUrl, 'https://node.example.com');
    assert.equal(config.bearerToken, 'token');
    assert.equal(config.flags.allowSqlite, true);
    assert.equal(config.flags.allowLocalAuth, true);
    assert.equal(config.thresholds.minRequests, 500);
  });

  it('rejects invalid numbers and booleans instead of silently defaulting', () => {
    assert.throws(
      () => readStabilizationConfig({ STABILIZATION_MAX_5XX_RATE: '2' }, []),
      /must be <= 1/,
    );
    assert.throws(
      () => readStabilizationConfig({ STABILIZATION_STRICT: 'maybe' }, []),
      /Invalid STABILIZATION_STRICT/,
    );
  });

  it('prints usage for --help without probing the network', async () => {
    const lines: string[] = [];
    const code = await runStabilizationCli(
      { STABILIZATION_BASE_URL: 'http://127.0.0.1:1' },
      ['--help'],
      (line) => lines.push(line),
    );
    assert.equal(code, 0);
    assert.match(lines.join('\n'), /Read-only post-cutover stabilization check/);
  });
});

describe('stabilization report rendering', () => {
  it('summarises counts and never prints a bearer token', () => {
    const report = evaluateStabilization(
      input({ metrics: metrics(metricsBody({ '/api/sessions:200': 10 })) }),
    );
    const rendered = formatStabilizationReport(report).join('\n');

    assert.match(rendered, /stabilization check/);
    assert.match(rendered, /passed/);
    assert.ok(!rendered.includes('STABILIZATION_BEARER_TOKEN'));
  });
});
