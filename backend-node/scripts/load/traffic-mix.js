import crypto from 'k6/crypto';
import http from 'k6/http';
import { check, sleep } from 'k6';

import {
  authHeaders,
  authToken,
  baseUrl,
  chatPayload,
  postChat,
  readiness,
  sharedThresholds,
} from './common.js';

/**
 * Mixed frontend/mobile traffic replay.
 *
 * Each scenario mirrors a real client loop:
 * - sync chat turns;
 * - async enqueue + job polling;
 * - async enqueue + long-lived SSE attach;
 * - session CRUD and analytics reads;
 * - resume ingest uploads;
 * - payment status/verify calls.
 *
 * Rates are configurable so the same file can be used for a small smoke run
 * and for the 10K-user rehearsal. 10K active users ≈ 333 chat turns/s; the
 * remaining loops are read-heavy and cheap.
 */
const syncRps = Number(__ENV.SYNC_RPS || 100);
const asyncRps = Number(__ENV.ASYNC_RPS || 30);
const sseRps = Number(__ENV.SSE_RPS || 10);
const readRps = Number(__ENV.READ_RPS || 50);
const ingestRps = Number(__ENV.INGEST_RPS || 2);
const paymentRps = Number(__ENV.PAYMENT_RPS || 5);
const vus = Number(__ENV.PRE_ALLOCATED_VUS || 200);
const duration = __ENV.DURATION || '10m';

function rateScenario(exec, rate, extra = {}) {
  return {
    executor: 'constant-arrival-rate',
    exec,
    rate,
    timeUnit: '1s',
    duration,
    preAllocatedVUs: Math.max(5, Math.round(vus * (rate / Math.max(1, syncRps)))),
    maxVUs: Math.max(10, Math.round(vus * 2 * (rate / Math.max(1, syncRps)))),
    gracefulStop: '30s',
    ...extra,
  };
}

