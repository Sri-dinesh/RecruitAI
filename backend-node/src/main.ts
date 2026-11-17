import { createApp } from './app.js';
import { getConfig, type AppConfig } from './config/index.js';
import { loadEnvFileIfPresent } from './config/env.js';
import { evaluatePreflight } from './config/preflight.js';
import { createRetentionScheduler } from './jobs/retention-scheduler.js';
import { createLogger, setDefaultLogLevel } from './telemetry/logger.js';

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
 * TODO(Phase 21): graceful shutdown — stop accepting traffic, drain HTTP/SSE,
 *                 re-enqueue unfinished BullMQ jobs, then exit on SIGTERM.
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
const { host, port } = config.server;

// Phase 16: opt-in operational retention sweeps. `start()` is a no-op unless
// RETENTION_JOB_ENABLED=true; the timer is unref'd and tenant-scoped per sweep.
const retentionScheduler = createRetentionScheduler({ config });
retentionScheduler.start();

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
