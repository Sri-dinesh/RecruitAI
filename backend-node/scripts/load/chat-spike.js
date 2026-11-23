import { postChat, readiness, sharedThresholds } from './common.js';

/**
 * Spike profile: ramps arrival rate from a quiet baseline to the configured
 * peak, holds it, then drops back. The ramp is intentionally faster than the
 * autoscaler so queuing, 429s and breaker behavior are observable.
 *
 * 10K concurrent users opening a chat turn every ~30 s is roughly 333 rps;
 * PEAK_RPS defaults to 400 with short bursts to 600.
 */
const baseline = Number(__ENV.BASELINE_RPS || 20);
const peak = Number(__ENV.PEAK_RPS || 400);
const preAllocatedVUs = Number(__ENV.PRE_ALLOCATED_VUS || 600);

export const options = {
  scenarios: {
    spike_chat: {
      executor: 'ramping-arrival-rate',
      startRate: baseline,
      timeUnit: '1s',
      preAllocatedVUs,
      maxVUs: preAllocatedVUs * 3,
      gracefulStop: '30s',
      stages: [
        { target: baseline, duration: '1m' },
        { target: peak, duration: '2m' },
        { target: peak, duration: '3m' },
        { target: Math.round(peak * 1.5), duration: '1m' },
        { target: baseline, duration: '2m' },
      ],
      tags: { scenario: 'spike' },
    },
  },
  thresholds: {
    ...sharedThresholds,
    // A spike may legitimately return 429/503; only unexpected 5xx fail.
    http_req_failed: ['rate<0.05'],
    recruitai_chat_failures: ['rate<0.05'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export default function () {
  postChat();
  if (__ITER % 10 === 0) {
    readiness();
  }
}
