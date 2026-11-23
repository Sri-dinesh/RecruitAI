import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

/**
 * Shared k6 helpers for the Phase 24 performance suite.
 *
 * The scripts are deliberately contract-level: they call the same public API a
 * browser does (authenticated `POST /api/chat` plus readiness checks) and never
 * import application code. Run them against a deployed environment, or against
 * a local instance for a smoke test.
 */

export const chatDuration = new Trend('recruitai_chat_duration', true);
export const readinessDuration = new Trend('recruitai_readiness_duration', true);
export const chatFailures = new Rate('recruitai_chat_failures');
export const unexpectedResponses = new Counter('recruitai_unexpected_responses');

export function baseUrl() {
  return (__ENV.BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
}

export function authToken() {
  if (!__ENV.AUTH_TOKEN) {
    throw new Error(
      'AUTH_TOKEN is required. Use a dedicated load-test user (JWT or local dev auth).',
    );
  }
  return __ENV.AUTH_TOKEN;
}

export function authHeaders() {
  return {
    Authorization: `Bearer ${authToken()}`,
    'Content-Type': 'application/json',
  };
}

/** One extra session per VU keeps tenant history bounded during long runs. */
export function sessionId() {
  return __ENV.SESSION_ID || null;
}

export function chatPayload() {
  const body = {
    message: __ENV.MESSAGE || 'Summarize the top candidates for this role.',
    conversation_history: [],
  };
  const session = sessionId();
  if (session) {
    body.session_id = session;
  }
  return JSON.stringify(body);
}

/**
 * Synchronous chat turn. Assertions cover only the public contract: a 2xx body
 * with `response` and `session_id`. Provider-specific behavior stays with the
 * functional suites.
 */
export function postChat(tags = {}) {
  const response = http.post(`${baseUrl()}/api/chat`, chatPayload(), {
    headers: authHeaders(),
    tags: { endpoint: 'chat', ...tags },
    timeout: __ENV.CHAT_TIMEOUT || '120s',
  });

  chatDuration.add(response.timings.duration);
  const ok = check(response, {
    'chat status is 2xx': (result) => result.status >= 200 && result.status < 300,
    'chat body has response': (result) => {
      try {
        const body = result.json();
        return typeof body.response === 'string' && typeof body.session_id === 'string';
      } catch {
        return false;
      }
    },
  });
  chatFailures.add(!ok);
  if (response.status >= 500) {
    unexpectedResponses.add(1, { status: String(response.status) });
  }
  return response;
}

/** Authenticated readiness probe: use `LOAD_AUTH_TOKEN`-bearing headers. */
export function readiness() {
  const response = http.get(`${baseUrl()}/api/health/ready`, {
    headers: authHeaders(),
    tags: { endpoint: 'health_ready' },
    timeout: __ENV.HEALTH_TIMEOUT || '10s',
  });
  readinessDuration.add(response.timings.duration);
  check(response, {
    'readiness is 200 or 503': (result) => result.status === 200 || result.status === 503,
  });
  return response;
}

/** Public liveness probe: must answer even while a dependency is down. */
export function liveness() {
  const response = http.get(`${baseUrl()}/health`, {
    tags: { endpoint: 'health' },
    timeout: __ENV.HEALTH_TIMEOUT || '10s',
  });
  check(response, { 'liveness is 200': (result) => result.status === 200 });
  return response;
}

/** Shared threshold block; route-specific percentile SLOs live in each script. */
export const sharedThresholds = {
  http_req_failed: ['rate<0.01'],
  recruitai_chat_failures: ['rate<0.01'],
  recruitai_chat_duration: ['p(95)<30000'],
  recruitai_readiness_duration: ['p(99)<50'],
};
