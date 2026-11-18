import { monitorEventLoopDelay } from 'node:perf_hooks';

import { createLogger, type Logger } from './logger.js';

/**
 * Event-loop delay diagnostics (Phase 21).
 *
 * CPU-heavy work must not run on the request thread. This monitor samples the
 * event loop and logs when the p99 delay crosses the configured threshold, so a
 * regression in worker offloading is visible without an external APM agent.
 */

const logger = createLogger('recruitai.event_loop');

export interface EventLoopMonitorOptions {
  readonly warnMs: number;
  /** Sampling/report interval; defaults to 10 s. */
  readonly intervalMs?: number;
  readonly logger?: Logger;
}

export interface EventLoopMonitor {
  stop(): void;
}

export function startEventLoopMonitor(options: EventLoopMonitorOptions): EventLoopMonitor {
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  const activeLogger = options.logger ?? logger;
  const intervalMs = options.intervalMs ?? 10_000;

  const timer = setInterval(() => {
    const p99Ms = histogram.percentile(99) / 1e6;
    const maxMs = histogram.max / 1e6;
    if (p99Ms > options.warnMs) {
      activeLogger.warn(
        `[event_loop] p99 delay ${p99Ms.toFixed(1)}ms exceeds ${options.warnMs}ms ` +
          `(max ${maxMs.toFixed(1)}ms); check worker offloading.`,
        { latency_ms: Math.round(p99Ms), status: 'degraded' },
      );
    }
    histogram.reset();
  }, intervalMs);
  timer.unref?.();

  return {
    stop: () => {
      clearInterval(timer);
      histogram.disable();
    },
  };
}
