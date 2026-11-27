import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';

import { createLogger } from '../telemetry/logger.js';

/**
 * Bounded `worker_threads` pool (Phase 21).
 *
 * PDF/DOCX extraction, deterministic resume parsing and PDF report generation
 * are CPU-heavy. Running them on the request thread blocks every other request
 * on that instance, so production offloads them to a fixed-size pool and
 * rejects work once the bounded queue is full.
 *
 * Workers resolve their own module path for both runtimes: `tsx` in development
 * and compiled `.js` in production.
 */

const logger = createLogger('recruitai.worker_pool');

export type WorkerTask = 'parseDocument' | 'parseStructuredResume' | 'renderReport';

export interface WorkerTaskRequest {
  readonly id: number;
  readonly task: WorkerTask;
  readonly payload: unknown;
}

export type WorkerTaskResponse =
  | { readonly id: number; readonly ok: true; readonly result: unknown }
  | {
      readonly id: number;
      readonly ok: false;
      readonly error: { readonly message: string; readonly name: string };
    };

export class WorkerPoolOverloadedError extends Error {
  readonly code = 'WORKER_POOL_OVERLOADED';

  constructor(maxQueue: number) {
    super(`Worker queue is full (${maxQueue} tasks); retry shortly.`);
    this.name = 'WorkerPoolOverloadedError';
  }
}

interface PendingTask {
  readonly request: WorkerTaskRequest;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
}

export interface WorkerPoolOptions {
  readonly size?: number;
  readonly maxQueue?: number;
  /** Worker entry point override (tests). */
  readonly workerUrl?: URL;
  /** Extra exec arguments for the worker runtime. */
  readonly execArgv?: readonly string[];
}

export class WorkerPool {
  private readonly size: number;
  private readonly maxQueue: number;
  private readonly workerUrl: URL;
  private readonly execArgv: string[] | undefined;
  private readonly workers = new Set<Worker>();
  private readonly idle: Worker[] = [];
  private readonly pending = new Map<number, PendingTask>();
  private readonly queue: PendingTask[] = [];
  private readonly busy = new Set<Worker>();
  private readonly assignments = new Map<Worker, PendingTask>();
  private readonly failed = new WeakSet<Worker>();
  private nextId = 1;
  private closed = false;

  constructor(options: WorkerPoolOptions = {}) {
    this.size = Math.max(1, options.size ?? Math.max(1, availableParallelism() - 1));
    this.maxQueue = Math.max(1, options.maxQueue ?? 100);
    this.workerUrl = options.workerUrl ?? defaultWorkerUrl();
    this.execArgv =
      options.execArgv === undefined ? workerExecArgv(this.workerUrl) : [...options.execArgv];
  }

  get queueLength(): number {
    return this.queue.length;
  }

  get activeWorkers(): number {
    return this.busy.size;
  }

