/**
 * Structured JSON logger.
 *
 * The Python backend uses the standard `logging` module. The Node backend emits
 * one JSON object per line so log aggregators can index tenant, request and
 * telemetry fields without parsing free-form text.
 *
 * Safety rules mirror `app/core/logging.py`:
 * - only explicitly allowed extra fields are serialized;
 * - keys containing prompt/resume/completion/text/message/PII fragments are
 *   dropped even if they somehow reach the allowlist;
 * - serialization failures never crash the process and never echo field values.
 */

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_PRIORITY: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Fields that may appear in a structured log record. Extends the telemetry
 * whitelist with tenant/request identity and audit metadata; all values are
 * internal identifiers or enum-like strings, never prose or candidate PII.
 */
const ALLOWED_LOG_FIELDS: ReadonlySet<string> = new Set([
  // Tenant / request identity
  'user_id',
  'tenant_id',
  'session_id',
  'request_id',
  'turn',
  // Telemetry event fields (logging.py ALLOWED_EXTRA_KEYS)
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
  // Router telemetry
  'intent',
  'confidence',
  'provider',
  'node',
  // Audit + server diagnostics
  'audit_action',
  'action',
  'candidate_id',
  'resource',
  'outcome',
  'reset_timestamp',
  'ref',
  'method',
  'path',
  'endpoint',
  'status_code',
  'duration_ms',
]);

/** Same PII/prompt substrings as `FORBIDDEN_KEY_SUBSTRINGS` in Python. */
const FORBIDDEN_LOG_FIELD_SUBSTRINGS: readonly string[] = [
  'prompt',
  'resume',
  'completion',
  'text',
  'message',
  'candidate_name',
  'email',
  'phone',
];

export type LogFields = Readonly<Record<string, unknown>>;

export type LogSink = (line: string, level: LogLevel) => void;

export interface LoggerOptions {
  readonly name: string;
  /** Minimum level to emit. Defaults to `info`. */
  readonly level?: LogLevel;
  /** Destination for serialized lines; defaults to the matching console method. */
  readonly sink?: LogSink;
  /** Clock injection for deterministic tests. */
  readonly now?: () => Date;
}

export interface Logger {
  readonly name: string;
  readonly level: LogLevel;
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

/** Filter a fields object down to the safe allowlist. */
export function sanitizeLogFields(fields?: LogFields): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  if (!fields) {
    return sanitized;
  }
  for (const [key, value] of Object.entries(fields)) {
    const lower = key.toLowerCase();
    if (!ALLOWED_LOG_FIELDS.has(key)) {
      continue;
    }
    if (FORBIDDEN_LOG_FIELD_SUBSTRINGS.some((fragment) => lower.includes(fragment))) {
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

/** Default sink: warn/error to stderr-like console methods, info/debug to stdout. */
export function defaultLogSink(line: string, level: LogLevel): void {
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/** Create a named structured logger. */
export function createLogger(nameOrOptions: string | LoggerOptions): Logger {
  const options: LoggerOptions =
    typeof nameOrOptions === 'string' ? { name: nameOrOptions } : nameOrOptions;
  const level = options.level ?? 'info';
  const threshold = LEVEL_PRIORITY[level];
  const sink = options.sink ?? defaultLogSink;
  const now = options.now ?? (() => new Date());

  const emit = (logLevel: LogLevel, message: string, fields?: LogFields): void => {
    if (LEVEL_PRIORITY[logLevel] < threshold) {
      return;
    }
    const record: Record<string, unknown> = {
      timestamp: now().toISOString(),
      level: logLevel,
      logger: options.name,
      message,
      ...sanitizeLogFields(fields),
    };

    let line: string;
    try {
      line = JSON.stringify(record);
    } catch {
      // Circular structures or BigInt values: keep the message, drop fields.
      line = JSON.stringify({
        timestamp: record.timestamp,
        level: logLevel,
        logger: options.name,
        message,
        serialization_error: true,
      });
    }
    sink(line, logLevel);
  };

  return {
    name: options.name,
    level,
    debug: (message, fields) => emit('debug', message, fields),
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
  };
}

/** Shared telemetry logger, replacing `logging.getLogger("recruitai.telemetry")`. */
export const telemetryLogger = createLogger('recruitai.telemetry');

/** Dedicated audit logger for GDPR erasure and workspace-reset events. */
export const auditLogger = createLogger('recruitai.audit');
