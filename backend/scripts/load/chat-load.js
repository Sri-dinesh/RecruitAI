import { sleep } from 'k6';
import { postChat, readiness, sharedThresholds } from './common.js';

/**
 * Sustained load.
 *
 * Default target: 120 chat turns/second, which approximates 3,600 recruiters
 * sending one turn every 30 s (a 10K-user fleet with mixed polling/turn
 * traffic is covered by the spike profile). Override with TARGET_RPS and
 * DURATION.
 */
const targetRps = Number(__ENV.TARGET_RPS || 120);
const duration = __ENV.DURATION || '10m';
const preAllocatedVUs = Number(__ENV.PRE_ALLOCATED_VUS || Math.max(50, targetRps * 2));

export const options = {
  scenarios: {
    steady_chat: {
      executor: 'constant-arrival-rate',
      rate: targetRps,
      timeUnit: '1s',
      duration,
      preAllocatedVUs,
      maxVUs: preAllocatedVUs * 4,
      gracefulStop: '30s',
      tags: { scenario: 'steady' },
    },
  },
  thresholds: sharedThresholds,
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export default function () {
  postChat();
  if (__ITER % 10 === 0) {
    readiness();
  }
  sleep(Number(__ENV.THINK_TIME_SECONDS || 0.2));
}
