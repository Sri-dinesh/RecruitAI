import { randomUUID } from 'node:crypto';

import { getRequestContext, type TelemetryContext } from '../context/request-context.js';
import { auditLogger, telemetryLogger } from './logger.js';

/**
 * Port of `backend/app/core/logging.py` (AI-SEC-5).
 *
 * Tenant-isolated, structured telemetry events. The active request owns the
 * scope (user, session, request, turn and logs); a module-level fallback keeps
 * the CLI and unit tests working outside an Express request, mirroring
 * contextvars' process-wide defaults.
 */

/** Strict allowlist from Python: no prompts, resumes or model output. */
export const ALLOWED_EXTRA_KEYS: ReadonlySet<string> = new Set([
  'model',
  'status',
  'error_type',
  'error_code',
  'step',
  'routing_reason',
  'token_count',
  'tokens_in',
  'tokens_out',
  'cost_usd',
  'latency_ms',
  'circuit_state',
]);

/** Case-insensitive fragments that may never appear in a telemetry key. */
export const FORBIDDEN_KEY_SUBSTRINGS: readonly string[] = [
  'prompt',
  'resume',
  'completion',
  'text',
  'message',
  'candidate_name',
  'email',
  'phone',
];

export interface TelemetryEvent extends Record<string, unknown> {
  request_id: string;
  session_id: string;
  user_id: string;
  turn: number;
  intent: string;
  confidence: number;
  provider: string;
  latency_ms: number;
  node: string;
  timestamp: string;
}

export interface LogEventOptions {
  readonly confidence?: number;
  readonly provider?: string;
  readonly latencyMs?: number;
  readonly node?: string;
  readonly extra?: Readonly<Record<string, unknown>>;
}

export interface MaskedException {
  readonly error_type: string;
  readonly error_code: number;
}

/**
 * Fallback scope used when no request context is active (CLI, background jobs,
 * unit tests). It reproduces the contextvar defaults from Python at zero.
 */
const fallbackTelemetry: TelemetryContext = {
  userId: '',
  sessionId: '',
  requestId: '',
  turn: 0,
  logs: [],
};

function activeTelemetry(): TelemetryContext {
  return getRequestContext()?.telemetry ?? fallbackTelemetry;
}

