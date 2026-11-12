import { HttpError } from '../types/errors.js';

/**
 * Database availability contracts.
 *
 * `app/rag/vector_store.py` raises FastAPI `HTTPException(503)` when production
 * configuration is missing or the database cannot be reached, and
 * `FallbackSupabaseClient` raises the same status when SQLite is used in
 * production. These classes reproduce those responses for the Express error
 * middleware (which wraps `detail` exactly like FastAPI).
 */

/** Exact Python message when production DB configuration is absent. */
export const DATABASE_MISSING_IN_PRODUCTION =
  'Database service configuration missing in production environment.';

/** Exact Python message when SQLite fallback is attempted in production. */
export const SQLITE_FALLBACK_PROHIBITED =
  'Database service temporarily unavailable. SQLite fallback is prohibited in production.';

/** Development-only guidance for a missing direct Postgres URL. */
export const DATABASE_URL_MISSING =
  'Database is not configured. Set DATABASE_URL to a PostgreSQL connection string.';

/** 503 for missing configuration, failed connections and blocked fallbacks. */
export class DatabaseUnavailableError extends HttpError {
  declare readonly detail: string;

  constructor(detail: string) {
    super(503, detail, detail);
    this.name = 'DatabaseUnavailableError';
  }
}

/** Mirror the Python production connection-failure message. */
export function productionConnectionFailure(error: unknown): DatabaseUnavailableError {
  const reason = error instanceof Error ? error.message : String(error);
  return new DatabaseUnavailableError(`Production database connection failure: ${reason}`);
}
