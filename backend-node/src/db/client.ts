import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';

import { getConfig, type AppConfig } from '../config/index.js';
import { createLogger } from '../telemetry/logger.js';
import {
  DATABASE_MISSING_IN_PRODUCTION,
  DATABASE_URL_MISSING,
  DatabaseUnavailableError,
} from './errors.js';
import * as schema from './schema.js';

const logger = createLogger('recruitai.db');

/**
 * Direct-TCP PostgreSQL client (Drizzle + node-postgres).
 *
 * Design rules from the migration plan:
 * - One bounded pool per process, created once. Never a connection per request.
 * - Connection settings come from typed config, never `process.env` inline.
 * - SQL migrations remain the schema source of truth; this is introspection.
 *
 * Phase 22 additions:
 * - Pool math is documented on `DatabaseConfig`; both pools are bounded.
 * - Every session gets `statement_timeout` and
 *   `idle_in_transaction_session_timeout`, so a stuck query or an abandoned
 *   transaction cannot camp on a pool slot.
 * - `getReadDb()` routes heavy analytics reads to `DATABASE_READ_URL` when it
 *   is configured. Writes and the credit ledger always use `getDb()`.
 * - `withTransaction()` sets a local transaction timeout and is the only
 *   supported way to run multi-statement work; transactions must never wrap
 *   LLM/Tavily/SMTP/Razorpay calls.
 */

export type Database = NodePgDatabase<typeof schema>;

/** Transaction handle passed to `withTransaction` callbacks. */
export type TransactionScope = Parameters<Parameters<Database['transaction']>[0]>[0];

export type DatabaseRole = 'primary' | 'read';

export interface DatabaseHandle {
  readonly pool: Pool;
  readonly db: Database;
  readonly role: DatabaseRole;
}

export interface PoolSessionOptions {
  readonly statementTimeoutMs: number;
  readonly idleInTransactionTimeoutMs: number;
}

/**
 * Startup parameters applied to every pooled session.
 *
 * `options` is a standard libpq startup parameter. Transaction poolers that
 * reject unknown startup parameters can ignore it; `withTransaction()` still
 * applies `SET LOCAL statement_timeout` per transaction, which works through
 * any pooler. Set the same values on the Postgres role/pooler as a backstop.
 */
export function createSessionOptions(options: PoolSessionOptions): string {
  return (
    `-c statement_timeout=${Math.trunc(options.statementTimeoutMs)} ` +
    `-c idle_in_transaction_session_timeout=${Math.trunc(options.idleInTransactionTimeoutMs)}`
  );
}

/** Build pg pool options from typed config. Exported for tests/diagnostics. */
export function createPoolOptions(
  config: AppConfig = getConfig(),
  role: DatabaseRole = 'primary',
): PoolConfig {
  const { database } = config;
  const connectionString = role === 'read' ? (database.readUrl ?? database.url) : database.url;
  return {
    connectionString,
    max: role === 'read' ? database.readPoolMax : database.poolMax,
    idleTimeoutMillis: database.idleTimeoutMs,
    connectionTimeoutMillis: database.connectionTimeoutMs,
    // Detect half-open sockets instead of waiting for the next query to hang.
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    options: createSessionOptions({
      statementTimeoutMs: database.statementTimeoutMs,
      idleInTransactionTimeoutMs: database.idleInTransactionTimeoutMs,
    }),
    // Label sessions for pool debugging without leaking credentials.
    application_name: `recruitai-backend-node:${role}`,
  };
}

function createHandle(
  config: AppConfig,
  role: DatabaseRole,
  connectionString: string | undefined,
): DatabaseHandle {
  if (!connectionString) {
    throw new DatabaseUnavailableError(
      config.isProduction ? DATABASE_MISSING_IN_PRODUCTION : DATABASE_URL_MISSING,
    );
  }

  const pool = new Pool(createPoolOptions(config, role));
  // Idle-client failures are emitted asynchronously; without a listener they
  // would crash the process. Log the reason only (no connection string).
  pool.on('error', (error: Error) => {
    logger.error(`[db:${role}] idle PostgreSQL client error: ${error.message}`, {
      error_type: error.constructor.name,
    });
  });

  const db = drizzle(pool, { schema });
  return { pool, db, role };
}

