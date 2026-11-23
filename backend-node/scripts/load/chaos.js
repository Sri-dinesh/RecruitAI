import { sleep } from 'k6';
import { baseUrl, chatPayload, authToken, liveness, postChat, readiness } from './common.js';

/**
 * Chaos companion traffic.
 *
 * Run this with `chaos-drill.sh` (or inject a fault yourself) while the load is
 * live. It asserts the degradation contract rather than availability:
 * - liveness stays 200 throughout;
 * - readiness answers 200 or 503 (never a timeout / connection reset);
 * - chat turns are either 2xx or a deliberate 429/503 (never an unhandled 500);
 * - sync chat keeps working while Redis is in degraded mode.
 */
export const options = {
  scenarios: {
    chaos_traffic: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.TARGET_RPS || 20),
      timeUnit: '1s',
      duration: __ENV.DURATION || '12m',
      preAllocatedVUs: Number(__ENV.PRE_ALLOCATED_VUS || 100),
      maxVUs: Number(__ENV.PRE_ALLOCATED_VUS || 100) * 3,
      gracefulStop: '30s',
      tags: { scenario: 'chaos' },
    },
  },
  thresholds: {
    recruitai_chat_failures: ['rate<0.10'],
    recruitai_readiness_duration: ['p(99)<2000'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export default function () {
  liveness();
  readiness();

  const response = postChat();
  // During a fault window, 503/429 are the graceful answers. A 500 means the
  // degradation path leaked or the breaker was bypassed.
  if (response.status >= 500 && response.status !== 503) {
    console.error(`unexpected status ${response.status} for ${baseUrl()}/api/chat`);
  }
  sleep(Number(__ENV.THINK_TIME_SECONDS || 1));
}

export function setup() {
  // Fail fast on missing auth instead of emitting thousands of 401s.
  authToken();
  return { startedAt: Date.now(), sample: chatPayload().length };
}
