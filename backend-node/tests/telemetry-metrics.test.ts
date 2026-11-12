import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import express from 'express';
import request from 'supertest';

import { createRequestMetricsMiddleware } from '../src/middleware/telemetry.js';
import { MAX_LATENCY_SAMPLES, RedMetricsRegistry } from '../src/telemetry/metrics.js';
import { startSpan, withSpan } from '../src/telemetry/tracing.js';

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('RED/USE metrics registry', () => {
  it('tracks rates, status breakdown, errors and latencies', () => {
    const registry = new RedMetricsRegistry(() => 1000);
    registry.recordRequest('/api/chat', 200, 10);
    registry.recordRequest('/api/chat', 200, 30);
    registry.recordRequest('/api/chat', 404, 20);
    registry.recordRequest('/api/chat', 500, 40);

    const summary = registry.getSummary();
    assert.equal(summary.uptime_seconds, 0);
    assert.equal(summary.red_metrics.requests_total, 4);
    assert.equal(summary.red_metrics.errors_total, 2);
    assert.equal(summary.red_metrics.error_rate, 0.5);
    assert.deepEqual(summary.red_metrics.status_breakdown, {
      '/api/chat:200': 2,
      '/api/chat:404': 1,
      '/api/chat:500': 1,
    });
    assert.deepEqual(summary.red_metrics.error_breakdown, {
      '/api/chat:4xx': 1,
      '/api/chat:5xx': 1,
    });
    assert.deepEqual(summary.red_metrics.latencies_ms['/api/chat'], {
      p50: 30,
      p90: 40,
      p95: 40,
      p99: 40,
      avg: 25,
    });
    assert.deepEqual(summary.use_metrics, { queue_depth: 0, active_workers: 0 });
    assert.deepEqual(summary.token_accounting, {
      tokens_in_total: 0,
      tokens_out_total: 0,
      cost_usd_total: 0,
    });
    assert.deepEqual(summary.slo_health, {
      availability_target_percent: 99.9,
      current_availability_percent: 50,
      slo_compliant: false,
    });
  });

  it('computes percentiles and caps each endpoint window at 500 samples', () => {
    const registry = new RedMetricsRegistry();
    for (let index = 0; index < MAX_LATENCY_SAMPLES; index += 1) {
      registry.recordRequest('/capped', 200, 1000);
    }
    registry.recordRequest('/capped', 200, 1);

    const percentiles = registry.getSummary().red_metrics.latencies_ms['/capped'];
    assert.ok(percentiles);
    // 499 x 1000 + 1 over 500 samples; without the cap the average would be
    // 998.01, because the window would hold 501 samples.
    assert.equal(percentiles.avg, 998);
    assert.equal(percentiles.p50, 1000);
    assert.equal(percentiles.p99, 1000);
  });

  it('records queue and token accounting', () => {
    const registry = new RedMetricsRegistry();
    registry.recordQueueState(7, 3);
    registry.recordTokens(100, 50, 1.23456789);

    const summary = registry.getSummary();
    assert.deepEqual(summary.use_metrics, { queue_depth: 7, active_workers: 3 });
    assert.equal(summary.token_accounting.tokens_in_total, 100);
    assert.equal(summary.token_accounting.tokens_out_total, 50);
    assert.equal(summary.token_accounting.cost_usd_total, 1.234568);
  });

  it('reports healthy SLOs before any traffic and supports reset', () => {
    const registry = new RedMetricsRegistry(() => 100);
    assert.equal(registry.getSummary().slo_health.slo_compliant, true);
    assert.equal(registry.getSummary().slo_health.current_availability_percent, 100);

    registry.recordRequest('/x', 500, 5);
    registry.recordQueueState(2, 1);
    registry.recordTokens(1, 1, 1);
    registry.reset();

    const summary = registry.getSummary();
    assert.equal(summary.red_metrics.requests_total, 0);
    assert.equal(summary.red_metrics.errors_total, 0);
    assert.deepEqual(summary.red_metrics.latencies_ms, {});
    assert.deepEqual(summary.use_metrics, { queue_depth: 0, active_workers: 0 });
    assert.equal(summary.token_accounting.cost_usd_total, 0);
  });

  it('exports the Prometheus exposition format', () => {
    const registry = new RedMetricsRegistry();
    registry.recordRequest('/api/chat', 200, 10);
    registry.recordQueueState(4, 2);
    registry.recordTokens(100, 50, 0.5);

    const text = registry.toPrometheusFormat();
    assert.match(text, /# HELP recruitai_requests_total Total HTTP requests handled/);
    assert.match(text, /# TYPE recruitai_requests_total counter/);
    assert.match(text, /recruitai_requests_total\{endpoint="\/api\/chat",status="200"\} 1/);
    assert.match(text, /recruitai_queue_depth 4/);
    assert.match(text, /recruitai_tokens_total\{type="input"\} 100/);
    assert.match(text, /recruitai_tokens_total\{type="output"\} 50/);
    assert.match(text, /recruitai_llm_cost_usd 0\.500000/);
    assert.ok(text.endsWith('\n'));
  });
});

describe('request metrics middleware', () => {
  function buildApp(registry: RedMetricsRegistry) {
    const app = express();
    app.use(createRequestMetricsMiddleware(registry));
    app.get('/ok', (_req, res) => {
      res.json({ ok: true });
    });
    app.get('/fail', () => {
      throw new Error('boom');
    });
    app.get('/users/:id', (_req, res) => {
      res.json({ ok: true });
    });
    app.use(
      (
        _error: unknown,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => {
        res.status(500).json({ detail: 'error' });
      },
    );
    return app;
  }

  it('records matched routes with bounded labels instead of raw URLs', async () => {
    const registry = new RedMetricsRegistry();
    const app = buildApp(registry);

    await request(app).get('/ok').expect(200);
    await request(app).get('/fail').expect(500);
    await request(app).get('/users/abc').expect(200);
    await request(app).get('/missing').expect(404);
    await flush();

    const breakdown = registry.getSummary().red_metrics.status_breakdown;
    assert.equal(breakdown['/ok:200'], 1);
    assert.equal(breakdown['/fail:500'], 1);
    assert.equal(breakdown['/users/:id:200'], 1);
    assert.equal(breakdown['unmatched:404'], 1);
    assert.equal(breakdown['/users/abc:200'], undefined);
  });
});

describe('span tracing', () => {
  it('creates OpenTelemetry-shaped spans', () => {
    const span = startSpan('screen', { component: 'router' });
    assert.match(span.traceId, /^[0-9a-f]{32}$/);
    assert.match(span.spanId, /^[0-9a-f]{16}$/);
    assert.deepEqual({ ...span.attributes }, { component: 'router' });
    assert.equal(span.status, 'OK');

    span.setAttribute('attempt', 2);
    span.addEvent('cache_miss', { key: 'resume' });
    const duration = span.finish();

    assert.ok(duration >= 0);
    assert.equal(span.attributes.attempt, 2);
    assert.equal(span.events.length, 1);
    assert.equal(span.events[0]?.name, 'cache_miss');
    assert.equal(span.events[0]?.attributes.key, 'resume');
  });

  it('finishes spans OK on success and ERROR on failure', async () => {
    const value = await withSpan(
      'ok-span',
      async (span) => {
        span.addEvent('step');
        return 42;
      },
      { component: 'test' },
    );
    assert.equal(value, 42);

    let captured: ReturnType<typeof startSpan> | undefined;
    await assert.rejects(
      withSpan('error-span', (span) => {
        captured = span;
        throw new Error('boom');
      }),
      /boom/,
    );
    assert.equal(captured?.status, 'ERROR');
    assert.equal(captured?.attributes.error, true);
    assert.equal(captured?.attributes['error.type'], 'Error');
  });
});
