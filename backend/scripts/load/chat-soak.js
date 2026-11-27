import { sleep } from 'k6';
import { postChat, readiness, sharedThresholds } from './common.js';

/**
 * Soak profile: low, steady load for a long window to expose leaks, pool
 * starvation, Redis key growth and latency drift. The default is 30 rps for
 * 2 hours; CI uses a shorter `DURATION` on the nightly schedule.
 */
const targetRps = Number(__ENV.TARGET_RPS || 30);
const duration = __ENV.DURATION || '2h';
const preAllocatedVUs = Number(__ENV.PRE_ALLOCATED_VUS || 60);

export const options = {
  scenarios: {
    soak_chat: {
      executor: 'constant-arrival-rate',
      rate: targetRps,
      timeUnit: '1s',
      duration,
      preAllocatedVUs,
      maxVUs: preAllocatedVUs * 4,
      gracefulStop: '60s',
      tags: { scenario: 'soak' },
    },
  },
  thresholds: {
    ...sharedThresholds,
    recruitai_chat_duration: ['p(95)<30000', 'p(99)<45000'],
    recruitai_readiness_duration: ['p(99)<50'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export default function () {
  postChat();
  if (__ITER % 20 === 0) {
    readiness();
  }
  sleep(Number(__ENV.THINK_TIME_SECONDS || 0.5));
}
