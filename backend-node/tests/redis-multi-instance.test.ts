import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import { RedisChatJobManager } from '../src/jobs/redis-job-manager.js';

/**
 * Opt-in integration proof for the Phase 21 multi-instance contract.
 *
 * The default unit suite uses a fake Redis double; this test exercises the
 * real BullMQ/ioredis path. Point `REDIS_INTEGRATION_URL` at a disposable Redis
 * (for example `redis://127.0.0.1:6390`) to run it:
 *
 *   REDIS_INTEGRATION_URL=redis://127.0.0.1:6390 npm run test:integration:redis
 *
 * Each run uses a unique queue name, so it never touches production keys.
 */
const REDIS_URL = process.env.REDIS_INTEGRATION_URL ?? '';
const skip = REDIS_URL ? false : 'set REDIS_INTEGRATION_URL to a disposable Redis';

const USER = 'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3';
const SESSION = '22222222-2222-4222-8222-222222222222';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(probe: () => Promise<T | null>, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== null) {
      return value;
    }
    await delay(25);
  }
  throw new Error('condition was not met before the timeout');
}

describe('Redis job manager across two instances', { skip }, () => {
  it('serves status and SSE for a job enqueued by another instance', async () => {
    const queueName = `recruitai-it-${randomUUID()}`;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runner = async (): Promise<unknown> => {
      await gate;
      return { answer: 'cross-instance' };
    };

    const instanceA = new RedisChatJobManager({
      redisUrl: REDIS_URL,
      queueName,
      runner,
      workerConcurrency: 1,
      retryDelayMs: 100,
    });
    const instanceB = new RedisChatJobManager({
      redisUrl: REDIS_URL,
      queueName,
      runner,
      workerConcurrency: 1,
      retryDelayMs: 100,
    });

    try {
      // A owns the enqueue; B is a different manager with its own connections.
      const job = await instanceA.createJob(USER, SESSION);
      await instanceA.startJob(job.job_id, { message: 'hello' });

      const running = await waitFor(async () => {
        const snapshot = await instanceB.getJob(job.job_id, USER);
        return snapshot?.status === 'running' ? snapshot : null;
      });
      assert.equal(running.job_id, job.job_id);

      // B streams a turn it never enqueued. Frames arrive through Redis
      // pub/sub plus the replay list, not through process memory.
      const frames: string[] = [];
      const streamed = (async () => {
        for await (const frame of instanceB.streamEvents(job.job_id, USER)) {
          frames.push(frame);
        }
      })();

      release();
      await streamed;

      assert.ok(frames.some((frame) => frame.startsWith('event: init')));
      assert.ok(frames.some((frame) => frame.startsWith('event: status')));
      const complete = frames.find((frame) => frame.startsWith('event: complete'));
      assert.ok(complete, 'expected a terminal complete frame');
      assert.match(complete, /cross-instance/);

      const snapshot = await instanceB.getJob(job.job_id, USER);
      assert.equal(snapshot?.status, 'completed');
      assert.deepEqual(snapshot?.result, { answer: 'cross-instance' });
    } finally {
      release();
      await Promise.allSettled([instanceA.close(), instanceB.close()]);
    }
  });
});
