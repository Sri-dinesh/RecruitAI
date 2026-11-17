import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * Per-request identity and telemetry context.
 *
 * Ported from the context variable scoping in `app/core/logging.py`
 * (`set_telemetry_context`). AsyncLocalStorage gives every request an isolated
 * store, so downstream services, logs and telemetry can read the authenticated
 * user/tenant without threading parameters through every call.
 *
 * `tenantId` is the authenticated user id: the Python backend scopes tenant
 * data by `user_id` everywhere (sessions, candidates, evaluations, outreach).
 */

/**
 * Telemetry scope for the active request or CLI turn.
 *
 * Mirrors Python's `_user_id_ctx`, `_session_id_ctx`, `_request_id_ctx`,
 * `_turn_counter_ctx` and `_turn_logs_ctx`. Kept separate from the authenticated
 * identity above so `clearTelemetryContext()` cannot break authorization.
 */
export interface TelemetryContext {
  userId: string;
  sessionId: string;
  requestId: string;
  turn: number;
  logs: Record<string, unknown>[];
}

export interface RequestContext {
  readonly requestId: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly startedAt: number;
  /** Set by session-scoped routes once a session is resolved. */
  sessionId?: string;
  /** Tenant-scoped event log, isolated per request (AI-SEC-5). */
  readonly telemetry: TelemetryContext;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Request-id scope that exists before authentication.
 *
 * `requireAuth` has to resolve a token before it knows the user, but logs and
 * metrics emitted while authenticating still need a correlation id. The
 * request-id middleware opens this scope for the whole request; the auth
 * middleware then reuses the same id when it builds the full context.
 */
const requestIdStorage = new AsyncLocalStorage<string>();

/** Run `fn` with `requestId` as the active correlation id. */
export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return requestIdStorage.run(requestId, fn);
}

/** Correlation id for the current request, set before auth by middleware. */
export function getActiveRequestId(): string | undefined {
  return requestIdStorage.getStore();
}

export function createRequestContext(
  userId: string,
  requestId: string = getActiveRequestId() ?? randomUUID(),
): RequestContext {
  return {
    requestId,
    userId,
    tenantId: userId,
    startedAt: Date.now(),
    telemetry: {
      userId,
      sessionId: '',
      requestId,
      turn: 0,
      logs: [],
    },
  };
}

/** Run `fn` with `context` active for the current async execution chain. */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getRequestContext(): Readonly<RequestContext> | undefined {
  return storage.getStore();
}

export function requireRequestContext(): Readonly<RequestContext> {
  const context = storage.getStore();
  if (!context) {
    throw new Error('No request context is active for the current execution.');
  }
  return context;
}

/** Authenticated user id for the active request. */
export function getCurrentUserId(): string {
  return requireRequestContext().userId;
}

/** Tenant id (currently always the authenticated user id). */
export function getCurrentTenantId(): string {
  return requireRequestContext().tenantId;
}

/** Attach the resolved session id to the active request and telemetry scope. */
export function setSessionId(sessionId: string): void {
  const context = storage.getStore();
  if (context) {
    context.sessionId = sessionId;
    context.telemetry.sessionId = sessionId;
  }
}

export function getSessionId(): string | undefined {
  return storage.getStore()?.sessionId;
}