export const options = {
  scenarios: {
    sync_chat: rateScenario('chatSync', syncRps, { tags: { mix: 'chat_sync' } }),
    async_poll: rateScenario('chatAsyncPoll', asyncRps, { tags: { mix: 'chat_async' } }),
    sse_attach: rateScenario('chatSse', sseRps, { tags: { mix: 'sse' } }),
    reads: rateScenario('reads', readRps, { tags: { mix: 'reads' } }),
    ingest: rateScenario('ingest', ingestRps, { tags: { mix: 'ingest' } }),
    payments: rateScenario('payments', paymentRps, { tags: { mix: 'payments' } }),
  },
  thresholds: {
    ...sharedThresholds,
    // Asynchronous enqueue must be a fast acknowledgment (202), not a turn.
    'http_req_duration{endpoint:chat_async}': ['p(95)<100'],
    // TTFB approximates SSE attach; total body duration is the full turn.
    'http_req_waiting{endpoint:chat_sse}': ['p(95)<1000'],
    // Reads and payments are cheap; a slow tail here points at the database.
    'http_req_duration{expected_response:true}': ['p(95)<3000'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

function jsonHeaders() {
  return authHeaders();
}

function enqueueAsync() {
  const response = http.post(`${baseUrl()}/api/chat?async_mode=true`, chatPayload(), {
    headers: jsonHeaders(),
    tags: { endpoint: 'chat_async' },
    timeout: __ENV.ENQUEUE_TIMEOUT || '10s',
  });
  check(response, {
    'async enqueue is 2xx': (result) => result.status >= 200 && result.status < 300,
  });
  try {
    return response.json('job_id');
  } catch {
    return null;
  }
}

export function chatSync() {
  postChat({ mix: 'chat_sync' });
}

export function chatAsyncPoll() {
  const jobId = enqueueAsync();
  if (!jobId) {
    return;
  }
  const deadline = Date.now() + Number(__ENV.JOB_WAIT_MS || 120000);
  while (Date.now() < deadline) {
    const response = http.get(`${baseUrl()}/api/chat/jobs/${jobId}`, {
      headers: jsonHeaders(),
      tags: { endpoint: 'chat_job_poll' },
      timeout: '10s',
    });
    let status = '';
    try {
      status = String(response.json('status'));
    } catch {
      status = '';
    }
    if (status === 'completed' || status === 'failed') {
      check(response, {
        'job reaches a terminal state': () => status === 'completed' || status === 'failed',
        'job did not fail unexpectedly': () => status === 'completed',
      });
      return;
    }
    sleep(Number(__ENV.POLL_INTERVAL_SECONDS || 0.25));
  }
  check(null, { 'job completed before deadline': () => false });
}

export function chatSse() {
  const jobId = enqueueAsync();
  if (!jobId) {
    return;
  }
  const response = http.get(`${baseUrl()}/api/chat/jobs/${jobId}/stream`, {
    headers: { ...jsonHeaders(), Accept: 'text/event-stream' },
    tags: { endpoint: 'chat_sse' },
    timeout: __ENV.SSE_TIMEOUT || '120s',
  });
  check(response, {
    'SSE stream attaches with 200': (result) => result.status === 200,
    'SSE stream emits a terminal event': (result) =>
      typeof result.body === 'string' &&
      (result.body.includes('event: complete') || result.body.includes('event: error')),
  });
}

export function reads() {
  const responses = http.batch([
    [
      'GET',
      `${baseUrl()}/api/sessions?limit=20`,
      null,
      { headers: jsonHeaders(), tags: { endpoint: 'sessions_list' } },
    ],
    [
      'GET',
      `${baseUrl()}/api/analytics/summary`,
      null,
      { headers: jsonHeaders(), tags: { endpoint: 'analytics_summary' } },
    ],
    [
      'GET',
      `${baseUrl()}/api/analytics/pipeline`,
      null,
      { headers: jsonHeaders(), tags: { endpoint: 'analytics_pipeline' } },
    ],
    [
      'GET',
      `${baseUrl()}/api/analytics/top-skills?top_n=12`,
      null,
      { headers: jsonHeaders(), tags: { endpoint: 'analytics_skills' } },
    ],
    [
      'GET',
      `${baseUrl()}/api/payments/status`,
      null,
      { headers: jsonHeaders(), tags: { endpoint: 'payments_status' } },
    ],
  ]);
  for (const response of responses) {
    check(response, { 'read is not a 5xx': (result) => result.status < 500 });
  }
  readiness();
}

export function ingest() {
  const resume =
    __ENV.RESUME_TEXT ||
    'Jane Doe\nSoftware Engineer\n8 years experience\nTypeScript, Python, PostgreSQL\n';
  const body = {
    files: http.file(resume, __ENV.RESUME_FILENAME || 'resume.txt', 'text/plain'),
  };
  if (__ENV.SESSION_ID) {
    body.session_id = __ENV.SESSION_ID;
  }
  const response = http.post(`${baseUrl()}/api/ingest/upload`, body, {
    headers: { Authorization: `Bearer ${authToken()}` },
    tags: { endpoint: 'ingest_upload' },
    timeout: __ENV.INGEST_TIMEOUT || '120s',
  });
  check(response, {
    'ingest is not a 5xx': (result) => result.status < 500,
  });
}

export function payments() {
  const secret = __ENV.RAZORPAY_KEY_SECRET || '';
  const orderId = `order_load_${__VU}_${__ITER}`;
  const paymentId = `pay_load_${__VU}_${__ITER}`;
  const signature = secret
    ? crypto.hmac('sha256', secret, `${orderId}|${paymentId}`, 'hex')
    : 'load_test_signature';

  const response = http.post(
    `${baseUrl()}/api/payments/verify`,
    JSON.stringify({
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
      plan_id: __ENV.PLAN_ID || 'pro_monthly',
    }),
    { headers: jsonHeaders(), tags: { endpoint: 'payments_verify' }, timeout: '15s' },
  );
  // Invalid/mock signatures are expected without the real secret; only server
  // failures indicate a regression.
  check(response, { 'payment verify is not a 5xx': (result) => result.status < 500 });
  sleep(Number(__ENV.THINK_TIME_SECONDS || 0.2));
}
