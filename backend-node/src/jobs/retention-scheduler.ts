import type { AppConfig } from '../config/index.js';
import {
  createWorkspaceQueryStore,
  type WorkspaceQueryStore,
} from '../db/workspace-query-store.js';
import {
  createPrivacyService,
  type PrivacyService,
  type RetentionSummary,
} from '../services/privacy-service.js';
import { createLogger, type Logger } from '../telemetry/logger.js';

const defaultLogger = createLogger('recruitai.retention_scheduler');

/**
 * Phase 16 operational retention sweeps.
 *
 * Python exposes retention only as an authenticated request
 * (`POST /api/privacy/retention/run`) and never schedules it. The Node backend
 * keeps that route (request-scoped to the caller) and adds an opt-in
 * Express-side scheduler for the operational path:
 *
 * - Disabled unless `RETENTION_JOB_ENABLED=true`, so a deploy never begins
 *   destructive work without an explicit decision.
 * - Sweeps one tenant at a time through the tenant-scoped store, so a bug or a
 *   bad cutoff cannot silently delete another tenant's rows. There is no
 *   cross-tenant `WHERE created_at < cutoff` path.
 * - Defers the first run by one interval (no boot-time burst) and keeps a
 *   single run in flight; overlapping ticks are skipped, not queued.
 * - Logs a structured summary with counts and duration for observability.
 *
 * A manual run is available through `npm run retention:run`, which also
 * supports `--dry-run` and `--user-id`.
 */

export interface RetentionSchedulerOptions {
  readonly config: AppConfig;
  /** Explicit service/store for tests or a shared app-wide instance. */
  readonly privacyService?: PrivacyService;
  readonly queryStore?: WorkspaceQueryStore;
  readonly logger?: Logger;
  /** Overrides `config.retention.intervalSeconds` (tests). */
  readonly intervalSeconds?: number;
}

export interface RetentionRunOptions {
  /** Restrict the sweep to one tenant; omitted means every tenant. */
  readonly userId?: string;
  /** Count rows without mutating anything. */
  readonly dryRun?: boolean;
}

export interface RetentionRunResult {
  readonly status: 'completed' | 'skipped';
  readonly dry_run: boolean;
  readonly tenant_scoped: boolean;
  readonly tenants_processed: number;
  readonly tenants_failed: number;
  readonly summary: RetentionSummary;
  readonly duration_ms: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorType(error: unknown): string {
  return error instanceof Error ? error.constructor.name : typeof error;
}

export class RetentionScheduler {
  private readonly config: AppConfig;
  private readonly logger: Logger;
  private readonly service: PrivacyService;
  private readonly queryStore: WorkspaceQueryStore | undefined;
  readonly intervalSeconds: number;

  private timer: NodeJS.Timeout | undefined;
  private store: WorkspaceQueryStore | undefined;
  private inFlight = false;

  constructor(options: RetentionSchedulerOptions) {
    this.config = options.config;
    this.logger = options.logger ?? defaultLogger;
    this.intervalSeconds = options.intervalSeconds ?? options.config.retention.intervalSeconds;
    this.queryStore = options.queryStore;
    this.service =
      options.privacyService ??
      createPrivacyService({
        config: options.config,
        ...(options.queryStore === undefined ? {} : { queryStore: options.queryStore }),
      });
  }

  /** Whether a timer is currently installed. */
  get scheduled(): boolean {
    return this.timer !== undefined;
  }

  /** Whether a sweep is currently executing. */
  get running(): boolean {
    return this.inFlight;
  }

  /**
   * Install the recurring timer. Returns `true` only when this call started
   * the scheduler; disabled or already-scheduled instances return `false`.
   */
  start(): boolean {
    if (!this.config.retention.enabled) {
      this.logger.info(
        '[retention] scheduler disabled; set RETENTION_JOB_ENABLED=true to enable it.',
      );
      return false;
    }
    if (this.timer !== undefined) {
      return false;
    }

    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.intervalSeconds * 1000);
    // Never keep the process alive just for a retention sweep.
    this.timer.unref?.();

    this.logger.info(
      `[retention] scheduler started; sweeping every ${this.intervalSeconds}s ` +
        `(raw resume TTL ${this.config.retention.rawResumeTtlDays}d, ` +
        `chat TTL ${this.config.retention.chatTtlDays}d).`,
    );
    return true;
  }

  /** Stop the recurring timer. Returns `true` when a timer was removed. */
  stop(): boolean {
    if (this.timer === undefined) {
      return false;
    }
    clearInterval(this.timer);
    this.timer = undefined;
    this.logger.info('[retention] scheduler stopped.');
    return true;
  }

  /**
   * Run one sweep now. With no `userId`, enumerate tenants first and run the
   * same tenant-scoped retention logic for each id, so tenant isolation is
   * preserved even for the operational path. Never throws for per-tenant
   * failures; they are counted and logged.
   */
  async runOnce(options: RetentionRunOptions = {}): Promise<RetentionRunResult> {
    const dryRun = options.dryRun === true;
    if (this.inFlight) {
      this.logger.warn('[retention] previous sweep is still running; skipping this tick.');
      return {
        status: 'skipped',
        dry_run: dryRun,
        tenant_scoped: options.userId !== undefined,
        tenants_processed: 0,
        tenants_failed: 0,
        summary: { raw_resumes_cleared: 0, chat_messages_purged: 0 },
        duration_ms: 0,
      };
    }

    const startedAt = Date.now();
    this.inFlight = true;
    const summary: RetentionSummary = { raw_resumes_cleared: 0, chat_messages_purged: 0 };
    let processed = 0;
    let failed = 0;

    try {
      const tenantIds =
        options.userId === undefined ? await this.getStore().listUserIds() : [options.userId];

      for (const tenantId of tenantIds) {
        try {
          const result = dryRun
            ? await this.service.previewRetentionPolicy(
                tenantId,
                this.config.retention.rawResumeTtlDays,
                this.config.retention.chatTtlDays,
              )
            : await this.service.enforceRetentionPolicy(
                tenantId,
                this.config.retention.rawResumeTtlDays,
                this.config.retention.chatTtlDays,
              );
          summary.raw_resumes_cleared += result.raw_resumes_cleared;
          summary.chat_messages_purged += result.chat_messages_purged;
          processed += 1;
        } catch (error) {
          failed += 1;
          this.logger.error(`[retention] tenant sweep failed: ${errorMessage(error)}`, {
            tenant_id: tenantId,
            error_type: errorType(error),
          });
        }
      }
    } finally {
      this.inFlight = false;
    }

    const durationMs = Date.now() - startedAt;
    const result: RetentionRunResult = {
      status: 'completed',
      dry_run: dryRun,
      tenant_scoped: options.userId !== undefined,
      tenants_processed: processed,
      tenants_failed: failed,
      summary,
      duration_ms: durationMs,
    };

    this.logger.info(
      `[retention] ${dryRun ? 'preview' : 'sweep'} complete: tenants=${processed} ` +
        `failed=${failed} raw_resumes_cleared=${summary.raw_resumes_cleared} ` +
        `chat_messages_purged=${summary.chat_messages_purged} duration_ms=${durationMs}`,
      { status: result.status, duration_ms: durationMs },
    );
    return result;
  }

  private getStore(): WorkspaceQueryStore {
    this.store ??= this.queryStore ?? createWorkspaceQueryStore({ config: this.config });
    return this.store;
  }
}

export function createRetentionScheduler(options: RetentionSchedulerOptions): RetentionScheduler {
  return new RetentionScheduler(options);
}
