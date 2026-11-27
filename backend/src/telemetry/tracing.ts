import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import { createLogger } from './logger.js';

/**
 * OpenTelemetry-shaped span tracing (Phase 7, extended in Phase 24).
 *
 * Spans carry a W3C-compatible trace id / span id pair, a parent span id,
 * attributes, events and status. The implementation stays dependency-free:
 * spans are logged through the structured logger rather than exported to a
 * collector, so an OTLP exporter can replace `finish()` without touching call
 * sites.
 *
 * Phase 24 additions:
 * - AsyncLocalStorage trace context, so nested spans share one trace and every
 *   awaited DB/external call stays in the originating request/turn context;
 * - inbound/outbound `traceparent` parsing and formatting (W3C Trace Context);
 * - context propagation into BullMQ jobs via a serialized `traceparent`;
 * - attribute filtering that refuses PII-bearing keys before they are recorded.
 */

const logger = createLogger('recruitai.telemetry');
const traceStorage = new AsyncLocalStorage<TraceContext>();

/** W3C trace context; `traceFlags` is `01` when sampled. */
export interface TraceContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly traceFlags: number;
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes: Record<string, unknown>;
}

export interface StartSpanOptions {
  /** Explicit parent; `null` forces a new root trace. */
  readonly parent?: TraceContext | null;
}

const TRACEPARENT_PATTERN = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;

/** Attribute fragments that must never enter a span (PII / secrets). */
const FORBIDDEN_ATTRIBUTE_FRAGMENTS: readonly string[] = [
  'prompt',
  'resume',
  'candidate',
  'email',
  'phone',
  'content',
  'message',
  'authorization',
  'secret',
  'password',
  'api_key',
  'raw_text',
  'full_name',
  'job_description',
];

function isSafeAttributeKey(key: string): boolean {
  const lower = key.toLowerCase();
  return !FORBIDDEN_ATTRIBUTE_FRAGMENTS.some((fragment) => lower.includes(fragment));
}

function hex(value: string): boolean {
  return /^[0-9a-f]+$/i.test(value);
}

/** Parse an inbound W3C `traceparent`, returning `null` when malformed. */
export function parseTraceparent(header: string | string[] | undefined): TraceContext | null {
  const raw = Array.isArray(header) ? header[0] : header;
  const match = raw ? TRACEPARENT_PATTERN.exec(raw.trim()) : null;
  if (!match) {
    return null;
  }
  const [, version, traceId, spanId, flags] = match;
  if (version === 'ff' || !traceId || !spanId || !flags) {
    return null;
  }
  if (!hex(traceId) || !hex(spanId) || !hex(flags)) {
    return null;
  }
  // All-zero ids are invalid per the W3C spec.
  if (/^0+$/.test(traceId) || /^0+$/.test(spanId)) {
    return null;
  }
  return {
    traceId: traceId.toLowerCase(),
    spanId: spanId.toLowerCase(),
    traceFlags: Number.parseInt(flags, 16),
  };
}

/** Serialize a span context as a W3C `traceparent` header value. */
export function formatTraceparent(context: TraceContext): string {
  const flags = (context.traceFlags & 0xff).toString(16).padStart(2, '0');
  return `00-${context.traceId}-${context.spanId}-${flags}`;
}

export class OpenTelemetrySpan {
  readonly attributes: Record<string, unknown>;
  readonly events: SpanEvent[] = [];
  readonly parentSpanId: string | undefined;
  readonly traceFlags: number;
  status = 'OK';

  constructor(
    readonly name: string,
    readonly traceId: string,
    readonly spanId: string,
    readonly startTime: number = Date.now() / 1000,
    attributes: Record<string, unknown> = {},
    parentSpanId?: string,
    traceFlags = 1,
  ) {
    this.attributes = {};
    for (const [key, value] of Object.entries(attributes)) {
      if (isSafeAttributeKey(key)) {
        this.attributes[key] = value;
      }
    }
    this.parentSpanId = parentSpanId;
    this.traceFlags = traceFlags;
  }

  setAttribute(key: string, value: unknown): void {
    if (!isSafeAttributeKey(key)) {
      return;
    }
    this.attributes[key] = value;
  }

