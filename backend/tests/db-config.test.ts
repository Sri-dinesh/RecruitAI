import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadConfig } from '../src/config/index.js';

describe('database configuration', () => {
  it('defaults the bounded pools, session timeouts and fallback path', () => {
    const config = loadConfig({});
    assert.deepEqual(config.database, {
      url: undefined,
      poolMax: 10,
      idleTimeoutMs: 30_000,
      connectionTimeoutMs: 5_000,
      readUrl: undefined,
      readPoolMax: 10,
      statementTimeoutMs: 15_000,
      idleInTransactionTimeoutMs: 30_000,
      transactionTimeoutMs: 10_000,
      sweepBatchSize: 500,
      insertBatchSize: 500,
      listMaxLimit: 1_000,
      fallbackPath: 'recruitai_fallback.db',
    });
  });

  it('reads DATABASE_URL and the pool settings from env', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://user:pass@db.example.com:5432/recruitai',
      PG_POOL_MAX: '25',
      PG_IDLE_TIMEOUT_MS: '15000',
      PG_CONNECTION_TIMEOUT_MS: '2500',
      SQLITE_FALLBACK_PATH: '/tmp/recruitai.db',
    });
    assert.equal(config.database.url, 'postgresql://user:pass@db.example.com:5432/recruitai');
    assert.equal(config.database.poolMax, 25);
    assert.equal(config.database.idleTimeoutMs, 15_000);
    assert.equal(config.database.connectionTimeoutMs, 2_500);
    assert.equal(config.database.fallbackPath, '/tmp/recruitai.db');
    // The read pool follows the primary pool size unless set explicitly.
    assert.equal(config.database.readPoolMax, 25);
  });

  it('reads the read-replica and Phase 22 tuning settings', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://primary',
      DATABASE_READ_URL: 'postgresql://replica',
      PG_POOL_MAX: '12',
      PG_READ_POOL_MAX: '4',
      PG_STATEMENT_TIMEOUT_MS: '8000',
      PG_IDLE_IN_TRANSACTION_TIMEOUT_MS: '20000',
      PG_TRANSACTION_TIMEOUT_MS: '6000',
      DB_SWEEP_BATCH_SIZE: '250',
      DB_INSERT_BATCH_SIZE: '100',
      DB_LIST_MAX_LIMIT: '500',
    });
    assert.equal(config.database.readUrl, 'postgresql://replica');
    assert.equal(config.database.readPoolMax, 4);
    assert.equal(config.database.statementTimeoutMs, 8_000);
    assert.equal(config.database.idleInTransactionTimeoutMs, 20_000);
    assert.equal(config.database.transactionTimeoutMs, 6_000);
    assert.equal(config.database.sweepBatchSize, 250);
    assert.equal(config.database.insertBatchSize, 100);
    assert.equal(config.database.listMaxLimit, 500);
  });

  it('accepts SUPABASE_DB_URL when DATABASE_URL is absent', () => {
    const config = loadConfig({
      SUPABASE_DB_URL: 'postgresql://postgres:secret@localhost:5432/postgres',
    });
    assert.equal(config.database.url, 'postgresql://postgres:secret@localhost:5432/postgres');
  });

  it('prefers DATABASE_URL over SUPABASE_DB_URL', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://primary',
      SUPABASE_DB_URL: 'postgresql://fallback',
    });
    assert.equal(config.database.url, 'postgresql://primary');
  });

  it('rejects a non-positive pool size instead of silently clamping', () => {
    assert.throws(() => loadConfig({ PG_POOL_MAX: '0' }), /Invalid PG_POOL_MAX/);
    assert.throws(() => loadConfig({ PG_POOL_MAX: '-1' }), /Invalid PG_POOL_MAX/);
    assert.throws(() => loadConfig({ PG_POOL_MAX: 'ten' }), /Invalid PG_POOL_MAX/);
    assert.throws(() => loadConfig({ PG_READ_POOL_MAX: '0' }), /Invalid PG_READ_POOL_MAX/);
  });

  it('rejects negative pool timeouts', () => {
    assert.throws(() => loadConfig({ PG_IDLE_TIMEOUT_MS: '-1' }), /Invalid PG_IDLE_TIMEOUT_MS/);
    assert.throws(
      () => loadConfig({ PG_CONNECTION_TIMEOUT_MS: '-5' }),
      /Invalid PG_CONNECTION_TIMEOUT_MS/,
    );
    assert.throws(
      () => loadConfig({ PG_STATEMENT_TIMEOUT_MS: '0' }),
      /Invalid PG_STATEMENT_TIMEOUT_MS/,
    );
    assert.throws(
      () => loadConfig({ PG_TRANSACTION_TIMEOUT_MS: '-1' }),
      /Invalid PG_TRANSACTION_TIMEOUT_MS/,
    );
  });

  it('defaults hot-read caching and the payment idempotency window', () => {
    const config = loadConfig({});
    assert.deepEqual(config.cache, {
      hotReadsEnabled: true,
      creditsTtlSeconds: 15,
      subscriptionTtlSeconds: 30,
      analyticsTtlSeconds: 30,
      jdParseEnabled: true,
      jdParseTtlSeconds: 3600,
    });
    assert.equal(config.payments.idempotencyTtlSeconds, 86_400);
  });

  it('reads cache and idempotency overrides', () => {
    const config = loadConfig({
      CACHE_HOT_READS_ENABLED: 'false',
      CACHE_CREDITS_TTL_SECONDS: '5',
      CACHE_SUBSCRIPTION_TTL_SECONDS: '10',
      CACHE_ANALYTICS_TTL_SECONDS: '60',
      CACHE_JD_PARSE_ENABLED: 'false',
      CACHE_JD_PARSE_TTL_SECONDS: '120',
      PAYMENT_IDEMPOTENCY_TTL_SECONDS: '3600',
    });
    assert.equal(config.cache.hotReadsEnabled, false);
    assert.equal(config.cache.creditsTtlSeconds, 5);
    assert.equal(config.cache.subscriptionTtlSeconds, 10);
    assert.equal(config.cache.analyticsTtlSeconds, 60);
    assert.equal(config.cache.jdParseEnabled, false);
    assert.equal(config.cache.jdParseTtlSeconds, 120);
    assert.equal(config.payments.idempotencyTtlSeconds, 3_600);
  });
});
