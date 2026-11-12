import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadConfig } from '../src/config/index.js';

describe('database configuration', () => {
  it('defaults the bounded pool and fallback path', () => {
    const config = loadConfig({});
    assert.deepEqual(config.database, {
      url: undefined,
      poolMax: 10,
      idleTimeoutMs: 30_000,
      connectionTimeoutMs: 5_000,
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
  });

  it('rejects negative pool timeouts', () => {
    assert.throws(() => loadConfig({ PG_IDLE_TIMEOUT_MS: '-1' }), /Invalid PG_IDLE_TIMEOUT_MS/);
    assert.throws(
      () => loadConfig({ PG_CONNECTION_TIMEOUT_MS: '-5' }),
      /Invalid PG_CONNECTION_TIMEOUT_MS/,
    );
  });
});
