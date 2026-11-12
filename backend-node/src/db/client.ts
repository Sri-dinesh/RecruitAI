import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';

import { getConfig, type AppConfig } from '../config/index.js';
import {
  DATABASE_MISSING_IN_PRODUCTION,
  DATABASE_URL_MISSING,
  DatabaseUnavailableError,
} from './errors.js';
import * as schema from './schema.js';

/**
 * Direct-TCP PostgreSQL client (Drizzle + node-postgres).
 *
 * Design rules from the migration plan:
 * - One bounded pool per process, created once. Never a connection per request.
 * - Connection settings come from typed config, never `process.env` inline.
 * - SQL migrations remain the schema source of truth; this is introspection.
 *
 * Phase 22 tunes the pool and routes analytics reads to a replica; the settings
 * (`PG_POOL_MAX`, `PG_IDLE_TIMEOUT_MS`, `PG_CONNECTION_TIMEOUT_MS`) are already
 * read here so that tuning is a configuration change, not a refactor.
 */

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseHandle {
  readonly pool: Pool;
  readonly db: Database;
}

/** Build pg pool options from typed config. Exported for tests/diagnostics. */
export function createPoolOptions(config: AppConfig = getConfig()): PoolConfig {
  return {
    connectionString: config.database.url,
    max: config.database.poolMax,
    idleTimeoutMillis: config.database.idleTimeoutMs,
    connectionTimeoutMillis: config.database.connectionTimeoutMs,
    // Keep sessions labelled for pool debugging without leaking credentials.
    application_name: 'recruitai-backend-node',
  };
}

/**
 * Create a pool + Drizzle instance. Construction is lazy: node-postgres does
 * not open a socket until the first query, so this is safe at module load.
 */
export function createDatabase(config: AppConfig = getConfig()): DatabaseHandle {
  if (!config.database.url) {
    throw new DatabaseUnavailableError(
      config.isProduction ? DATABASE_MISSING_IN_PRODUCTION : DATABASE_URL_MISSING,
    );
  }

  const pool = new Pool(createPoolOptions(config));
  // Idle-client failures are emitted asynchronously; without a listener they
  // would crash the process. Log the reason only (no connection string).
  pool.on('error', (error: Error) => {
    console.error(`[db] idle PostgreSQL client error: ${error.message}`);
  });

  const db = drizzle(pool, { schema });
  return { pool, db };
}

let cached: DatabaseHandle | undefined;

/**
 * Process-wide database handle. Feature code calls `getDb()`; bootstrap calls
 * `closeDatabase()` during graceful shutdown.
 */
export function getDatabase(): DatabaseHandle {
  cached ??= createDatabase();
  return cached;
}

/** Drizzle instance backed by the shared pool. */
export function getDb(): Database {
  return getDatabase().db;
}

/** Close the pool and drop the singleton (safe to call when uninitialised). */
export async function closeDatabase(): Promise<void> {
  if (!cached) {
    return;
  }
  const { pool } = cached;
  cached = undefined;
  await pool.end();
}

/** Test helper: forget the cached handle without closing it. */
export function resetDatabaseForTests(): void {
  cached = undefined;
}
