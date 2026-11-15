import { randomUUID } from 'node:crypto';

import { createLogger } from '../telemetry/logger.js';
import {
  ChatJobNotFoundError,
  errorMessage,
  formatSseEvent,
  type AgentJobSnapshot,
  type ChatJobEvent,
  type ChatJobManager,
  type ChatJobPayload,
  type ChatJobRunner,
  type ChatJobStatus,
} from './chat-job-manager.js';

const logger = createLogger('recruitai.chat_job_manager');

/**
 * In-memory chat job manager — a direct port of `ChatJobManager` in
 * `backend/app/services/job_queue.py`.
 *
 * Behavior preserved:
 * - job ids are UUIDv4 strings and every lookup is tenant-scoped;
 * - lifecycle is queued -> running -> completed | failed;
 * - the worker emits `status`, then `complete` (result) or `error` (message);
 * - `/stream` always starts with `init`, replays completed/failed jobs
 *   immediately, and finishes after the terminal event;
 * - stale jobs are swept on the next `createJob` using the 1-hour TTL.
 *
 * One deliberate improvement over Python: live events are buffered per job and
 * replayed to every new subscriber, so reconnecting clients do not miss the
 * `running` frame. Python's per-job queue is consumed by the first stream.
 */

interface InternalJob {
  job_id: string;
  user_id: string;
  session_id: string;
  status: ChatJobStatus;
  created_at: number;
  updated_at: number;
  steps_count: number;
  result: unknown;
  error: string | null;
  events: ChatJobEvent[];
  waiters: Array<() => void>;
  terminal: boolean;
}

export interface InMemoryChatJobManagerOptions {
  readonly runner: ChatJobRunner;
  /** Python's default is 3600 seconds. */
  readonly ttlSeconds?: number;
  /** Injectable epoch-seconds clock for deterministic tests. */
  readonly now?: () => number;
  /** Scheduler injection so tests can await the background turn. */
  readonly schedule?: (task: () => void) => void;
}

function snapshot(job: InternalJob): AgentJobSnapshot {
  return {
    job_id: job.job_id,
    session_id: job.session_id,
    status: job.status,
    created_at: job.created_at,
    updated_at: job.updated_at,
    steps_count: job.steps_count,
    result: job.result,
    error: job.error,
  };
}

export class InMemoryChatJobManager implements ChatJobManager {
  private readonly jobs = new Map<string, InternalJob>();
  private readonly runner: ChatJobRunner;
  private readonly ttlSeconds: number;
  private readonly now: () => number;
  private readonly schedule: (task: () => void) => void;
  private closed = false;

  constructor(options: InMemoryChatJobManagerOptions) {
    this.runner = options.runner;
    this.ttlSeconds = options.ttlSeconds ?? 3600;
    this.now = options.now ?? (() => Date.now() / 1000);
    this.schedule = options.schedule ?? ((task) => setTimeout(task, 0));
  }

  /** Remove jobs whose most recent update is older than the TTL. */
  cleanupStaleJobs(): void {
    const now = this.now();
    for (const [jobId, job] of this.jobs) {
      if (now - job.updated_at > this.ttlSeconds) {
        this.jobs.delete(jobId);
      }
    }
  }

  async createJob(userId: string, sessionId: string): Promise<AgentJobSnapshot> {
    this.cleanupStaleJobs();
    const now = this.now();
    const job: InternalJob = {
      job_id: randomUUID(),
      user_id: userId,
      session_id: sessionId,
      status: 'queued',
      created_at: now,
      updated_at: now,
      steps_count: 0,
      result: null,
      error: null,
      events: [],
      waiters: [],
      terminal: false,
    };
    this.jobs.set(job.job_id, job);
    return snapshot(job);
  }

  async startJob(jobId: string, payload: ChatJobPayload): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }
    // Match Python's `loop.create_task`: the request returns while the turn
    // runs in the background. setTimeout keeps the response first.
    this.schedule(() => {
      void this.runJob(jobId, payload);
    });
  }

  async getJob(jobId: string, userId: string): Promise<AgentJobSnapshot | null> {
    const job = this.jobs.get(jobId);
    if (!job || job.user_id !== userId) {
      return null;
    }
    return snapshot(job);
  }

  async *streamEvents(
    jobId: string,
    userId: string,
    signal?: AbortSignal,
  ): AsyncGenerator<string, void, void> {
    const job = this.jobs.get(jobId);
    if (!job || job.user_id !== userId) {
      throw new ChatJobNotFoundError();
    }

    yield formatSseEvent('init', { job_id: job.job_id, status: job.status });

    // Finished jobs replay their terminal frame immediately (Python behavior).
    if (job.status === 'completed' || job.status === 'failed') {
      yield formatSseEvent(
        job.status === 'completed' ? 'complete' : 'error',
        job.status === 'completed' ? (job.result ?? {}) : { error: job.error },
      );
      return;
    }

    let index = 0;
    while (true) {
      if (signal?.aborted || this.closed) {
        return;
      }

      while (index < job.events.length) {
        const item = job.events[index];
        index += 1;
        if (!item) {
          continue;
        }
        yield formatSseEvent(item.event, item.data);
        if (item.event === 'complete' || item.event === 'error') {
          return;
        }
      }

      if (job.terminal) {
        // Defensive: terminal without a buffered frame.
        const status: string = job.status;
        if (status === 'completed') {
          yield formatSseEvent('complete', job.result ?? {});
        } else {
          yield formatSseEvent('error', { error: job.error });
        }
        return;
      }

      await this.waitForEvent(job, signal);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const job of this.jobs.values()) {
      this.notify(job);
    }
    this.jobs.clear();
  }

  /** Resolve when a new event is appended, the job terminates or the client leaves. */
  private waitForEvent(job: InternalJob, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal?.aborted) {
        resolve();
        return;
      }

      const done = (): void => {
        signal?.removeEventListener('abort', done);
        resolve();
      };
      job.waiters.push(done);
      signal?.addEventListener('abort', done, { once: true });
    });
  }

  private notify(job: InternalJob): void {
    const waiters = job.waiters;
    job.waiters = [];
    for (const waiter of waiters) {
      waiter();
    }
  }

  private emit(job: InternalJob, event: ChatJobEvent): void {
    job.events.push(event);
    this.notify(job);
  }

  private async runJob(jobId: string, payload: ChatJobPayload): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }

    job.status = 'running';
    job.updated_at = this.now();
    this.emit(job, {
      event: 'status',
      data: { status: 'running', message: 'Agent thinking...' },
    });

    try {
      const result = await this.runner(payload);
      job.status = 'completed';
      job.result = result;
      job.updated_at = this.now();
      this.emit(job, {
        event: 'complete',
        data: (result ?? {}) as Record<string, unknown>,
      });
    } catch (error) {
      const message = errorMessage(error);
      logger.error(`[ChatJobManager] Job ${job.job_id} failed: ${message}`);
      job.status = 'failed';
      job.error = message;
      job.updated_at = this.now();
      this.emit(job, { event: 'error', data: { error: message } });
    } finally {
      job.terminal = true;
      this.notify(job);
    }
  }
}