/**
 * Create a pool + Drizzle instance. Construction is lazy: node-postgres does
 * not open a socket until the first query, so this is safe at module load.
 */
export function createDatabase(
  config: AppConfig = getConfig(),
  role: DatabaseRole = 'primary',
): DatabaseHandle {
  return createHandle(config, role, createPoolOptions(config, role).connectionString);
}

let cached: DatabaseHandle | undefined;
let cachedRead: DatabaseHandle | undefined;

/**
 * Process-wide database handle. Feature code calls `getDb()` for writes and
 * `getReadDb()` for heavy reads; bootstrap calls `closeDatabase()` during
 * graceful shutdown.
 */
export function getDatabase(): DatabaseHandle {
  cached ??= createDatabase(getConfig(), 'primary');
  return cached;
}

/** Drizzle instance backed by the shared primary pool. */
export function getDb(): Database {
  return getDatabase().db;
}

/**
 * Read handle for analytics and other heavy reads.
 *
 * Returns the primary handle when `DATABASE_READ_URL` is unset, so callers can
 * use it unconditionally and deployments opt into a replica with one env var.
 * An explicit read URL that fails to construct takes the service down at first
 * read rather than silently serving from the primary with stale expectations.
 */
export function getReadDatabase(): DatabaseHandle {
  const config = getConfig();
  if (!config.database.readUrl) {
    return getDatabase();
  }
  cachedRead ??= createDatabase(config, 'read');
  return cachedRead;
}

/** Drizzle instance backed by the read pool (or the primary when unset). */
export function getReadDb(): Database {
  return getReadDatabase().db;
}

/** Close both pools and drop the singletons (safe when uninitialised). */
export async function closeDatabase(): Promise<void> {
  const handles = [cached, cachedRead].filter((handle): handle is DatabaseHandle => !!handle);
  cached = undefined;
  cachedRead = undefined;
  await Promise.all(handles.map((handle) => handle.pool.end()));
}

/** Test helper: forget the cached handles without closing them. */
export function resetDatabaseForTests(): void {
  cached = undefined;
  cachedRead = undefined;
}

/** Per-pool counters for diagnostics and the load test harness. */
export interface PoolStats {
  readonly role: DatabaseRole;
  readonly totalCount: number;
  readonly idleCount: number;
  readonly waitingCount: number;
  readonly max: number;
}

export function getPoolStats(): PoolStats[] {
  const handles = [cached, cachedRead].filter((handle): handle is DatabaseHandle => !!handle);
  return handles.map((handle) => ({
    role: handle.role,
    totalCount: handle.pool.totalCount,
    idleCount: handle.pool.idleCount,
    waitingCount: handle.pool.waitingCount,
    max: handle.pool.options.max ?? 0,
  }));
}

/**
 * Run a short transaction on the primary.
 *
 * The callback must be database-only work. Sending an LLM/Tavily/SMTP request
 * from inside it would hold a connection for the duration of an upstream call,
 * which is exactly the pool exhaustion the Phase 22 limit exists to prevent.
 *
 * `statement_timeout` is re-applied with `SET LOCAL` so the bound holds even
 * when the connection came through a transaction pooler that ignores startup
 * parameters. The whole transaction is additionally capped by
 * `PG_TRANSACTION_TIMEOUT_MS`.
 */
export async function withTransaction<T>(
  fn: (tx: TransactionScope) => Promise<T>,
  config: AppConfig = getConfig(),
  db: Database = getDb(),
): Promise<T> {
  const timeoutMs = config.database.transactionTimeoutMs;
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('statement_timeout', ${String(timeoutMs)}, true),
                 set_config('idle_in_transaction_session_timeout', ${String(
                   config.database.idleInTransactionTimeoutMs,
                 )}, true)`,
    );
    return fn(tx);
  });
}
