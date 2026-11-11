import { createApp } from './app.js';
import { getConfig, type AppConfig } from './config/index.js';
import { loadEnvFileIfPresent } from './config/env.js';

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
    console.error(
      '[recruitai] invalid configuration:',
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

const config = loadConfigOrExit();
const app = createApp({ config });
const { host, port } = config.server;

const server = app.listen(port, host, () => {
  console.log(`[recruitai] backend listening on http://${host}:${port} (${config.environment})`);
});

server.on('error', (error: Error) => {
  console.error('[recruitai] failed to start server:', error);
  process.exitCode = 1;
});
