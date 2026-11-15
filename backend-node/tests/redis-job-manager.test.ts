import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DelayedError } from 'bullmq';

import {
  RedisChatJobManager,
  type RedisCommandClient,
  type RedisJob,
  type RedisJobBackend,
  type RedisJobBackendFactory,
  type RedisQueuePort,
  type RedisWorkerPort,
} from '../src/jobs/redis-job-manager.js';

const USER = 'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3';
const OTHER = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';

function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Pub/sub bus shared by the fake data and subscriber connections. */
class FakeBus {
  private readonly subscriptions = new Map<
    string,
    Set<(channel: string, message: string) => void>
  >();

  subscribe(channel: string, listener: (channel: string, message: string) => void): void {
    const listeners = this.subscriptions.get(channel) ?? new Set();
    listeners.add(listener);
    this.subscriptions.set(channel, listeners);
  }

  unsubscribe(channel: string, listener: (channel: string, message: string) => void): void {
    this.subscriptions.get(channel)?.delete(listener);
  }

  publish(channel: string, message: string): void {
    for (const listener of this.subscriptions.get(channel) ?? []) {
      listener(channel, message);
    }
  }
}

class FakeRedis implements RedisCommandClient {
  readonly hashes = new Map<string, Record<string, string>>();
  readonly lists = new Map<string, string[]>();
  readonly counters = new Map<string, number>();
  readonly expiries = new Map<string, number>();
  private readonly listeners = new Set<(channel: string, message: string) => void>();
  private readonly subscriptions = new Set<string>();
  quitCalls = 0;

  constructor(private readonly bus: FakeBus) {}

  async hset(key: string, values: Record<string, string>): Promise<unknown> {
    this.hashes.set(key, { ...(this.hashes.get(key) ?? {}), ...values });
    return Object.keys(values).length;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return { ...(this.hashes.get(key) ?? {}) };
  }

  async expire(key: string, seconds: number): Promise<unknown> {
    this.expiries.set(key, seconds);
    return 1;
  }

  async del(key: string): Promise<unknown> {
    this.hashes.delete(key);
    this.lists.delete(key);
    this.counters.delete(key);
    return 1;
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const list = this.lists.get(key) ?? [];
    const from = start < 0 ? Math.max(0, list.length + start) : start;
    const to = stop < 0 ? list.length + stop + 1 : stop + 1;
    return list.slice(from, to);
  }

  async rpush(key: string, value: string): Promise<unknown> {
    const list = this.lists.get(key) ?? [];
    list.push(value);
    this.lists.set(key, list);
    return list.length;
  }

  async ltrim(key: string, start: number, stop: number): Promise<unknown> {
    const list = this.lists.get(key) ?? [];
    const from = start < 0 ? Math.max(0, list.length + start) : start;
    const to = stop < 0 ? list.length + stop + 1 : stop + 1;
    this.lists.set(key, list.slice(from, to));
    return 'OK';
  }

  async incr(key: string): Promise<number> {
    const value = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, value);
    return value;
  }

  async decr(key: string): Promise<number> {
    const value = (this.counters.get(key) ?? 0) - 1;
    this.counters.set(key, value);
    return value;
  }

  async publish(channel: string, message: string): Promise<unknown> {
    this.bus.publish(channel, message);
    return 0;
  }

  async subscribe(channel: string): Promise<unknown> {
    this.subscriptions.add(channel);
    for (const listener of this.listeners) {
      this.bus.subscribe(channel, listener);
    }
    return 1;
  }

  async unsubscribe(channel: string): Promise<unknown> {
    this.subscriptions.delete(channel);
    for (const listener of this.listeners) {
      this.bus.unsubscribe(channel, listener);
    }
    return 1;
  }

  on(event: 'message', listener: (channel: string, message: string) => void): void {
    if (event !== 'message') {
      return;
    }
    this.listeners.add(listener);
    for (const channel of this.subscriptions) {
      this.bus.subscribe(channel, listener);
    }
  }

  off(event: 'message', listener: (channel: string, message: string) => void): void {
    if (event !== 'message') {
      return;
    }
    this.listeners.delete(listener);
    for (const channel of this.subscriptions) {
      this.bus.unsubscribe(channel, listener);
    }
  }

  async eval(
    _script: string,
    keys: readonly string[],
    args: readonly (string | number)[],
  ): Promise<unknown> {
    const key = keys[0] ?? '';
    const limit = Number(args[0]);
    const current = this.counters.get(key) ?? 0;
    if (current >= limit) {
      return 0;
    }
    this.counters.set(key, current + 1);
    return 1;
  }

  async quit(): Promise<unknown> {
    this.quitCalls += 1;
    return 'OK';
  }
}

class FakeQueue implements RedisQueuePort {
  readonly additions: Array<{ name: string; data: unknown; options: Record<string, unknown> }> = [];
  closeCalls = 0;

