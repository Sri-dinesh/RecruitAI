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
import { getSharedRedisStore, type RedisStore } from '../redis/client.js';
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
  /** Shared Redis store for the scheduler lock; `null` disables locking. */
  readonly redisStore?: RedisStore | null;
  /** Lock lifetime; defaults to the sweep interval bounded to 5–60 minutes. */
  readonly lockTtlSeconds?: number;
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
  private readonly redisStore: RedisStore | null;
  private readonly lockTtlSeconds: number;
  readonly intervalSeconds: number;

  private timer: NodeJS.Timeout | undefined;
  private store: WorkspaceQueryStore | undefined;
  private inFlight = false;

  constructor(options: RetentionSchedulerOptions) {
    this.config = options.config;
    this.logger = options.logger ?? defaultLogger;
    this.intervalSeconds = options.intervalSeconds ?? options.config.retention.intervalSeconds;
    this.queryStore = options.queryStore;
    this.redisStore = options.redisStore === undefined ? getSharedRedisStore() : options.redisStore;
    this.lockTtlSeconds =
      options.lockTtlSeconds ?? Math.max(300, Math.min(this.intervalSeconds, 3600));
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
    const skipped = (): RetentionRunResult => ({
      status: 'skipped',
      dry_run: dryRun,
      tenant_scoped: options.userId !== undefined,
      tenants_processed: 0,
      tenants_failed: 0,
      summary: { raw_resumes_cleared: 0, chat_messages_purged: 0 },
      duration_ms: 0,
    });

    if (this.inFlight) {
      this.logger.warn('[retention] previous sweep is still running; skipping this tick.');
      return skipped();
    }

    // Exactly one instance may run a destructive sweep per tick. Dry runs are
    // read-only and intentionally bypass the lock.
    let lockToken: string | null = null;
    let lockKey: string | null = null;
    if (!dryRun && this.redisStore) {
      lockKey = this.redisStore.key('lock', 'retention');
      try {
        lockToken = await this.redisStore.acquireLock(lockKey, this.lockTtlSeconds * 1000);
      } catch (error) {
        // Redis is the coordination point: without it, running every replica's
        // sweep would violate the exactly-one guarantee. Skip this tick and
        // retry on the next interval instead.
        this.logger.error(`[retention] could not acquire the Redis lock: ${errorMessage(error)}`, {
          error_type: errorType(error),
        });
        return skipped();
      }
      if (!lockToken) {
        this.logger.info('[retention] another instance owns the sweep lock; skipping this tick.');
        return skipped();
      }
    }

    const startedAt = Date.now();
    this.inFlight = true;
    const summary: RetentionSummary = { raw_resumes_cleared: 0, chat_messages_purged: 0 };
    let processed = 0;
    let failed = 0;

    try {
      if (options.userId !== undefined) {
        await this.sweepTenant(options.userId, dryRun, summary, (processedDelta, failedDelta) => {
          processed += processedDelta;
          failed += failedDelta;
        });
      } else {
        // Enumerate tenants in keyset pages instead of loading every user id.
        const batchSize = this.config.database.sweepBatchSize;
        let after: string | undefined;
        for (;;) {
          const tenantIds = await this.getStore().listUserIds({
            limit: batchSize,
            ...(after === undefined ? {} : { after }),
          });
          for (const tenantId of tenantIds) {
            await this.sweepTenant(tenantId, dryRun, summary, (processedDelta, failedDelta) => {
              processed += processedDelta;
              failed += failedDelta;
            });
          }
          if (tenantIds.length < batchSize) {
            break;
          }
          after = tenantIds[tenantIds.length - 1];
        }
      }
    } finally {
      this.inFlight = false;
      if (lockKey && lockToken && this.redisStore) {
        try {
          await this.redisStore.releaseLock(lockKey, lockToken);
        } catch (error) {
          // The TTL releases the lock; log so a stuck key is visible.
          this.logger.warn(`[retention] failed to release the sweep lock: ${errorMessage(error)}`, {
            error_type: errorType(error),
          });
        }
      }
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

  private async sweepTenant(
    tenantId: string,
    dryRun: boolean,
    summary: RetentionSummary,
    count: (processed: number, failed: number) => void,
  ): Promise<void> {
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
      count(1, 0);
    } catch (error) {
      count(0, 1);
      this.logger.error(`[retention] tenant sweep failed: ${errorMessage(error)}`, {
        tenant_id: tenantId,
        error_type: errorType(error),
      });
    }
  }

  private getStore(): WorkspaceQueryStore {
    this.store ??= this.queryStore ?? createWorkspaceQueryStore({ config: this.config });
    return this.store;
  }
}

export function createRetentionScheduler(options: RetentionSchedulerOptions): RetentionScheduler {
  return new RetentionScheduler(options);
}
