import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  closeDatabase,
  createDatabase,
  createPoolOptions,
  getDatabase,
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
});

describe('Drizzle database client', () => {
  it('maps typed config onto pg pool options', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/recruitai',
      PG_POOL_MAX: '7',
      PG_IDLE_TIMEOUT_MS: '1234',
      PG_CONNECTION_TIMEOUT_MS: '4321',
    });
    assert.deepEqual(createPoolOptions(config), {
      connectionString: 'postgresql://user:pass@localhost:5432/recruitai',
      max: 7,
      idleTimeoutMillis: 1234,
      connectionTimeoutMillis: 4321,
      application_name: 'recruitai-backend-node',
    });
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
    assert.equal(typeof handle.db.select, 'function');
    await handle.pool.end();
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
