import { randomUUID } from 'node:crypto';

import { createLogger } from './logger.js';

/**
 * Port of the span tracing in `backend/app/core/telemetry.py`.
 *
 * OpenTelemetry-compatible in shape (trace id, span id, attributes, events,
 * status) but dependency-free: spans are logged, not exported to a collector.
 * Later phases can swap `finish()` for an OTLP exporter without changing call
 * sites.
 */

const logger = createLogger('recruitai.telemetry');

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes: Record<string, unknown>;
}

export class OpenTelemetrySpan {
  readonly attributes: Record<string, unknown>;
  readonly events: SpanEvent[] = [];
  status = 'OK';

  constructor(
    readonly name: string,
    readonly traceId: string,
    readonly spanId: string,
    readonly startTime: number = Date.now() / 1000,
    attributes: Record<string, unknown> = {},
  ) {
    this.attributes = { ...attributes };
  }

  setAttribute(key: string, value: unknown): void {
    this.attributes[key] = value;
  }

  addEvent(name: string, attributes: Record<string, unknown> = {}): void {
    this.events.push({
      name,
      timestamp: Date.now() / 1000,
      attributes: { ...attributes },
    });
  }

  /** Mark the span finished and return its duration in milliseconds. */
  finish(status = 'OK'): number {
    this.status = status;
    const durationMs = (Date.now() / 1000 - this.startTime) * 1000;
    logger.debug(
      `[span:${this.name}] trace=${this.traceId.slice(0, 8)} span=${this.spanId.slice(0, 8)} duration=${durationMs.toFixed(2)}ms status=${status}`,
      { status, duration_ms: Math.round(durationMs * 100) / 100 },
    );
    return durationMs;
  }
}

/** Start a span with a 32-char trace id and 16-char span id, as in Python. */
export function startSpan(
  name: string,
  attributes: Record<string, unknown> = {},
): OpenTelemetrySpan {
  const traceId = randomUUID().replaceAll('-', '');
  const spanId = randomUUID().replaceAll('-', '').slice(0, 16);
  return new OpenTelemetrySpan(name, traceId, spanId, Date.now() / 1000, attributes);
}

/**
 * Run `fn` inside a span, mirroring Python's `with trace_span(...)`.
 *
 * Success finishes with status `OK`; a thrown error sets `error` /
 * `error.type`, finishes with `ERROR`, and is rethrown unchanged.
 */
export async function withSpan<T>(
  name: string,
  fn: (span: OpenTelemetrySpan) => Promise<T> | T,
  attributes: Record<string, unknown> = {},
): Promise<T> {
  const span = startSpan(name, attributes);
  try {
    const result = await fn(span);
    span.finish('OK');
    return result;
  } catch (error) {
    span.setAttribute('error', true);
    span.setAttribute('error.type', error instanceof Error ? error.constructor.name : typeof error);
    span.finish('ERROR');
    throw error;
  }
}
