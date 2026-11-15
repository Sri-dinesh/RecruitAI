/**
 * Shared types for asynchronous chat agent jobs.
 *
 * Port of the state machine in `backend/app/services/job_queue.py`:
 * queued -> running -> completed | failed. The HTTP response and SSE event
 * names/payloads are part of the public contract and must stay stable.
 */

export type ChatJobStatus = 'queued' | 'running' | 'completed' | 'failed';

/** One row returned by `GET /api/chat/jobs/:job_id`. */
export interface AgentJobSnapshot {
  readonly job_id: string;
  readonly session_id: string;
  readonly status: ChatJobStatus;
  readonly created_at: number;
  readonly updated_at: number;
  readonly steps_count: number;
  readonly result: unknown;
  readonly error: string | null;
}

export type ChatJobEventName = 'status' | 'complete' | 'error';

export interface ChatJobEvent {
  readonly event: ChatJobEventName;
  readonly data: Record<string, unknown>;
}

/** Serialized payload handed to the worker (JSON-safe). */
export type ChatJobPayload = Record<string, unknown>;

/** Executes one agent turn; errors become a failed job + `error` event. */
export type ChatJobRunner = (payload: ChatJobPayload) => Promise<unknown>;

/**
 * Manager contract implemented by the in-memory (Python-equivalent) and
 * BullMQ/Redis-backed managers.
 */
export interface ChatJobManager {
  createJob(userId: string, sessionId: string): Promise<AgentJobSnapshot>;
  /** Queue the turn for execution. Resolves once it is durably enqueued. */
  startJob(jobId: string, payload: ChatJobPayload): Promise<void>;
  /** Tenant-scoped lookup: another user's job id behaves like a missing job. */
  getJob(jobId: string, userId: string): Promise<AgentJobSnapshot | null>;
  /** SSE frames: `event: <name>\ndata: <json>\n\n`. */
  streamEvents(
    jobId: string,
    userId: string,
    signal?: AbortSignal,
  ): AsyncGenerator<string, void, void>;
  close(): Promise<void>;
}

/** Raised when a job id is missing or belongs to another tenant. */
export class ChatJobNotFoundError extends Error {
  constructor() {
    super('Agent job not found.');
    this.name = 'ChatJobNotFoundError';
  }
}

/** Serialize an SSE frame exactly like Starlette's streaming generator. */
export function formatSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** `AgentJob.to_dict()` field order and names. */
export function jobToDict(job: AgentJobSnapshot): Record<string, unknown> {
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

/** Epoch seconds, matching Python's `time.time()`. */
export function epochSeconds(now: () => number = () => Date.now() / 1000): number {
  return now();
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Build the terminal SSE frame for a finished job. */
export function terminalEvent(job: AgentJobSnapshot): ChatJobEvent {
  if (job.status === 'completed') {
    return { event: 'complete', data: (job.result ?? {}) as Record<string, unknown> };
  }
  return { event: 'error', data: { error: job.error } };
}
