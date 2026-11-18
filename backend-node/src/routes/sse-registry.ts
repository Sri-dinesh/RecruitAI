/**
 * Per-instance SSE admission control (Phase 21).
 *
 * Long-lived chat streams are the most expensive connection type in the
 * backend. This registry enforces a configurable per-instance cap and lets the
 * shutdown path abort every active stream after the HTTP drain timeout.
 */

export interface SseLease {
  /** Aborts the stream generator; safe to call more than once. */
  readonly controller: AbortController;
  release(): void;
}

export class SseRegistry {
  private readonly active = new Set<AbortController>();

  get size(): number {
    return this.active.size;
  }

  /** Claim a slot, or `null` when the instance is at capacity. */
  acquire(maxConnections: number): SseLease | null {
    if (this.active.size >= maxConnections) {
      return null;
    }
    const controller = new AbortController();
    this.active.add(controller);
    let released = false;
    return {
      controller,
      release: () => {
        if (released) {
          return;
        }
        released = true;
        this.active.delete(controller);
      },
    };
  }

  /** Abort all active streams (graceful shutdown). */
  drain(): void {
    for (const controller of [...this.active]) {
      controller.abort();
    }
    this.active.clear();
  }
}

/** One registry per process; caps are deliberately per instance. */
export const sseRegistry = new SseRegistry();
