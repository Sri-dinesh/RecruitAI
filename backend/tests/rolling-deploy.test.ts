import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Opt-in rolling-deploy proof for the Phase 21/24 contract.
 *
 * Starts two real HTTP instances sharing one Redis, enqueues a burst of async
 * chat jobs, opens an SSE stream on instance B, sends `SIGTERM` to instance A,
 * starts a replacement, and then asserts that:
 *
 * - A exits cleanly (code 0) instead of being force-killed;
 * - every enqueued job is still addressable and reaches `completed`;
 * - the SSE stream opened on B emits a terminal `complete` frame.
 *
 * Run against a disposable Redis:
 *
 *   REDIS_INTEGRATION_URL=redis://127.0.0.1:6390 npm run test:integration:redis
 */
const REDIS_URL = process.env.REDIS_INTEGRATION_URL ?? '';
const skip = REDIS_URL ? false : 'set REDIS_INTEGRATION_URL to a disposable Redis';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(HERE, '..');
const TOKEN = 'local-token';
const USER_HEADER = { Authorization: `Bearer ${TOKEN}` };
const JOB_COUNT = 80;
const DRAIN_TIMEOUT_MS = 120_000;

interface Instance {
  readonly child: ChildProcess;
  readonly port: number;
  readonly dbPath: string;
  readonly logs: string[];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function startInstance(port: number, queueName: string, dbPath: string): Instance {
  // Force the SQLite fallback: the drill exercises Redis jobs, not Postgres.
  const inherited = { ...process.env };
  delete inherited.DATABASE_URL;
  delete inherited.SUPABASE_DB_URL;
  delete inherited.DATABASE_READ_URL;

  const child = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
    cwd: BACKEND_ROOT,
    env: {
      ...inherited,
      ENVIRONMENT: 'test',
      HOST: '127.0.0.1',
      PORT: String(port),
      USE_LOCAL_AUTH: 'true',
      REDIS_URL,
      JOB_QUEUE_NAME: queueName,
      JOB_WORKER_CONCURRENCY: '1',
      JOB_PER_USER_CONCURRENCY: '100',
      SQLITE_FALLBACK_PATH: dbPath,
      LOG_LEVEL: 'warn',
      SHUTDOWN_DRAIN_MS: '3000',
      SHUTDOWN_SSE_GRACE_MS: '1000',
      RETENTION_JOB_ENABLED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const logs: string[] = [];
  const record = (chunk: Buffer): void => {
    logs.push(chunk.toString());
    if (logs.length > 200) {
      logs.shift();
    }
  };
  child.stdout?.on('data', record);
  child.stderr?.on('data', record);
  return { child, port, dbPath, logs };
}

async function waitForHealth(instance: Instance, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (instance.child.exitCode !== null) {
      throw new Error(
        `instance on :${instance.port} exited before listening\n${instance.logs.join('')}`,
      );
    }
    try {
      const response = await fetch(`http://127.0.0.1:${instance.port}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Not listening yet.
    }
    await delay(100);
  }
  throw new Error(
    `instance on :${instance.port} did not become healthy\n${instance.logs.join('')}`,
  );
}

function waitForExit(instance: Instance, timeoutMs: number): Promise<number | null> {
  if (instance.child.exitCode !== null) {
    return Promise.resolve(instance.child.exitCode);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      instance.child.kill('SIGKILL');
      reject(new Error(`instance on :${instance.port} did not exit in ${timeoutMs}ms`));
    }, timeoutMs);
    instance.child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function enqueue(port: number): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${port}/api/chat?async_mode=true`, {
    method: 'POST',
    headers: { ...USER_HEADER, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'hello', conversation_history: [] }),
  });
  assert.equal(response.status, 202, `enqueue returned ${response.status}`);
  const body = (await response.json()) as { job_id?: string };
  assert.equal(typeof body.job_id, 'string');
  return body.job_id as string;
}

interface JobSnapshot {
  readonly status?: string;
  readonly result?: unknown;
}

async function getJob(port: number, jobId: string): Promise<JobSnapshot> {
  const response = await fetch(`http://127.0.0.1:${port}/api/chat/jobs/${jobId}`, {
    headers: USER_HEADER,
  });
  assert.equal(response.status, 200, `job ${jobId} returned ${response.status}`);
  return (await response.json()) as JobSnapshot;
}

/** Read an SSE stream until a terminal frame arrives, then hang up. */
async function streamUntilTerminal(
  port: number,
  jobId: string,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/chat/jobs/${jobId}/stream`, {
      headers: { ...USER_HEADER, Accept: 'text/event-stream' },
      signal: controller.signal,
    });
    assert.equal(response.status, 200);
    assert.ok(response.body, 'SSE response has no body');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      text += decoder.decode(value, { stream: true });
      if (text.includes('event: complete') || text.includes('event: error')) {
        await reader.cancel();
        break;
      }
    }
    return text;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

describe('rolling deploy with a shared Redis', { skip }, () => {
  it('drains queued jobs and SSE across an instance termination', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'recruitai-rolling-'));
    const queueName = `recruitai-rolling-${randomUUID()}`;
    const instances: Instance[] = [];
    const cleanup = async (): Promise<void> => {
      for (const instance of instances) {
        if (instance.child.exitCode === null) {
          instance.child.kill('SIGTERM');
        }
      }
      await Promise.allSettled(instances.map((instance) => waitForExit(instance, 10_000)));
      await rm(dir, { recursive: true, force: true });
    };

    try {
      const instanceA = startInstance(await freePort(), queueName, path.join(dir, 'a.db'));
      const instanceB = startInstance(await freePort(), queueName, path.join(dir, 'b.db'));
      instances.push(instanceA, instanceB);
      await Promise.all([waitForHealth(instanceA), waitForHealth(instanceB)]);

      // A burst of asynchronous turns lands in the same Redis queue. The local
      // deterministic agent is fast enough that enqueues return long before the
      // backlog drains.
      const jobIds = await Promise.all(
        Array.from({ length: JOB_COUNT }, () => enqueue(instanceA.port)),
      );
      assert.equal(new Set(jobIds).size, JOB_COUNT);

      // Open the stream on B for the last job before A is terminated. B never
      // enqueued it, so replay/fan-out must come from Redis.
      const streamed = streamUntilTerminal(instanceB.port, jobIds[jobIds.length - 1]!, 90_000);

      const pendingAtKill = await Promise.all(
        jobIds.map((jobId) => getJob(instanceB.port, jobId)),
      ).then((snapshots) => snapshots.filter((snapshot) => snapshot.status !== 'completed').length);
      assert.ok(
        pendingAtKill > 0,
        'expected a non-empty backlog at SIGTERM; the drill would prove nothing otherwise',
      );

      instanceA.child.kill('SIGTERM');
      const exitCode = await waitForExit(instanceA, 20_000);
      assert.equal(exitCode, 0, `instance A exited with ${exitCode}\n${instanceA.logs.join('')}`);

      // Replacement capacity comes up while B keeps serving the queue.
      const instanceC = startInstance(await freePort(), queueName, path.join(dir, 'c.db'));
      instances.push(instanceC);
      await waitForHealth(instanceC);

      const statuses = new Map<string, string>();
      const deadline = Date.now() + DRAIN_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await Promise.all(
          jobIds.map(async (jobId, index) => {
            if (statuses.get(jobId) === 'completed') {
              return;
            }
            const port = index % 2 === 0 ? instanceB.port : instanceC.port;
            const snapshot = await getJob(port, jobId);
            if (snapshot.status === 'completed') {
              statuses.set(jobId, 'completed');
            } else if (snapshot.status === 'failed') {
              assert.fail(`job ${jobId} failed after the deploy: ${JSON.stringify(snapshot)}`);
            }
          }),
        );
        if (statuses.size === JOB_COUNT) {
          break;
        }
        await delay(250);
      }

      assert.equal(
        statuses.size,
        JOB_COUNT,
        `${JOB_COUNT - statuses.size} job(s) were dropped across the rolling deploy`,
      );

      const frames = await streamed;
      assert.ok(frames.includes('event: complete'), `SSE stream did not complete:\n${frames}`);
    } finally {
      await cleanup();
    }
  });
});
