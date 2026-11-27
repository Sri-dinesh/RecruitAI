/**
 * Process-wide lifecycle flag (Phase 21).
 *
 * `SIGTERM` switches the process into draining mode: readiness reports
 * unhealthy so a load balancer stops sending new traffic, while in-flight HTTP
 * requests, BullMQ jobs and SSE streams are allowed to finish.
 */

let draining = false;

export function isDraining(): boolean {
  return draining;
}

export function beginDrain(): void {
  draining = true;
}

/** Test helper: return the process to a serving state. */
export function resetDrainForTests(): void {
  draining = false;
}
