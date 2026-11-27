import { createApp } from './app.js';
import { getConfig, type AppConfig } from './config/index.js';
import { loadEnvFileIfPresent } from './config/env.js';
import { evaluatePreflight } from './config/preflight.js';
import type { ChatJobManager } from './jobs/index.js';
import { createRetentionScheduler } from './jobs/retention-scheduler.js';
import { beginDrain } from './lifecycle.js';
import { closeSharedRedisStore } from './redis/client.js';
import { sseRegistry } from './routes/sse-registry.js';
import { startEventLoopMonitor } from './telemetry/event-loop.js';
import { createLogger, setDefaultLogLevel } from './telemetry/logger.js';
import { closeWorkerPool } from './workers/pool.js';

const logger = createLogger('recruitai.server');

/**
 * RecruitAI backend bootstrap.
 *
 * Phase 2: .env is loaded and all configuration is validated before the
 * server starts listening, so invalid production configuration fails fast
 * instead of surfacing on the first request.
 *
 * Phase 19: production startup additionally runs the same preflight checks as
 * `npm run preflight` (JWT material, direct PostgreSQL URL, no loopback CORS,
 * no placeholder secrets, partial integration config) and refuses to listen on
 * any failure. Warnings are logged but do not block.
 *
 * Phase 21: graceful shutdown drains HTTP/SSE, pauses BullMQ, releases worker
 * threads and closes Redis before exit.
 */
function loadConfigOrExit(): AppConfig {
  try {
    loadEnvFileIfPresent();
    return getConfig();
  } catch (error) {
    logger.error('[recruitai] invalid configuration', {
      error_type: error instanceof Error ? error.constructor.name : typeof error,
    });
    process.exit(1);
  }
}

const config = loadConfigOrExit();
setDefaultLogLevel(config.logging.level);

if (config.isProduction) {
  const report = evaluatePreflight(config, process.env);
  for (const check of report.checks) {
    if (check.status === 'warn') {
      logger.warn(`[recruitai] preflight warning ${check.id}: ${check.detail}`);
    }
  }
  if (!report.ok) {
    for (const check of report.checks) {
      if (check.status === 'fail') {
        logger.error(`[recruitai] preflight failure ${check.id}: ${check.detail}`);
      }
    }
    logger.error('[recruitai] production preflight failed; refusing to start');
    process.exit(1);
  }
}

const app = createApp({ config });
const jobManager = app.locals.chatJobManager as ChatJobManager | undefined;
const { host, port } = config.server;

// Phase 16: opt-in operational retention sweeps. `start()` is a no-op unless
// RETENTION_JOB_ENABLED=true; the timer is unref'd and tenant-scoped per sweep.
const retentionScheduler = createRetentionScheduler({ config });
retentionScheduler.start();

// Phase 21: surface event-loop blocking caused by accidental inline CPU work.
const eventLoopMonitor = startEventLoopMonitor({
  warnMs: config.telemetry.eventLoopLagWarnMs,
});

const server = app.listen(port, host, () => {
  logger.info(`[recruitai] backend listening on http://${host}:${port} (${config.environment})`);
});

server.on('close', () => {
  retentionScheduler.stop();
});

server.on('error', (error: Error) => {
  logger.error(`[recruitai] failed to start server: ${error.message}`, {
    error_type: error.constructor.name,
  });
  process.exitCode = 1;
});

/** Drain window before forcing sockets closed; tune per orchestrator. */
const SHUTDOWN_DRAIN_MS = Number(process.env['SHUTDOWN_DRAIN_MS'] ?? 10_000);
const SHUTDOWN_SSE_GRACE_MS = Number(process.env['SHUTDOWN_SSE_GRACE_MS'] ?? 2_000);

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  beginDrain();
  logger.info(`[recruitai] ${signal} received; draining before exit.`);

  retentionScheduler.stop();
  eventLoopMonitor.stop();

  // Readiness now returns 503; stop accepting new connections and let idle
  // keep-alive sockets go immediately.
  const closed = new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  server.closeIdleConnections();

  // SSE streams are long-lived by design. Give them a short grace period, then
  // abort the generators so `server.close()` can complete.
  const sseTimer = setTimeout(() => sseRegistry.drain(), SHUTDOWN_SSE_GRACE_MS);
  sseTimer.unref?.();

  const forceTimer = setTimeout(() => {
    logger.warn('[recruitai] drain timeout reached; forcing remaining sockets closed.');
    sseRegistry.drain();
    server.closeAllConnections();
  }, SHUTDOWN_DRAIN_MS);
  forceTimer.unref?.();

  await closed;
  clearTimeout(sseTimer);
  clearTimeout(forceTimer);

  // BullMQ persists unfinished jobs in Redis; pausing first prevents this
  // instance from claiming new work while active jobs finish. `force` lets
  // another replica's stalled check re-queue anything still running.
  if (jobManager?.shutdown) {
    try {
      await jobManager.shutdown({ force: true });
    } catch (error) {
      logger.warn(`[recruitai] job manager shutdown failed: ${errorMessage(error)}`);
    }
  }

  await closeWorkerPool();
  await closeSharedRedisStore();

  logger.info('[recruitai] shutdown complete.');
  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
