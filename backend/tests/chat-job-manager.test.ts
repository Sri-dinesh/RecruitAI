import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ChatJobNotFoundError,
  formatSseEvent,
  jobToDict,
  type ChatJobEvent,
} from '../src/jobs/chat-job-manager.js';
import { InMemoryChatJobManager } from '../src/jobs/in-memory-job-manager.js';

const USER = 'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3';
const OTHER = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';

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

function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function collect(generator: AsyncGenerator<string, void, void>): Promise<string[]> {
  const frames: string[] = [];
  for await (const frame of generator) {
    frames.push(frame);
  }
  return frames;
}

function parseFrames(frames: readonly string[]): ChatJobEvent[] {
  return frames.map((frame) => {
    const event = /^event: (.+)$/m.exec(frame)?.[1];
    const data = /^data: (.+)$/m.exec(frame)?.[1];
    assert.ok(event);
    assert.ok(data);
    return {
      event: event as ChatJobEvent['event'],
      data: JSON.parse(data) as Record<string, unknown>,
    };
  });
}

describe('jobToDict / formatSseEvent', () => {
  it('serializes the Python AgentJob.to_dict shape in order', () => {
    const dict = jobToDict({
      job_id: 'job-1',
      session_id: SESSION,
      status: 'completed',
      created_at: 10,
      updated_at: 11,
      steps_count: 0,
      result: { response: 'hello' },
      error: null,
    });

    assert.deepEqual(Object.keys(dict), [
      'job_id',
      'session_id',
      'status',
      'created_at',
      'updated_at',
      'steps_count',
      'result',
      'error',
    ]);
    assert.equal(dict.result && (dict.result as Record<string, unknown>).response, 'hello');
  });

  it('emits SSE frames with a blank line terminator', () => {
    assert.equal(
      formatSseEvent('status', { status: 'running' }),
      'event: status\ndata: {"status":"running"}\n\n',
    );
  });
});

