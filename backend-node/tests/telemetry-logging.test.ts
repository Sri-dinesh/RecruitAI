import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import {
  createRequestContext,
  getCurrentUserId,
  runWithRequestContext,
  setSessionId,
} from '../src/context/request-context.js';
import {
  ALLOWED_EXTRA_KEYS,
  clearTelemetryContext,
  getCurrentTurn,
  getAllLogs,
  incrementTurn,
  logAccountErasure,
  logCandidateErasure,
  logEvent,
  logWorkspaceReset,
  maskException,
  resetTelemetryForTests,
  sanitizeExtra,
  setTelemetryContext,
} from '../src/telemetry/logging.js';
import { createLogger } from '../src/telemetry/logger.js';
import { InsufficientCreditsError } from '../src/types/errors.js';

beforeEach(() => {
  resetTelemetryForTests();
});

afterEach(() => {
  mock.restoreAll();
});

function parsedLog(line: string | undefined): Record<string, unknown> {
  assert.ok(line);
  return JSON.parse(line) as Record<string, unknown>;
}

describe('tenant-scoped telemetry events', () => {
  it('uses Python defaults outside a request context', () => {
    const event = logEvent('greet');

    assert.equal(event.request_id, '');
    assert.equal(event.session_id, '');
    assert.equal(event.user_id, '');
    assert.equal(event.turn, 0);
    assert.equal(event.intent, 'greet');
    assert.equal(event.confidence, 1);
    assert.equal(event.provider, 'gemini');
    assert.equal(event.latency_ms, 0);
    assert.equal(event.node, 'system');
    assert.match(String(event.timestamp), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.deepEqual(getAllLogs(), [event]);
  });

  it('reads identity, session and turn from the active request', () => {
    const context = createRequestContext('user-1', 'req-1');

    const event = runWithRequestContext(context, () => {
      setSessionId('session-1');
      incrementTurn();
      return logEvent('screen', {
        confidence: 0.87654,
        provider: 'rules',
        latencyMs: 12.9,
        node: 'router_node',
      });
    });

    assert.equal(event.user_id, 'user-1');
    assert.equal(event.request_id, 'req-1');
    assert.equal(event.session_id, 'session-1');
    assert.equal(event.turn, 1);
    assert.equal(event.confidence, 0.877);
    assert.equal(event.latency_ms, 12);
    assert.equal(event.provider, 'rules');
    assert.equal(event.node, 'router_node');

    // Events never leak out of the request scope.
    assert.deepEqual(getAllLogs(), []);
  });

  it('setTelemetryContext rebinds identity and resets logs but keeps the turn', () => {
    runWithRequestContext(createRequestContext('user-1', 'req-1'), () => {
      incrementTurn();
      logEvent('first');
      setTelemetryContext('user-2', 'session-2', 'req-2');

      assert.equal(getCurrentTurn(), 1);
      assert.deepEqual(getAllLogs(), []);

      const event = logEvent('second');
      assert.equal(event.user_id, 'user-2');
      assert.equal(event.session_id, 'session-2');
      assert.equal(event.request_id, 'req-2');
      assert.equal(event.turn, 1);
    });
  });

  it('clearTelemetryContext clears the boundary without breaking identity', () => {
    runWithRequestContext(createRequestContext('user-1', 'req-1'), () => {
      setSessionId('session-1');
      incrementTurn();
      logEvent('first');
      clearTelemetryContext();

      assert.equal(getCurrentTurn(), 1);
      assert.deepEqual(getAllLogs(), []);
      assert.equal(getCurrentUserId(), 'user-1');

      const event = logEvent('second');
      assert.equal(event.user_id, '');
      assert.equal(event.session_id, '');
      assert.equal(event.request_id, '');
    });
  });

  it('returns a copy so callers cannot mutate the turn log', () => {
    const event = logEvent('one');
    const logs = getAllLogs();
    logs.length = 0;
    logs.push({ injected: true });

    assert.deepEqual(getAllLogs(), [event]);
  });

  it('keeps the Python extra-key whitelist', () => {
    assert.deepEqual([...ALLOWED_EXTRA_KEYS].sort(), [
      'circuit_state',
      'cost_usd',
      'error_code',
      'error_type',
      'latency_ms',
      'model',
      'routing_reason',
      'status',
      'step',
      'token_count',
      'tokens_in',
      'tokens_out',
    ]);

    const sanitized = sanitizeExtra({
      model: 'gemini-2.5-flash',
      status: 'ok',
      error_type: 'TimeoutError',
      error_code: 504,
      step: 'screen',
      routing_reason: 'keyword_match',
      token_count: 100,
      tokens_in: 60,
      tokens_out: 40,
      cost_usd: 0.001,
      latency_ms: 120,
      circuit_state: 'closed',
      prompt: 'raw prompt',
      resume_text: 'raw resume',
      candidate_name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+10000000000',
      message: 'chat content',
      completion: 'model output',
      text: 'free text',
      unknown: 'drop me',
    });

    assert.deepEqual(sanitized, {
      model: 'gemini-2.5-flash',
      status: 'ok',
      error_type: 'TimeoutError',
      error_code: 504,
      step: 'screen',
      routing_reason: 'keyword_match',
      token_count: 100,
      tokens_in: 60,
      tokens_out: 40,
      cost_usd: 0.001,
      latency_ms: 120,
      circuit_state: 'closed',
    });
  });

  it('applies the whitelist to emitted events', () => {
    const event = logEvent('screen', {
      extra: { model: 'gemini', prompt: 'secret', email: 'a@b.c' },
    });

    assert.equal(event.model, 'gemini');
    assert.equal(event.prompt, undefined);
    assert.equal(event.email, undefined);
  });
});

describe('maskException', () => {
  it('returns only the type and status code', () => {
    const masked = maskException(new Error('prompt fragment and candidate email'));

    assert.deepEqual(masked, { error_type: 'Error', error_code: 500 });
    assert.ok(!JSON.stringify(masked).includes('prompt'));
  });

  it('preserves HTTP status codes from custom errors', () => {
    assert.deepEqual(maskException(new InsufficientCreditsError()), {
      error_type: 'InsufficientCreditsError',
      error_code: 402,
    });
  });

  it('accepts provider-style `code` and non-Error throws', () => {
    const coded = Object.assign(new Error('rate limited'), { code: 429 });
    assert.deepEqual(maskException(coded), { error_type: 'Error', error_code: 429 });
    assert.deepEqual(maskException('boom'), { error_type: 'string', error_code: 500 });
  });
});

describe('structured logger', () => {
  it('emits one JSON object per line and filters by level', () => {
    const lines: string[] = [];
    const logger = createLogger({
      name: 'recruitai.test',
      level: 'info',
      sink: (line) => lines.push(line),
      now: () => new Date('2026-11-12T09:30:00.000Z'),
    });

    logger.debug('hidden');
    logger.info('visible', {
      user_id: 'user-1',
      status: 'ok',
      email: 'ada@example.com',
      prompt: 'raw prompt',
      unknown: 'drop me',
    });

    assert.equal(lines.length, 1);
    const record = parsedLog(lines[0]);
    assert.equal(record.timestamp, '2026-11-12T09:30:00.000Z');
    assert.equal(record.level, 'info');
    assert.equal(record.logger, 'recruitai.test');
    assert.equal(record.message, 'visible');
    assert.equal(record.user_id, 'user-1');
    assert.equal(record.status, 'ok');
    assert.equal(record.email, undefined);
    assert.equal(record.prompt, undefined);
    assert.equal(record.unknown, undefined);
  });

  it('never crashes or echoes values when a field cannot be serialized', () => {
    const lines: string[] = [];
    const logger = createLogger({
      name: 'recruitai.test',
      level: 'debug',
      sink: (line) => lines.push(line),
    });
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    logger.info('circular payload', { status: circular });

    const record = parsedLog(lines[0]);
    assert.equal(record.message, 'circular payload');
    assert.equal(record.serialization_error, true);
    assert.equal(record.status, undefined);
  });
});

describe('audit logging', () => {
  it('emits the Python audit messages with structured fields', () => {
    const lines: string[] = [];
    mock.method(console, 'log', (...args: unknown[]) => {
      lines.push(String(args[0]));
    });

    logCandidateErasure('user-1', 'candidate-1');
    logAccountErasure('user-2');
    logWorkspaceReset('user-3', 1762900000.5);

    assert.equal(lines.length, 3);

    const candidate = parsedLog(lines[0]);
    assert.equal(
      candidate.message,
      '[AUDIT] [GDPR_ERASURE] candidate_id=candidate-1 user_id=user-1 status=purged',
    );
    assert.equal(candidate.audit_action, 'GDPR_ERASURE');
    assert.equal(candidate.candidate_id, 'candidate-1');
    assert.equal(candidate.user_id, 'user-1');
    assert.equal(candidate.status, 'purged');

    const account = parsedLog(lines[1]);
    assert.equal(
      account.message,
      '[AUDIT] [GDPR_ACCOUNT_ERASURE] user_id=user-2 status=account_purged',
    );
    assert.equal(account.audit_action, 'GDPR_ACCOUNT_ERASURE');

    const reset = parsedLog(lines[2]);
    assert.equal(
      reset.message,
      '[AUDIT] [WORKSPACE_RESET] user_id=user-3 timestamp=1762900000.5 action=reset_all_data',
    );
    assert.equal(reset.audit_action, 'WORKSPACE_RESET');
    assert.equal(reset.reset_timestamp, 1762900000.5);
  });

  it('adds the request scope without changing the audit message', () => {
    const lines: string[] = [];
    mock.method(console, 'log', (...args: unknown[]) => {
      lines.push(String(args[0]));
    });

    runWithRequestContext(createRequestContext('user-1', 'req-9'), () => {
      setSessionId('session-9');
      logCandidateErasure('user-1', 'candidate-1');
    });

    const record = parsedLog(lines[0]);
    assert.equal(record.request_id, 'req-9');
    assert.equal(record.session_id, 'session-9');
    assert.equal(
      record.message,
      '[AUDIT] [GDPR_ERASURE] candidate_id=candidate-1 user_id=user-1 status=purged',
    );
  });
});