  /** Run one task, rejecting when the bounded queue is full. */
  run<T>(task: WorkerTask, payload: unknown): Promise<T> {
    if (this.closed) {
      return Promise.reject(new Error('Worker pool is closed.'));
    }
    if (this.queue.length >= this.maxQueue) {
      return Promise.reject(new WorkerPoolOverloadedError(this.maxQueue));
    }

    return new Promise<T>((resolve, reject) => {
      const request: WorkerTaskRequest = { id: this.nextId, task, payload };
      this.nextId += 1;
      const item: PendingTask = {
        request,
        resolve: resolve as (value: unknown) => void,
        reject,
      };
      this.pending.set(request.id, item);
      this.queue.push(item);
      this.dispatch();
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    const error = new Error('Worker pool closed before the task completed.');
    for (const item of this.pending.values()) {
      item.reject(error);
    }
    this.pending.clear();
    this.queue.length = 0;
    await Promise.all([...this.workers].map((worker) => worker.terminate()));
    this.workers.clear();
    this.idle.length = 0;
    this.busy.clear();
  }

  private dispatch(): void {
    while (this.queue.length > 0) {
      const worker = this.acquireWorker();
      if (!worker) {
        return;
      }
      const item = this.queue.shift();
      if (!item) {
        return;
      }
      this.busy.add(worker);
      this.assignments.set(worker, item);
      worker.postMessage(item.request);
    }
  }

  private acquireWorker(): Worker | undefined {
    if (this.idle.length > 0) {
      return this.idle.pop();
    }
    if (this.workers.size >= this.size) {
      return undefined;
    }
    const worker = new Worker(this.workerUrl, {
      ...(this.execArgv === undefined ? {} : { execArgv: this.execArgv }),
    });
    this.workers.add(worker);
    worker.on('message', (message: WorkerTaskResponse) => this.onMessage(worker, message));
    worker.on('error', (error: unknown) =>
      this.onWorkerFailure(worker, error instanceof Error ? error : new Error(String(error))),
    );
    worker.on('exit', (code) => {
      if (!this.closed && code !== 0) {
        this.onWorkerFailure(worker, new Error(`Worker exited with code ${code}.`));
      }
    });
    return worker;
  }

  private onMessage(worker: Worker, message: WorkerTaskResponse): void {
    const item = this.pending.get(message.id);
    this.busy.delete(worker);
    this.assignments.delete(worker);
    this.idle.push(worker);
    if (item) {
      this.pending.delete(message.id);
      if (message.ok) {
        item.resolve(message.result);
      } else {
        const error = new Error(message.error.message);
        error.name = message.error.name;
        item.reject(error);
      }
    }
    this.dispatch();
  }

  private onWorkerFailure(worker: Worker, error: Error): void {
    if (this.failed.has(worker)) {
      return;
    }
    this.failed.add(worker);
    logger.error(`[worker_pool] worker failed: ${error.message}`);
    this.workers.delete(worker);
    this.busy.delete(worker);
    void worker.terminate();
    const index = this.idle.indexOf(worker);
    if (index >= 0) {
      this.idle.splice(index, 1);
    }
    // Any task assigned to this worker cannot complete; reject it so the
    // request fails fast instead of waiting for a replacement worker.
    const assigned = this.assignments.get(worker);
    this.assignments.delete(worker);
    if (assigned) {
      this.pending.delete(assigned.request.id);
      assigned.reject(error);
    }
    this.dispatch();
  }
}

function defaultWorkerUrl(): URL {
  // `import.meta.url` is the .ts file under tsx and the .js file under tsc.
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
  return new URL(`./task-worker.${extension}`, import.meta.url);
}

/**
 * Carry only module-loader arguments into the worker. Node's test runner adds
 * V8/resource flags that are invalid for `Worker`, so inheriting `execArgv`
 * verbatim makes worker startup fail under `node --test`.
 */
function workerExecArgv(workerUrl: URL): string[] {
  const kept: string[] = [];
  const args = process.execArgv;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (
      argument === '--import' ||
      argument === '--loader' ||
      argument === '--experimental-loader'
    ) {
      const value = args[index + 1];
      if (value !== undefined) {
        kept.push(argument, value);
        index += 1;
      }
      continue;
    }
    if (
      argument?.startsWith('--import=') ||
      argument?.startsWith('--loader=') ||
      argument?.startsWith('--experimental-loader=')
    ) {
      kept.push(argument);
    }
  }
  if (workerUrl.pathname.endsWith('.ts') && !kept.some((arg) => arg.includes('tsx'))) {
    kept.push('--import', 'tsx');
  }
  return kept;
}

let sharedPool: { readonly key: string; readonly pool: WorkerPool } | undefined;

/** Lazily create the process-wide pool when worker offloading is enabled. */
export function getWorkerPool(options: {
  readonly enabled: boolean;
  readonly size: number;
  readonly maxQueue: number;
}): WorkerPool | null {
  if (!options.enabled) {
    return null;
  }
  const key = `${options.size}:${options.maxQueue}`;
  if (sharedPool?.key === key) {
    return sharedPool.pool;
  }
  sharedPool = {
    key,
    pool: new WorkerPool({ size: options.size, maxQueue: options.maxQueue }),
  };
  logger.info(
    `[worker_pool] started ${options.size} worker thread(s), max queue ${options.maxQueue}.`,
  );
  return sharedPool.pool;
}

export async function closeWorkerPool(): Promise<void> {
  if (sharedPool) {
    const pool = sharedPool.pool;
    sharedPool = undefined;
    await pool.close();
  }
}

/** Test helper: drop the memoised pool. */
export async function resetWorkerPoolForTests(): Promise<void> {
  await closeWorkerPool();
}
