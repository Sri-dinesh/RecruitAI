import { createApp } from './app.js';
import { getConfig, type AppConfig } from './config/index.js';
import { loadEnvFileIfPresent } from './config/env.js';
import { createLogger } from './telemetry/logger.js';

const logger = createLogger('recruitai.server');

/**
 * RecruitAI backend bootstrap.
 *
 * Phase 2: .env is loaded and all configuration is validated before the
 * server starts listening, so invalid production configuration fails fast
 * instead of surfacing on the first request.
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
const app = createApp({ config });
const { host, port } = config.server;

const server = app.listen(port, host, () => {
  logger.info(`[recruitai] backend listening on http://${host}:${port} (${config.environment})`);
});

server.on('error', (error: Error) => {
  logger.error(`[recruitai] failed to start server: ${error.message}`, {
    error_type: error.constructor.name,
  });
  process.exitCode = 1;
});