describe('InMemoryChatJobManager lifecycle', () => {
  it('creates a queued UUID job with Python timestamps', async () => {
    const manager = new InMemoryChatJobManager({
      runner: async () => ({ ok: true }),
      now: () => 42,
    });
    const job = await manager.createJob(USER, SESSION);

    assert.match(job.job_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.equal(job.session_id, SESSION);
    assert.equal(job.status, 'queued');
    assert.equal(job.created_at, 42);
    assert.equal(job.updated_at, 42);
    assert.equal(job.steps_count, 0);
    assert.equal(job.result, null);
    assert.equal(job.error, null);
  });

  it('scopes lookups to the owning tenant', async () => {
    const manager = new InMemoryChatJobManager({ runner: async () => ({}) });
    const job = await manager.createJob(USER, SESSION);

    assert.ok(await manager.getJob(job.job_id, USER));
    assert.equal(await manager.getJob(job.job_id, OTHER), null);
    assert.equal(await manager.getJob('missing', USER), null);
  });

  it('runs queued -> running -> completed and emits status then complete', async () => {
    const gate = deferred<{ response: string }>();
    const manager = new InMemoryChatJobManager({
      runner: () => gate.promise,
      schedule: (task) => task(),
      now: () => 100,
    });
    const job = await manager.createJob(USER, SESSION);
    await manager.startJob(job.job_id, {});

    assert.equal((await manager.getJob(job.job_id, USER))?.status, 'running');

    gate.resolve({ response: 'done' });
    await tick();

    const finished = await manager.getJob(job.job_id, USER);
    assert.equal(finished?.status, 'completed');
    assert.deepEqual(finished?.result, { response: 'done' });
    assert.equal(finished?.error, null);
  });

  it('marks the job failed and keeps the Python error string', async () => {
    const manager = new InMemoryChatJobManager({
      runner: async () => {
        throw new Error('graph exploded');
      },
      schedule: (task) => task(),
      now: () => 200,
    });
    const job = await manager.createJob(USER, SESSION);
    await manager.startJob(job.job_id, {});
    await tick();

    const failed = await manager.getJob(job.job_id, USER);
    assert.equal(failed?.status, 'failed');
    assert.equal(failed?.error, 'graph exploded');
    assert.equal(failed?.updated_at, 200);
  });

  it('passes the queued payload to the runner unchanged', async () => {
    let received: Record<string, unknown> | null = null;
    const manager = new InMemoryChatJobManager({
      runner: async (payload) => {
        received = payload;
        return { ok: true };
      },
      schedule: (task) => task(),
    });
    const job = await manager.createJob(USER, SESSION);
    await manager.startJob(job.job_id, { message: 'hello', sessionId: SESSION });
    await tick();

    assert.deepEqual(received, { message: 'hello', sessionId: SESSION });
  });
});

describe('InMemoryChatJobManager streaming', () => {
  it('streams a live turn as init, status, complete', async () => {
    const gate = deferred<{ response: string }>();
    const manager = new InMemoryChatJobManager({
      runner: () => gate.promise,
      schedule: (task) => task(),
    });
    const job = await manager.createJob(USER, SESSION);
    await manager.startJob(job.job_id, {});

    const frames = collect(manager.streamEvents(job.job_id, USER));
    await tick();
    gate.resolve({ response: 'streamed' });

    const events = parseFrames(await frames);
    assert.deepEqual(
      events.map((event) => event.event),
      ['init', 'status', 'complete'],
    );
    assert.deepEqual(events[0]?.data, { job_id: job.job_id, status: 'running' });
    assert.deepEqual(events[1]?.data, { status: 'running', message: 'Agent thinking...' });
    assert.deepEqual(events[2]?.data, { response: 'streamed' });
  });

  it('replays every buffered event to multiple subscribers', async () => {
    const gate = deferred<{ response: string }>();
    const manager = new InMemoryChatJobManager({
      runner: () => gate.promise,
      schedule: (task) => task(),
    });
    const job = await manager.createJob(USER, SESSION);
    await manager.startJob(job.job_id, {});

    const first = collect(manager.streamEvents(job.job_id, USER));
    const second = collect(manager.streamEvents(job.job_id, USER));
    await tick();
    gate.resolve({ response: 'shared' });

    for (const events of [parseFrames(await first), parseFrames(await second)]) {
      assert.deepEqual(
        events.map((event) => event.event),
        ['init', 'status', 'complete'],
      );
      assert.deepEqual(events[2]?.data, { response: 'shared' });
    }
  });

  it('replays only the terminal event for an already completed job', async () => {
    const manager = new InMemoryChatJobManager({
      runner: async () => ({ response: 'early' }),
      schedule: (task) => task(),
    });
    const job = await manager.createJob(USER, SESSION);
    await manager.startJob(job.job_id, {});
    await tick();

    const events = parseFrames(await collect(manager.streamEvents(job.job_id, USER)));
    assert.deepEqual(
      events.map((event) => event.event),
      ['init', 'complete'],
    );
    assert.equal(events[0]?.data.status, 'completed');
    assert.deepEqual(events[1]?.data, { response: 'early' });
  });

  it('replays the error event for an already failed job', async () => {
    const manager = new InMemoryChatJobManager({
      runner: async () => {
        throw new Error('nope');
      },
      schedule: (task) => task(),
    });
    const job = await manager.createJob(USER, SESSION);
    await manager.startJob(job.job_id, {});
    await tick();

    const events = parseFrames(await collect(manager.streamEvents(job.job_id, USER)));
    assert.deepEqual(
      events.map((event) => event.event),
      ['init', 'error'],
    );
    assert.deepEqual(events[1]?.data, { error: 'nope' });
  });

  it('rejects a stream for another tenant', async () => {
    const manager = new InMemoryChatJobManager({ runner: async () => ({}) });
    const job = await manager.createJob(USER, SESSION);

    await assert.rejects(
      () => collect(manager.streamEvents(job.job_id, OTHER)),
      ChatJobNotFoundError,
    );
  });

  it('stops a live stream when the client aborts', async () => {
    const manager = new InMemoryChatJobManager({
      runner: async () => ({ ok: true }),
      // Never runs the turn, so the stream stays open.
      schedule: () => undefined,
    });
    const job = await manager.createJob(USER, SESSION);
    await manager.startJob(job.job_id, {});

    const controller = new AbortController();
    const iterator = manager.streamEvents(job.job_id, USER, controller.signal);

    const init = await iterator.next();
    assert.equal(init.done, false);
    assert.match(String(init.value), /^event: init/);

    const pending = iterator.next();
    controller.abort();
    const finished = await pending;
    assert.equal(finished.done, true);
  });
});

describe('InMemoryChatJobManager retention', () => {
  it('sweeps jobs older than the TTL on the next create', async () => {
    let now = 1_000;
    const manager = new InMemoryChatJobManager({
      runner: async () => ({}),
      ttlSeconds: 60,
      now: () => now,
    });

    const stale = await manager.createJob(USER, SESSION);
    now = 1_061;
    const fresh = await manager.createJob(USER, SESSION);

    assert.equal(await manager.getJob(stale.job_id, USER), null);
    assert.ok(await manager.getJob(fresh.job_id, USER));
  });

  it('unblocks pending streams when the manager closes', async () => {
    const manager = new InMemoryChatJobManager({
      runner: async () => ({}),
      schedule: () => undefined,
    });
    const job = await manager.createJob(USER, SESSION);
    await manager.startJob(job.job_id, {});

    const iterator = manager.streamEvents(job.job_id, USER);
    await iterator.next(); // init
    const pending = iterator.next();
    await manager.close();

    const finished = await pending;
    assert.equal(finished.done, true);
  });
});
