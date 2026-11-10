import { createApp } from './app.js';

/**
 * RecruitAI backend bootstrap.
 *
 * Phase 1 scope: start the Express server so the scaffold can be verified.
 * TODO(Phase 2): replace direct env reads with the validated config module.
 * TODO(Phase 21): graceful shutdown — stop accepting traffic, drain HTTP/SSE,
 *                 re-enqueue unfinished BullMQ jobs, then exit on SIGTERM.
 */
const port = Number(process.env.PORT ?? 8000);
const host = process.env.HOST ?? '0.0.0.0';

const app = createApp();

const server = app.listen(port, host, () => {
  console.log(`[recruitai] backend listening on http://${host}:${port}`);
});

server.on('error', (error: Error) => {
  console.error('[recruitai] failed to start server:', error);
  process.exitCode = 1;
});