  addEvent(name: string, attributes: Record<string, unknown> = {}): void {
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(attributes)) {
      if (isSafeAttributeKey(key)) {
        safe[key] = value;
      }
    }
    this.events.push({
      name,
      timestamp: Date.now() / 1000,
      attributes: safe,
    });
  }

  /** Context identifying this span as the parent of nested spans. */
  context(): TraceContext {
    return { traceId: this.traceId, spanId: this.spanId, traceFlags: this.traceFlags };
  }

  traceparent(): string {
    return formatTraceparent(this.context());
  }

  /** Mark the span finished and return its duration in milliseconds. */
  finish(status = 'OK'): number {
    this.status = status;
    const durationMs = (Date.now() / 1000 - this.startTime) * 1000;
    logger.debug(
      `[span:${this.name}] trace=${this.traceId.slice(0, 8)} span=${this.spanId.slice(0, 8)} ` +
        `duration=${durationMs.toFixed(2)}ms status=${status}`,
      {
        status,
        latency_ms: Math.round(durationMs * 100) / 100,
        ...(this.parentSpanId ? { parent_span: this.parentSpanId.slice(0, 8) } : {}),
      },
    );
    return durationMs;
  }
}

/** Start a span, inheriting the active trace unless an explicit parent is given. */
export function startSpan(
  name: string,
  attributes: Record<string, unknown> = {},
  options: StartSpanOptions = {},
): OpenTelemetrySpan {
  const parent = options.parent === null ? undefined : (options.parent ?? traceStorage.getStore());
  const traceId = parent?.traceId ?? randomUUID().replaceAll('-', '');
  const spanId = randomUUID().replaceAll('-', '').slice(0, 16);
  return new OpenTelemetrySpan(
    name,
    traceId,
    spanId,
    Date.now() / 1000,
    attributes,
    parent?.spanId,
    parent?.traceFlags ?? 1,
  );
}

/** Run `fn` with `span` as the active trace context. */
export function runWithSpanContext<T>(span: OpenTelemetrySpan, fn: () => T): T {
  return traceStorage.run(span.context(), fn);
}

/**
 * Run `fn` inside a span. Success finishes with status `OK`; a thrown error
 * sets `error` / `error.type`, finishes with `ERROR`, and rethrows unchanged.
 */
export async function withSpan<T>(
  name: string,
  fn: (span: OpenTelemetrySpan) => Promise<T> | T,
  attributes: Record<string, unknown> = {},
): Promise<T> {
  const span = startSpan(name, attributes);
  try {
    const result = await runWithSpanContext(span, () => fn(span));
    span.finish('OK');
    return result;
  } catch (error) {
    span.setAttribute('error', true);
    span.setAttribute('error.type', error instanceof Error ? error.constructor.name : typeof error);
    span.finish('ERROR');
    throw error;
  }
}

/** Active trace context for the current async execution chain. */
export function getActiveTraceContext(): TraceContext | undefined {
  return traceStorage.getStore();
}

/** Serialize the active context for cross-process propagation (job payloads). */
export function currentTraceparent(): string | null {
  const context = traceStorage.getStore();
  return context ? formatTraceparent(context) : null;
}

/**
 * Resume a trace from a serialized `traceparent`.
 *
 * Used by async job workers, which run outside the enqueueing request's
 * AsyncLocalStorage scope. Invalid or absent headers start a fresh trace.
 */
export function runWithTraceparent<T>(traceparent: string | null | undefined, fn: () => T): T {
  const parent = parseTraceparent(traceparent ?? undefined);
  if (!parent) {
    return fn();
  }
  // A remote parent is a trace context, not a local span: child spans inherit
  // the trace id and use the remote span id as their parent.
  return traceStorage.run(parent, fn);
}

/** Test helper: clear the active trace context for the current chain. */
export function runWithoutTrace<T>(fn: () => T): T {
  return traceStorage.exit(fn);
}

/**
 * Wrap every async method on a data-access object in a `db.*` span.
 *
 * Proxying keeps tracing at the storage boundary without adding a span call to
 * dozens of methods, and never records arguments (tenant ids, text or filters),
 * so span attributes stay PII-free.
 */
export function traceStoreMethods<T extends object>(prefix: string, target: T): T {
  return new Proxy(target, {
    get(object, property, receiver) {
      const value = Reflect.get(object, property, receiver) as unknown;
      if (typeof property !== 'string' || typeof value !== 'function') {
        return value;
      }
      return (...args: unknown[]): unknown =>
        withSpan(
          `${prefix}.${property}`,
          () => (value as (...callArgs: unknown[]) => unknown).apply(object, args),
          {
            'db.operation': property,
            'db.store': prefix,
          },
        );
    },
  });
}
