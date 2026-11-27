import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  closeDatabase,
  createDatabase,
  createPoolOptions,
  createSessionOptions,
  getDatabase,
  getPoolStats,
  getReadDatabase,
  resetDatabaseForTests,
} from '../src/db/client.js';
import {
  DATABASE_MISSING_IN_PRODUCTION,
  DATABASE_URL_MISSING,
  DatabaseUnavailableError,
} from '../src/db/errors.js';
import { loadConfig, resetConfig } from '../src/config/index.js';

const PRODUCTION_ENV = {
  ENVIRONMENT: 'production',
  LLM_DATA_USE_MODE: 'zero_retention_verified',
  GEMINI_API_KEY: 'test-gemini',
  TAVILY_API_KEY: 'test-tavily',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
  PORT: '8000',
};

afterEach(async () => {
  await closeDatabase();
  resetConfig();
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_READ_URL;
  delete process.env.PG_POOL_MAX;
  delete process.env.PG_READ_POOL_MAX;
});

describe('Drizzle database client', () => {
  it('maps typed config onto primary pg pool options', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/recruitai',
      PG_POOL_MAX: '7',
      PG_IDLE_TIMEOUT_MS: '1234',
      PG_CONNECTION_TIMEOUT_MS: '4321',
      PG_STATEMENT_TIMEOUT_MS: '9000',
      PG_IDLE_IN_TRANSACTION_TIMEOUT_MS: '11000',
    });
    assert.deepEqual(createPoolOptions(config), {
      connectionString: 'postgresql://user:pass@localhost:5432/recruitai',
      max: 7,
      idleTimeoutMillis: 1234,
      connectionTimeoutMillis: 4321,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      options: '-c statement_timeout=9000 -c idle_in_transaction_session_timeout=11000',
      application_name: 'recruitai-backend:primary',
    });
  });

  it('uses the replica URL and read pool size for the read role', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://primary',
      DATABASE_READ_URL: 'postgresql://replica',
      PG_POOL_MAX: '9',
      PG_READ_POOL_MAX: '4',
    });
    const options = createPoolOptions(config, 'read');
    assert.equal(options.connectionString, 'postgresql://replica');
    assert.equal(options.max, 4);
    assert.equal(options.application_name, 'recruitai-backend:read');
  });

  it('renders integer session timeouts', () => {
    assert.equal(
      createSessionOptions({ statementTimeoutMs: 5000, idleInTransactionTimeoutMs: 20_000 }),
      '-c statement_timeout=5000 -c idle_in_transaction_session_timeout=20000',
    );
  });

  it('creates one bounded pool and a Drizzle handle', async () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/recruitai',
      PG_POOL_MAX: '3',
    });
    const handle = createDatabase(config);
    assert.equal(handle.pool.options.max, 3);
    assert.equal(handle.pool.options.idleTimeoutMillis, 30_000);
    assert.equal(handle.pool.options.connectionTimeoutMillis, 5_000);
    assert.equal(handle.pool.options.options?.includes('statement_timeout=15000'), true);
    assert.equal(handle.role, 'primary');
    assert.equal(typeof handle.db.select, 'function');
    await handle.pool.end();
  });

  it('returns the primary read handle when no replica is configured', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/recruitai';
    resetConfig();
    resetDatabaseForTests();

    const primary = getDatabase();
    assert.equal(getReadDatabase(), primary);
    assert.equal(getPoolStats().length, 1);
  });

  it('creates a separate bounded read pool when DATABASE_READ_URL is set', () => {
    process.env.DATABASE_URL = 'postgresql://primary';
    process.env.DATABASE_READ_URL = 'postgresql://replica';
    process.env.PG_POOL_MAX = '6';
    process.env.PG_READ_POOL_MAX = '2';
    resetConfig();
    resetDatabaseForTests();

    const primary = getDatabase();
    const read = getReadDatabase();
    assert.notEqual(read, primary);
    assert.equal(read.role, 'read');
    assert.equal(read.pool.options.max, 2);
    assert.equal(read.pool.options.connectionString, 'postgresql://replica');

    const stats = getPoolStats().sort((left, right) => left.role.localeCompare(right.role));
    assert.deepEqual(
      stats.map(({ role, max }) => ({ role, max })),
      [
        { role: 'primary', max: 6 },
        { role: 'read', max: 2 },
      ],
    );
  });

  it('fails with the Python development message when DATABASE_URL is absent', () => {
    const config = loadConfig({ ENVIRONMENT: 'development' });
    assert.throws(
      () => createDatabase(config),
      (error: unknown) =>
        error instanceof DatabaseUnavailableError &&
        error.statusCode === 503 &&
        error.detail === DATABASE_URL_MISSING,
    );
  });

  it('fails with the Python production message when configuration is missing', () => {
    const config = loadConfig(PRODUCTION_ENV);
    assert.throws(
      () => createDatabase(config),
      (error: unknown) =>
        error instanceof DatabaseUnavailableError &&
        error.statusCode === 503 &&
        error.detail === DATABASE_MISSING_IN_PRODUCTION,
    );
  });

  it('caches the process-wide handle and can close it', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/recruitai';
    resetConfig();
    resetDatabaseForTests();

    const first = getDatabase();
    const second = getDatabase();
    assert.equal(first, second);

    await closeDatabase();
    resetDatabaseForTests();
  });
});