  async add(name: string, data: unknown, options: Record<string, unknown>): Promise<unknown> {
    this.additions.push({ name, data, options });
    return { id: String(options.jobId ?? '') };
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
  }
}

class FakeWorker implements RedisWorkerPort {
  readonly errors: Array<(error: unknown) => void> = [];
  closeCalls = 0;

  onError(listener: (error: unknown) => void): void {
    this.errors.push(listener);
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
  }
}

interface Harness {
  readonly manager: RedisChatJobManager;
  readonly redis: FakeRedis;
  readonly subscriber: FakeRedis;
  readonly queue: FakeQueue;
  readonly worker: FakeWorker;
  process(jobId: string, payload: Record<string, unknown>, token?: string): Promise<void>;
}

function harness(
  runner: (payload: Record<string, unknown>) => Promise<unknown>,
  options: { perUserConcurrency?: number; now?: () => number; retryDelayMs?: number } = {},
): Harness {
  const bus = new FakeBus();
  const redis = new FakeRedis(bus);
  const subscriber = new FakeRedis(bus);
  const queue = new FakeQueue();
  const worker = new FakeWorker();

  let processor!: (job: RedisJob, token?: string) => Promise<void>;
  const backendFactory: RedisJobBackendFactory = (backendOptions) => {
    processor = backendOptions.processor;
    const backend: RedisJobBackend = { redis, subscriber, queue, worker };
    return backend;
  };

  const manager = new RedisChatJobManager({
    redisUrl: 'redis://fake',
    runner,
    backendFactory,
    ...(options.perUserConcurrency === undefined
      ? {}
      : { perUserConcurrency: options.perUserConcurrency }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.retryDelayMs === undefined ? {} : { retryDelayMs: options.retryDelayMs }),
  });

  return {
    manager,
    redis,
    subscriber,
    queue,
    worker,
    process: (jobId, payload, token) =>
      processor(
        {
          data: { jobId, payload },
          moveToDelayed: async (timestamp, moveToken) => {
            delayed.push({
              jobId,
              timestamp,
              ...(moveToken === undefined ? {} : { token: moveToken }),
            });
          },
        },
        token,
      ),
  };
}

const delayed: Array<{ jobId: string; timestamp: number; token?: string }> = [];

async function collect(generator: AsyncGenerator<string, void, void>): Promise<string[]> {
  const frames: string[] = [];
  for await (const frame of generator) {
    frames.push(frame);
  }
  return frames;
}

function eventNames(frames: readonly string[]): string[] {
  return frames.map((frame) => /^event: (.+)$/m.exec(frame)?.[1] ?? '');
}

describe('RedisChatJobManager records', () => {
  it('stores the job lifecycle fields in a Redis hash', async () => {
    const { manager, redis } = harness(async () => ({}), { now: () => 77 });
    const job = await manager.createJob(USER, SESSION);

    const stored = redis.hashes.get(`recruitai:chat:job:${job.job_id}`);
    assert.equal(stored?.user_id, USER);
    assert.equal(stored?.session_id, SESSION);
    assert.equal(stored?.status, 'queued');
    assert.equal(stored?.created_at, '77');
    assert.equal(stored?.result, 'null');
    assert.equal(redis.expiries.get(`recruitai:chat:job:${job.job_id}`), 3600);
  });

  it('scopes reads to the owning tenant', async () => {
    const { manager } = harness(async () => ({}));
    const job = await manager.createJob(USER, SESSION);

    assert.ok(await manager.getJob(job.job_id, USER));
    assert.equal(await manager.getJob(job.job_id, OTHER), null);
    assert.equal(await manager.getJob('missing', USER), null);
  });

  it('enqueues the turn with the job id as the BullMQ job id', async () => {
    const { manager, queue } = harness(async () => ({}));
    const job = await manager.createJob(USER, SESSION);
    await manager.startJob(job.job_id, { message: 'hello' });

    assert.equal(queue.additions.length, 1);
    const addition = queue.additions[0];
    assert.equal(addition?.name, 'agent-turn');
    assert.deepEqual(addition?.data, { jobId: job.job_id, payload: { message: 'hello' } });
    assert.equal(addition?.options.jobId, job.job_id);
    assert.equal(addition?.options.attempts, 1);
  });

  it('does not enqueue an unknown job', async () => {
    const { manager, queue } = harness(async () => ({}));
    await manager.startJob('missing', {});
    assert.equal(queue.additions.length, 0);
  });
});

