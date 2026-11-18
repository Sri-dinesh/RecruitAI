import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { WorkerPool, WorkerPoolOverloadedError } from '../src/workers/pool.js';

const fixture = new URL('./fixtures/slow-worker.mjs', import.meta.url);

describe('WorkerPool', () => {
  it('runs tasks on worker threads', async () => {
    const pool = new WorkerPool({ size: 1, maxQueue: 2, workerUrl: fixture });
    try {
      const result = await pool.run<{ echoed: number }>('renderReport', 7);
      assert.deepEqual(result, { echoed: 7 });
    } finally {
      await pool.close();
    }
  });

  it('rejects when the bounded queue is full', async () => {
    const pool = new WorkerPool({ size: 1, maxQueue: 1, workerUrl: fixture });
    try {
      const first = pool.run('renderReport', 1);
      const second = pool.run('renderReport', 2);
      await assert.rejects(pool.run('renderReport', 3), WorkerPoolOverloadedError);
      await Promise.all([first, second]);
    } finally {
      await pool.close();
    }
  });

  it('rejects the task when a worker reports an error', async () => {
    const pool = new WorkerPool({ size: 1, maxQueue: 2, workerUrl: fixture });
    try {
      await assert.rejects(pool.run('parseDocument', {}), /boom/);
    } finally {
      await pool.close();
    }
  });

  it('executes a real structured-resume task through the worker entry point', async () => {
    const pool = new WorkerPool({ size: 1, maxQueue: 2 });
    try {
      const candidate = await pool.run<{ name: string; email: string | null }>(
        'parseStructuredResume',
        {
          rawText: 'Jane Doe\nSkills: Python, React\nEmail: jane@example.com',
          filename: 'jane.txt',
        },
      );
      assert.equal(candidate.name, 'Jane Doe');
      assert.equal(candidate.email, 'jane@example.com');
    } finally {
      await pool.close();
    }
  });
});
