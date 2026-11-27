import type { AppConfig } from '../config/index.js';
import { createLogger } from '../telemetry/logger.js';
import { InMemoryChatJobManager } from './in-memory-job-manager.js';
import { RedisChatJobManager, type RedisJobBackendFactory } from './redis-job-manager.js';
import type { ChatJobManager, ChatJobRunner } from './chat-job-manager.js';

const logger = createLogger('recruitai.chat_job_manager');

export interface CreateChatJobManagerOptions {
  readonly config: AppConfig;
  /** Bound `CampaignService.executeAgentTurn` (or a test double). */
  readonly runner: ChatJobRunner;
  /** Tests inject a fake Redis backend; production uses BullMQ. */
  readonly backendFactory?: RedisJobBackendFactory;
}

/**
 * Select the job manager for the configured environment.
 *
 * `REDIS_URL` set -> durable BullMQ/Redis queue (fleet-wide jobs, SSE fan-out).
 * Unset -> process-local in-memory manager, byte-compatible with Python.
 */
export function createChatJobManager(options: CreateChatJobManagerOptions): ChatJobManager {
  const jobs = options.config.jobs;
  if (jobs.redisUrl) {
    logger.info('[ChatJobManager] Using the Redis/BullMQ job manager.');
    return new RedisChatJobManager({
      redisUrl: jobs.redisUrl,
      runner: options.runner,
      queueName: jobs.queueName,
      ttlSeconds: jobs.ttlSeconds,
      perUserConcurrency: jobs.perUserConcurrency,
      workerConcurrency: jobs.workerConcurrency,
      eventReplayLimit: jobs.eventReplayLimit,
      ...(options.backendFactory === undefined ? {} : { backendFactory: options.backendFactory }),
    });
  }

  logger.info('[ChatJobManager] REDIS_URL is unset; using the in-memory job manager.');
  return new InMemoryChatJobManager({
    runner: options.runner,
    ttlSeconds: jobs.ttlSeconds,
  });
}

export * from './chat-job-manager.js';
export * from './in-memory-job-manager.js';
export * from './redis-job-manager.js';