describe('RedisChatJobManager execution', () => {
  it('runs the turn and stores the completed result', async () => {
    const { manager, process } = harness(async (payload) => ({ echo: payload }), { now: () => 10 });
    const job = await manager.createJob(USER, SESSION);
    await manager.startJob(job.job_id, { message: 'hi' });

    await process(job.job_id, { message: 'hi' }, 'token');

    const snapshot = await manager.getJob(job.job_id, USER);
    assert.equal(snapshot?.status, 'completed');
    assert.deepEqual(snapshot?.result, { echo: { message: 'hi' } });
    assert.equal(snapshot?.error, null);
  });

  it('records runner failures as a failed job with the error string', async () => {
    const { manager, process } = harness(async () => {
      throw new Error('agent boom');
    });
    const job = await manager.createJob(USER, SESSION);
    await manager.startJob(job.job_id, {});

    await process(job.job_id, {}, 'token');

    const snapshot = await manager.getJob(job.job_id, USER);
    assert.equal(snapshot?.status, 'failed');
    assert.equal(snapshot?.error, 'agent boom');
  });

  it('delays the job when the per-user concurrency cap is reached', async () => {
    const gate = deferred<{ ok: boolean }>();
    const { manager, process, redis } = harness(() => gate.promise, {
      perUserConcurrency: 1,
      retryDelayMs: 250,
    });
    const first = await manager.createJob(USER, SESSION);
    const second = await manager.createJob(USER, SESSION);
    await manager.startJob(first.job_id, {});
    await manager.startJob(second.job_id, {});

    delayed.length = 0;
    const firstRun = process(first.job_id, {}, 'token-1');
    await tick();

    const slotKey = `recruitai:chat:user:${USER}:active`;
    assert.equal(redis.counters.get(slotKey), 1);

    await assert.rejects(() => process(second.job_id, {}, 'token-2'), DelayedError);
    assert.equal(delayed.length, 1);
    assert.equal(delayed[0]?.jobId, second.job_id);
    assert.ok((delayed[0]?.timestamp ?? 0) > Date.now());

    gate.resolve({ ok: true });
    await firstRun;
    assert.equal(redis.counters.get(slotKey), undefined);

    // The delayed job succeeds once a slot is free.
    await process(second.job_id, {}, 'token-2');
    assert.equal((await manager.getJob(second.job_id, USER))?.status, 'completed');
  });

  it('ignores a job that another worker already completed', async () => {
    let calls = 0;
    const { manager, process } = harness(async () => {
      calls += 1;
      return { ok: true };
    });
    const job = await manager.createJob(USER, SESSION);
    await manager.startJob(job.job_id, {});

    await process(job.job_id, {}, 'token');
    await process(job.job_id, {}, 'token');

    assert.equal(calls, 1);
  });

  it('closes every backend resource once', async () => {
    const { manager, queue, worker, redis, subscriber } = harness(async () => ({}));
    await manager.close();

    assert.equal(queue.closeCalls, 1);
    assert.equal(worker.closeCalls, 1);
    assert.equal(redis.quitCalls, 1);
    assert.equal(subscriber.quitCalls, 1);
  });
});

describe('RedisChatJobManager streaming', () => {
  it('streams init, status and complete across connections', async () => {
    const { manager, process } = harness(async () => ({ response: 'redis done' }));
    const job = await manager.createJob(USER, SESSION);
    await manager.startJob(job.job_id, {});

    const frames = collect(manager.streamEvents(job.job_id, USER));
    await tick();
    await process(job.job_id, {}, 'token');

    const events = await frames;
    assert.deepEqual(eventNames(events), ['init', 'status', 'complete']);
    assert.match(events[2] ?? '', /"response":"redis done"/);
  });

  it('replays the terminal event for a completed job', async () => {
    const { manager, process } = harness(async () => ({ response: 'early' }));
    const job = await manager.createJob(USER, SESSION);
    await manager.startJob(job.job_id, {});
    await process(job.job_id, {}, 'token');

    const events = await collect(manager.streamEvents(job.job_id, USER));
    assert.deepEqual(eventNames(events), ['init', 'complete']);
  });

  it('replays the error event for a failed job', async () => {
    const { manager, process } = harness(async () => {
      throw new Error('stream boom');
    });
    const job = await manager.createJob(USER, SESSION);
    await manager.startJob(job.job_id, {});
    await process(job.job_id, {}, 'token');

    const events = await collect(manager.streamEvents(job.job_id, USER));
    assert.deepEqual(eventNames(events), ['init', 'error']);
    assert.match(events[1] ?? '', /"error":"stream boom"/);
  });

  it('stops a live stream when the client aborts', async () => {
    const { manager } = harness(async () => ({}));
    const job = await manager.createJob(USER, SESSION);
    await manager.startJob(job.job_id, {});

    const controller = new AbortController();
    const iterator = manager.streamEvents(job.job_id, USER, controller.signal);
    const init = await iterator.next();
    assert.equal(init.done, false);

    const pending = iterator.next();
    controller.abort();
    const finished = await pending;
    assert.equal(finished.done, true);
  });

  it('rejects a stream for another tenant', async () => {
    const { manager } = harness(async () => ({}));
    const job = await manager.createJob(USER, SESSION);

    await assert.rejects(() => collect(manager.streamEvents(job.job_id, OTHER)));
  });
});
