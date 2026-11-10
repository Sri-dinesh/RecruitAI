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
export interface RequestContext {
  readonly requestId: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly startedAt: number;
  /** Set by session-scoped routes once a session is resolved. */
  sessionId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function createRequestContext(
  userId: string,
  requestId: string = randomUUID(),
): RequestContext {
  return {
    requestId,
    userId,
    tenantId: userId,
    startedAt: Date.now(),
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

/** Attach the resolved session id to the active request context. */
export function setSessionId(sessionId: string): void {
  const context = storage.getStore();
  if (context) {
    context.sessionId = sessionId;
  }
}

export function getSessionId(): string | undefined {
  return storage.getStore()?.sessionId;
}
