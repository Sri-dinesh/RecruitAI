import { randomUUID } from 'node:crypto';

import { DelayedError, Queue, Worker, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';

import { createLogger } from '../telemetry/logger.js';
import {
  ChatJobNotFoundError,
  errorMessage,
  formatSseEvent,
  terminalEvent,
  type AgentJobSnapshot,
  type ChatJobEventName,
  type ChatJobManager,
  type ChatJobPayload,
  type ChatJobRunner,
  type ChatJobStatus,
} from './chat-job-manager.js';

const logger = createLogger('recruitai.chat_job_manager');

/**
 * Redis/BullMQ-backed chat job manager.
 *
 * Differences from the Python in-memory queue (intentionally, per Phase 14):
 * - job records and lifecycle timestamps live in Redis hashes with a TTL, so
 *   status survives restarts and is visible from any instance;
 * - turns run in BullMQ workers instead of a process-local thread pool;
 * - a Redis counter enforces a fleet-wide per-user concurrency cap; workers
 *   delay and retry a turn when the cap is reached;
 * - SSE frames are appended to a Redis list and published on a per-job
 *   channel, so any instance can stream a job and reconnects replay history.
 *
 * The HTTP/SSE contract is unchanged: same job id shape, lifecycle states,
 * response bodies and event names/payloads as the in-memory manager.
 */

/** Minimal command surface used by the manager (implemented by ioredis). */
export interface RedisCommandClient {
  hset(key: string, values: Record<string, string>): Promise<unknown>;
  hgetall(key: string): Promise<Record<string, string>>;
  expire(key: string, seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  rpush(key: string, value: string): Promise<unknown>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  publish(channel: string, message: string): Promise<unknown>;
  subscribe(channel: string): Promise<unknown>;
  unsubscribe(channel: string): Promise<unknown>;
  on(event: 'message', listener: (channel: string, message: string) => void): void;
  off(event: 'message', listener: (channel: string, message: string) => void): void;
  eval(
    script: string,
    keys: readonly string[],
    args: readonly (string | number)[],
  ): Promise<unknown>;
  quit(): Promise<unknown>;
}

export interface RedisQueuePort {
  add(name: string, data: unknown, options: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}

export interface RedisWorkerPort {
  onError(listener: (error: unknown) => void): void;
  pause?(doNotWaitActive?: boolean): Promise<void>;
  close(force?: boolean): Promise<void>;
}

export interface RedisJob {
  readonly data: unknown;
  moveToDelayed(timestamp: number, token?: string): Promise<unknown>;
}

export interface RedisJobBackend {
  readonly redis: RedisCommandClient;
  readonly subscriber: RedisCommandClient;
  readonly queue: RedisQueuePort;
  readonly worker: RedisWorkerPort;
}

export interface RedisJobBackendOptions {
  readonly redisUrl: string;
  readonly queueName: string;
  readonly concurrency: number;
  readonly processor: (job: RedisJob, token?: string) => Promise<void>;
}

export type RedisJobBackendFactory = (options: RedisJobBackendOptions) => RedisJobBackend;

class IoRedisCommandClient implements RedisCommandClient {
  constructor(private readonly client: Redis) {}

  hset(key: string, values: Record<string, string>): Promise<unknown> {
    return this.client.hset(key, values);
  }
  hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }
  expire(key: string, seconds: number): Promise<unknown> {
    return this.client.expire(key, seconds);
  }
  del(key: string): Promise<unknown> {
    return this.client.del(key);
  }
  lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.lrange(key, start, stop);
  }
  rpush(key: string, value: string): Promise<unknown> {
    return this.client.rpush(key, value);
  }
  ltrim(key: string, start: number, stop: number): Promise<unknown> {
    return this.client.ltrim(key, start, stop);
  }
  incr(key: string): Promise<number> {
    return this.client.incr(key);
  }
  decr(key: string): Promise<number> {
    return this.client.decr(key);
  }
  publish(channel: string, message: string): Promise<unknown> {
    return this.client.publish(channel, message);
  }
  subscribe(channel: string): Promise<unknown> {
    return this.client.subscribe(channel);
  }
  unsubscribe(channel: string): Promise<unknown> {
    return this.client.unsubscribe(channel);
  }
  on(event: 'message', listener: (channel: string, message: string) => void): void {
    this.client.on(event, listener);
  }
  off(event: 'message', listener: (channel: string, message: string) => void): void {
    this.client.off(event, listener);
  }
  eval(
    script: string,
    keys: readonly string[],
    args: readonly (string | number)[],
  ): Promise<unknown> {
    return this.client.eval(script, keys.length, ...keys, ...args);
  }
  quit(): Promise<unknown> {
    return this.client.quit();
  }
}

/** Default backend: BullMQ queue/worker plus two ioredis connections. */
export function createBullMqBackend(options: RedisJobBackendOptions): RedisJobBackend {
  const connection = new Redis(options.redisUrl, { maxRetriesPerRequest: null });
  connection.on('error', (error: Error) => {
    logger.error(`[ChatJobManager] Redis connection error: ${error.message}`);
  });

  const subscriber = new Redis(options.redisUrl);
  subscriber.on('error', (error: Error) => {
    logger.error(`[ChatJobManager] Redis subscriber error: ${error.message}`);
  });

  const queue = new Queue(options.queueName, { connection });
  const worker = new Worker(
    options.queueName,
    async (job, token) => {
      await options.processor(
        {
          data: job.data,
          moveToDelayed: (timestamp, moveToken) => job.moveToDelayed(timestamp, moveToken ?? token),
        },
        token,
      );
    },
    { connection, concurrency: options.concurrency },
  );
  worker.on('error', (error: Error) => {
    logger.error(`[ChatJobManager] BullMQ worker error: ${error.message}`);
  });

  return {
    redis: new IoRedisCommandClient(connection),
    subscriber: new IoRedisCommandClient(subscriber),
    queue: {
      add: (name, data, jobOptions) => queue.add(name, data, jobOptions as JobsOptions),
      close: () => queue.close(),
    },
    worker: {
      onError: (listener) => {
        worker.on('error', listener);
      },
      pause: (doNotWaitActive) => worker.pause(doNotWaitActive),
      close: (force) => worker.close(force),
    },
  };
}

export interface RedisChatJobManagerOptions {
  readonly redisUrl: string;
  readonly runner: ChatJobRunner;
  readonly queueName?: string;
  readonly ttlSeconds?: number;
  readonly perUserConcurrency?: number;
  readonly workerConcurrency?: number;
  readonly eventReplayLimit?: number;
  readonly retryDelayMs?: number;
  readonly now?: () => number;
  readonly backendFactory?: RedisJobBackendFactory;
}

interface StoredEvent {
  readonly index: number;
  readonly event: ChatJobEventName;
  readonly data: Record<string, unknown>;
}

interface QueuedJobData {
  readonly jobId: string;
  readonly payload: ChatJobPayload;
}

/** Script: increment the per-user slot counter only when below the cap. */
const ACQUIRE_SLOT_SCRIPT = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current >= tonumber(ARGV[1]) then
  return 0
end
redis.call('INCR', KEYS[1])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 1
`;

function parseStoredEvent(raw: string): StoredEvent | null {
  try {
    const value = JSON.parse(raw) as Partial<StoredEvent>;
    if (
      typeof value.index !== 'number' ||
      (value.event !== 'status' && value.event !== 'complete' && value.event !== 'error')
    ) {
      return null;
    }
    return {
      index: value.index,
      event: value.event,
      data:
        typeof value.data === 'object' && value.data !== null
          ? (value.data as Record<string, unknown>)
          : {},
    };
  } catch {
    return null;
  }
}

function parseJson(value: string | undefined): unknown {
  if (value === undefined || value === '') {
    return null;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isTerminalEvent(event: ChatJobEventName): boolean {
  return event === 'complete' || event === 'error';
}

function toSnapshot(fields: Record<string, string>): AgentJobSnapshot | null {
  if (!fields.job_id || !fields.session_id) {
    return null;
  }
  const status = fields.status;
  const normalized: ChatJobStatus =
    status === 'running' || status === 'completed' || status === 'failed' ? status : 'queued';

  return {
    job_id: fields.job_id,
    session_id: fields.session_id,
    status: normalized,
    created_at: Number(fields.created_at ?? 0),
    updated_at: Number(fields.updated_at ?? 0),
    steps_count: Number(fields.steps_count ?? 0),
    result: parseJson(fields.result),
    error: fields.error ? fields.error : null,
  };
}

export class RedisChatJobManager implements ChatJobManager {
  private readonly backend: RedisJobBackend;
  private readonly runner: ChatJobRunner;
  private readonly queueName: string;
  private readonly ttlSeconds: number;
  private readonly perUserConcurrency: number;
  private readonly eventReplayLimit: number;
  private readonly retryDelayMs: number;
  private readonly now: () => number;

  constructor(options: RedisChatJobManagerOptions) {
    this.runner = options.runner;
    this.queueName = options.queueName ?? 'recruitai-agent-jobs';
    this.ttlSeconds = options.ttlSeconds ?? 3600;
    this.perUserConcurrency = options.perUserConcurrency ?? 2;
    this.eventReplayLimit = options.eventReplayLimit ?? 100;
    this.retryDelayMs = options.retryDelayMs ?? 500;
    this.now = options.now ?? (() => Date.now() / 1000);

    const factory = options.backendFactory ?? createBullMqBackend;
    this.backend = factory({
      redisUrl: options.redisUrl,
      queueName: this.queueName,
      concurrency: options.workerConcurrency ?? 10,
      processor: (job, token) => this.processJob(job, token),
    });
  }

  private jobKey(jobId: string): string {
    return `recruitai:chat:job:${jobId}`;
  }

  private eventsKey(jobId: string): string {
    return `${this.jobKey(jobId)}:events`;
  }

  private sequenceKey(jobId: string): string {
    return `${this.jobKey(jobId)}:seq`;
  }

  private channel(jobId: string): string {
    return `${this.jobKey(jobId)}:events`;
  }

  private slotsKey(userId: string): string {
    return `recruitai:chat:user:${userId}:active`;
  }

  private async writeFields(jobId: string, fields: Record<string, string>): Promise<void> {
    const key = this.jobKey(jobId);
    await this.backend.redis.hset(key, fields);
    await this.backend.redis.expire(key, this.ttlSeconds);
  }

  private async acquireSlot(userId: string): Promise<boolean> {
    const result = await this.backend.redis.eval(
      ACQUIRE_SLOT_SCRIPT,
      [this.slotsKey(userId)],
      [this.perUserConcurrency, this.ttlSeconds * 1000],
    );
    return Number(result) === 1;
  }

  private async releaseSlot(userId: string): Promise<void> {
    const key = this.slotsKey(userId);
    const remaining = await this.backend.redis.decr(key);
    if (remaining <= 0) {
      await this.backend.redis.del(key);
    }
  }

  /** Append an event for replay and fan it out to live subscribers. */
  private async emit(
    jobId: string,
    event: ChatJobEventName,
    data: Record<string, unknown>,
  ): Promise<void> {
    const eventsKey = this.eventsKey(jobId);
    const index = await this.backend.redis.incr(this.sequenceKey(jobId));
    await this.backend.redis.expire(this.sequenceKey(jobId), this.ttlSeconds);

    const frame = JSON.stringify({ index, event, data } satisfies StoredEvent);
    await this.backend.redis.rpush(eventsKey, frame);
    await this.backend.redis.ltrim(eventsKey, -this.eventReplayLimit, -1);
    await this.backend.redis.expire(eventsKey, this.ttlSeconds);
    await this.backend.redis.publish(this.channel(jobId), frame);
  }

  async createJob(userId: string, sessionId: string): Promise<AgentJobSnapshot> {
    const jobId = randomUUID();
    const now = this.now();
    const fields = {
      job_id: jobId,
      user_id: userId,
      session_id: sessionId,
      status: 'queued',
      created_at: String(now),
      updated_at: String(now),
      steps_count: '0',
      result: 'null',
      error: '',
    };
    await this.writeFields(jobId, fields);
    await this.backend.redis.expire(this.eventsKey(jobId), this.ttlSeconds);

    return {
      job_id: jobId,
      session_id: sessionId,
      status: 'queued',
      created_at: now,
      updated_at: now,
      steps_count: 0,
      result: null,
      error: null,
    };
  }

  async startJob(jobId: string, payload: ChatJobPayload): Promise<void> {
    const fields = await this.backend.redis.hgetall(this.jobKey(jobId));
    if (!fields.job_id) {
      return;
    }

    const data: QueuedJobData = { jobId, payload };
    await this.backend.queue.add('agent-turn', data, {
      jobId,
      attempts: 1,
      removeOnComplete: { age: this.ttlSeconds },
      removeOnFail: { age: this.ttlSeconds },
    });
  }

  async getJob(jobId: string, userId: string): Promise<AgentJobSnapshot | null> {
    const fields = await this.backend.redis.hgetall(this.jobKey(jobId));
    if (!fields.job_id || fields.user_id !== userId) {
      return null;
    }
    return toSnapshot(fields);
  }

  async *streamEvents(
    jobId: string,
    userId: string,
    signal?: AbortSignal,
  ): AsyncGenerator<string, void, void> {
    const job = await this.getJob(jobId, userId);
    if (!job) {
      throw new ChatJobNotFoundError();
    }

    yield formatSseEvent('init', { job_id: job.job_id, status: job.status });

    if (job.status === 'completed' || job.status === 'failed') {
      const terminal = terminalEvent(job);
      yield formatSseEvent(terminal.event, terminal.data);
      return;
    }

    const channel = this.channel(jobId);
    const eventsKey = this.eventsKey(jobId);
    const buffered: string[] = [];
    let wake: (() => void) | null = null;

    const listener = (_channel: string, message: string): void => {
      buffered.push(message);
      if (wake) {
        const resolve = wake;
        wake = null;
        resolve();
      }
    };

    this.backend.subscriber.on('message', listener);
    try {
      await this.backend.subscriber.subscribe(channel);
      let lastIndex = -1;

      const frames: StoredEvent[] = [];
      const collect = (raw: string): void => {
        const stored = parseStoredEvent(raw);
        if (stored && stored.index > lastIndex) {
          lastIndex = stored.index;
          frames.push(stored);
        }
      };

      while (true) {
        if (signal?.aborted) {
          return;
        }

        frames.length = 0;
        const replay = await this.backend.redis.lrange(eventsKey, 0, -1);
        for (const raw of replay) {
          collect(raw);
        }
        while (buffered.length > 0) {
          const raw = buffered.shift();
          if (raw !== undefined) {
            collect(raw);
          }
        }
        frames.sort((left, right) => left.index - right.index);

        for (const frame of frames) {
          yield formatSseEvent(frame.event, frame.data);
          if (isTerminalEvent(frame.event)) {
            return;
          }
        }

        // A job can expire from Redis between emissions; surface its stored
        // terminal state rather than hanging the connection.
        const current = await this.getJob(jobId, userId);
        if (current && (current.status === 'completed' || current.status === 'failed')) {
          const terminal = terminalEvent(current);
          yield formatSseEvent(terminal.event, terminal.data);
          return;
        }

        await new Promise<void>((resolve) => {
          if (signal?.aborted) {
            resolve();
            return;
          }
          const done = (): void => {
            signal?.removeEventListener('abort', done);
            resolve();
          };
          wake = done;
          signal?.addEventListener('abort', done, { once: true });
          if (buffered.length > 0) {
            wake = null;
            signal?.removeEventListener('abort', done);
            resolve();
          }
        });
      }
    } finally {
      this.backend.subscriber.off('message', listener);
      try {
        await this.backend.subscriber.unsubscribe(channel);
      } catch (error) {
        logger.warn(
          `[ChatJobManager] Failed to unsubscribe from ${channel}: ${errorMessage(error)}`,
        );
      }
    }
  }

  /**
   * BullMQ processor. When the per-user cap is hit the job is delayed and
   * retried instead of failing, providing backpressure without dropping work.
   */
  private async processJob(job: RedisJob, token?: string): Promise<void> {
    const data = job.data as Partial<QueuedJobData> | null;
    if (!data || typeof data.jobId !== 'string') {
      return;
    }
    const jobId = data.jobId;
    const fields = await this.backend.redis.hgetall(this.jobKey(jobId));
    if (!fields.job_id || fields.status === 'completed' || fields.status === 'failed') {
      return;
    }

    const userId = fields.user_id ?? '';
    const acquired = await this.acquireSlot(userId);
    if (!acquired) {
      if (!token) {
        throw new Error(`Job ${jobId} cannot be delayed without a worker token.`);
      }
      await job.moveToDelayed(Date.now() + this.retryDelayMs, token);
      throw new DelayedError();
    }

    try {
      await this.writeFields(jobId, {
        status: 'running',
        updated_at: String(this.now()),
      });
      await this.emit(jobId, 'status', { status: 'running', message: 'Agent thinking...' });

      try {
        const result = await this.runner(data.payload ?? {});
        await this.writeFields(jobId, {
          status: 'completed',
          updated_at: String(this.now()),
          result: JSON.stringify(result ?? null),
        });
        await this.emit(jobId, 'complete', (result ?? {}) as Record<string, unknown>);
      } catch (error) {
        const message = errorMessage(error);
        logger.error(`[ChatJobManager] Job ${jobId} failed: ${message}`);
        await this.writeFields(jobId, {
          status: 'failed',
          updated_at: String(this.now()),
          error: message,
        });
        await this.emit(jobId, 'error', { error: message });
      }
    } finally {
      await this.releaseSlot(userId);
    }
  }

  async close(): Promise<void> {
    const errors: unknown[] = [];
    for (const close of [
      () => this.backend.worker.close(),
      () => this.backend.queue.close(),
      () => this.backend.subscriber.quit(),
      () => this.backend.redis.quit(),
    ]) {
      try {
        await close();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      logger.warn(`[ChatJobManager] Failed to close Redis resources: ${errors.length} error(s)`);
    }
  }

  /**
   * Graceful shutdown. Pausing first stops the worker from taking new jobs;
   * active jobs finish before the worker closes. With `force`, BullMQ releases
   * active jobs so its stalled checker re-queues them on another instance.
   */
  async shutdown(options: { readonly force?: boolean } = {}): Promise<void> {
    try {
      await this.backend.worker.pause?.();
    } catch (error) {
      logger.warn(`[ChatJobManager] Failed to pause the BullMQ worker: ${errorMessage(error)}`);
    }
    try {
      await this.backend.worker.close(options.force === true);
    } catch (error) {
      logger.warn(`[ChatJobManager] Failed to close the BullMQ worker: ${errorMessage(error)}`);
    }
    const errors: unknown[] = [];
    for (const close of [
      () => this.backend.queue.close(),
      () => this.backend.subscriber.quit(),
      () => this.backend.redis.quit(),
    ]) {
      try {
        await close();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      logger.warn(`[ChatJobManager] Failed to close Redis resources: ${errors.length} error(s)`);
    }
  }
}

/** Factory used by `src/jobs/index.ts`. */
export function createRedisChatJobManager(
  options: RedisChatJobManagerOptions,
): RedisChatJobManager {
  return new RedisChatJobManager(options);
}
