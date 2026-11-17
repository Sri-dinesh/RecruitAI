import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import request from 'supertest';

import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/index.js';
import { RedMetricsRegistry } from '../src/telemetry/metrics.js';

function buildApp(env: Record<string, string | undefined> = {}) {
  const registry = new RedMetricsRegistry();
  const config = loadConfig({ USE_LOCAL_AUTH: 'true', ...env });
  return { registry, app: createApp({ config, metrics: registry }) };
}

describe('GET /api/metrics', () => {
  it('returns the JSON summary for authenticated callers', async () => {
    const { app } = buildApp();
    const response = await request(app).get('/api/metrics').expect(200);

    assert.match(response.headers['content-type'] ?? '', /^application\/json/);
    assert.equal(response.body.red_metrics.requests_total, 0);
    assert.equal(response.body.red_metrics.error_rate, 0);
    assert.deepEqual(response.body.use_metrics, { queue_depth: 0, active_workers: 0 });
    assert.deepEqual(response.body.token_accounting, {
      tokens_in_total: 0,
      tokens_out_total: 0,
      cost_usd_total: 0,
    });
    assert.deepEqual(response.body.slo_health, {
      availability_target_percent: 99.9,
      current_availability_percent: 100,
      slo_compliant: true,
    });
  });

  it('returns Prometheus text when Accept includes text/plain', async () => {
    const { app } = buildApp();
    // Produce one real sample first; `recordRequest` runs on `finish`.
    await request(app).get('/health').expect(200);
    await new Promise((resolve) => setImmediate(resolve));

    const response = await request(app).get('/api/metrics').set('Accept', 'text/plain').expect(200);

    assert.match(response.headers['content-type'] ?? '', /^text\/plain/);
    // Stable names referenced by docs/slo.md alerting and scraping.
    for (const metric of [
      'recruitai_requests_total',
      'recruitai_queue_depth',
      'recruitai_tokens_total',
      'recruitai_llm_cost_usd',
    ]) {
      assert.match(response.text, new RegExp(`# HELP ${metric} `));
      assert.match(response.text, new RegExp(`# TYPE ${metric} `));
    }
    assert.match(response.text, /recruitai_requests_total\{endpoint="\/health",status="200"\} 1/);
    assert.match(response.text, /recruitai_tokens_total\{type="input"\} \d+/);
  });

  it('keeps the JSON summary for every other Accept value', async () => {
    const { app } = buildApp();
    for (const accept of ['application/json', '*/*', undefined]) {
      const pending = request(app).get('/api/metrics');
      const response = await (
        accept === undefined ? pending : pending.set('Accept', accept)
      ).expect(200);
      assert.match(response.headers['content-type'] ?? '', /^application\/json/);
      assert.ok('red_metrics' in response.body);
      assert.ok('use_metrics' in response.body);
      assert.ok('token_accounting' in response.body);
    }
  });

  it('requires authentication', async () => {
    const registry = new RedMetricsRegistry();
    const config = loadConfig({
      USE_LOCAL_AUTH: 'false',
      SUPABASE_JWT_SECRET: 'test-secret-key-that-is-at-least-32-bytes-long',
    });
    const app = createApp({ config, metrics: registry });

    const response = await request(app).get('/api/metrics').expect(401);
    assert.equal(response.headers['www-authenticate'], 'Bearer');
    assert.deepEqual(response.body, {
      detail: 'Authentication required. Please log in to continue.',
    });
  });

  it('is instrumented by the request metrics middleware', async () => {
    const { app, registry } = buildApp();
    await request(app).get('/api/metrics').expect(200);
    await new Promise((resolve) => setImmediate(resolve));

    const breakdown = registry.getSummary().red_metrics.status_breakdown;
    assert.equal(breakdown['/api/metrics:200'], 1);
  });

  it('does not emit the Express fingerprint header', async () => {
    const { app } = buildApp();
    const response = await request(app).get('/api/metrics').expect(200);
    assert.equal(response.headers['x-powered-by'], undefined);
  });
});