/** Filter an `extra` payload with Python's exact whitelist semantics. */
export function sanitizeExtra(extra?: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  if (!extra) {
    return sanitized;
  }
  for (const [key, value] of Object.entries(extra)) {
    const lower = key.toLowerCase();
    if (!ALLOWED_EXTRA_KEYS.has(key)) {
      continue;
    }
    if (FORBIDDEN_KEY_SUBSTRINGS.some((fragment) => lower.includes(fragment))) {
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

/**
 * Set the tenant/session boundary for the active turn and reset its event log.
 * The turn counter is intentionally not reset, matching `logging.py`.
 */
export function setTelemetryContext(userId: string, sessionId: string, requestId?: string): void {
  const telemetry = activeTelemetry();
  telemetry.userId = userId;
  telemetry.sessionId = sessionId;
  telemetry.requestId = requestId || randomUUID();
  telemetry.logs = [];
}

/** Clear the tenant boundary after request execution. Turn counter persists. */
export function clearTelemetryContext(): void {
  const telemetry = activeTelemetry();
  telemetry.userId = '';
  telemetry.sessionId = '';
  telemetry.requestId = '';
  telemetry.logs = [];
}

/** Test/CLI helper: restore both scopes to their Python defaults. */
export function resetTelemetryForTests(): void {
  fallbackTelemetry.userId = '';
  fallbackTelemetry.sessionId = '';
  fallbackTelemetry.requestId = '';
  fallbackTelemetry.turn = 0;
  fallbackTelemetry.logs = [];

  const context = getRequestContext();
  if (context) {
    context.telemetry.userId = '';
    context.telemetry.sessionId = '';
    context.telemetry.requestId = '';
    context.telemetry.turn = 0;
    context.telemetry.logs = [];
  }
}

/** Increment and return the current turn counter. */
export function incrementTurn(): number {
  const telemetry = activeTelemetry();
  telemetry.turn += 1;
  return telemetry.turn;
}

export function getCurrentTurn(): number {
  return activeTelemetry().turn;
}

/**
 * AI-SEC-5: mask an exception down to its type and HTTP/provider status code.
 * Exception messages may contain prompt fragments and are never propagated.
 */
export function maskException(error: unknown): MaskedException {
  const errorType = error instanceof Error ? error.constructor.name : typeof error;
  const candidate = (error ?? {}) as {
    status_code?: unknown;
    statusCode?: unknown;
    code?: unknown;
  };

  // Python's `or` chain: a falsy 0 falls through to the next source.
  const raw = candidate.status_code || candidate.statusCode || candidate.code || 500;
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  return {
    error_type: errorType,
    error_code: Number.isFinite(parsed) ? parsed : 500,
  };
}

function roundedConfidence(confidence: number): number {
  return Math.round(confidence * 1000) / 1000;
}

/** Python emits second-precision UTC timestamps (`%Y-%m-%dT%H:%M:%SZ`). */
function timestampSeconds(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Append one structured telemetry event to the current turn and return it.
 * All extra fields pass through the strict allowlist.
 */
export function logEvent(intent: string, options: LogEventOptions = {}): TelemetryEvent {
  const {
    confidence = 1.0,
    provider = 'gemini',
    latencyMs = 0.0,
    node = 'system',
    extra,
  } = options;

  const telemetry = activeTelemetry();
  const event: TelemetryEvent = {
    request_id: telemetry.requestId,
    session_id: telemetry.sessionId,
    user_id: telemetry.userId,
    turn: telemetry.turn,
    intent,
    confidence: roundedConfidence(confidence),
    provider,
    latency_ms: Math.trunc(latencyMs),
    node,
    timestamp: timestampSeconds(),
  };

  Object.assign(event, sanitizeExtra(extra));
  telemetry.logs.push(event);

  telemetryLogger.debug(
    `[telemetry] user=${telemetry.userId} session=${telemetry.sessionId} node=${node} intent=${intent} latency=${latencyMs.toFixed(1)}ms`,
    {
      user_id: telemetry.userId,
      session_id: telemetry.sessionId,
      request_id: telemetry.requestId,
      turn: telemetry.turn,
      intent,
      node,
      latency_ms: Math.trunc(latencyMs),
    },
  );

  return event;
}

/** Copy of the current turn's events; never global traces or other tenants. */
export function getAllLogs(): Record<string, unknown>[] {
  return [...activeTelemetry().logs];
}

function auditContextFields(): Record<string, unknown> {
  const telemetry = getRequestContext()?.telemetry;
  if (!telemetry) {
    return {};
  }
  return { request_id: telemetry.requestId, session_id: telemetry.sessionId };
}

/**
 * Audit log for a candidate erasure (GDPR Art. 17 / retention service).
 * Mirrors `[AUDIT] [GDPR_ERASURE] candidate_id=... user_id=... status=purged`.
 */
export function logCandidateErasure(userId: string, candidateId: string): void {
  auditLogger.info(
    `[AUDIT] [GDPR_ERASURE] candidate_id=${candidateId} user_id=${userId} status=purged`,
    {
      audit_action: 'GDPR_ERASURE',
      candidate_id: candidateId,
      user_id: userId,
      status: 'purged',
      ...auditContextFields(),
    },
  );
}

/** Audit log for account-level erasure. */
export function logAccountErasure(userId: string): void {
  auditLogger.info(`[AUDIT] [GDPR_ACCOUNT_ERASURE] user_id=${userId} status=account_purged`, {
    audit_action: 'GDPR_ACCOUNT_ERASURE',
    user_id: userId,
    status: 'account_purged',
    ...auditContextFields(),
  });
}

/** Audit log for a full workspace reset. Timestamp is seconds since epoch. */
export function logWorkspaceReset(
  userId: string,
  timestampSecondsValue: number = Date.now() / 1000,
): void {
  auditLogger.info(
    `[AUDIT] [WORKSPACE_RESET] user_id=${userId} timestamp=${timestampSecondsValue} action=reset_all_data`,
    {
      audit_action: 'WORKSPACE_RESET',
      user_id: userId,
      action: 'reset_all_data',
      reset_timestamp: timestampSecondsValue,
      ...auditContextFields(),
    },
  );
}
