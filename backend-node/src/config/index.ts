import {
  readBoolean,
  readCsvList,
  readEnumStrict,
  readInt,
  readIntStrict,
  readNonNegativeIntStrict,
  readPositiveFloatStrict,
  readPositiveIntStrict,
  readString,
  readStringOr,
  type EnvSource,
} from './env.js';
import { LOG_LEVELS, type LogLevel } from '../telemetry/logger.js';

/**
 * Typed application configuration.
 *
 * Ported from backend/app/core/config.py. Behavior is preserved exactly
 * (defaults, parsing quirks, production gates); the only deliberate addition
 * is fail-fast validation of required production keys, which the migration
 * plan requires and the Python backend defined as get_missing_keys() but
 * never enforced at startup.
 */

/** CORS allow-list defaults from the Python config. */
export const DEFAULT_ALLOWED_ORIGINS = [
  'https://recruitaiofficial.vercel.app',
  'https://recruitai.vercel.app',
  'http://localhost:3000',
  'http://localhost:8081',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8081',
] as const;

/** Vercel preview-origin regex used by the FastAPI CORS middleware. */
export const VERCEL_PREVIEW_ORIGIN_REGEX = String.raw`^https:\/\/recruitai(-[a-zA-Z0-9]+)?\.vercel\.app$`;

export const DEFAULT_LOCAL_DEV_USER_ID = 'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3';

export const DEFAULT_LLM_DATA_USE_MODE = 'zero_retention_verified';

/**
 * Gemini model rotation order, ported from
 * backend/app/core/llm_router.py::ROTATING_MODELS.
 */
export const ROTATING_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.7-flash',
] as const;

/** JWT verification is pinned to HS256 in the Python auth layer. */
export const JWT_ALGORITHM = 'HS256' as const;

/** Supabase `aud` claim expected by auth.py (getattr default). */
export const DEFAULT_JWT_AUDIENCE = 'authenticated';

/**
 * Keys the Python backend treats as required (get_missing_keys()).
 * In production we fail fast when any are absent.
 */
export const REQUIRED_PRODUCTION_KEYS = [
  'GEMINI_API_KEY',
  'TAVILY_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

/** Modes rejected by the AI-SEC-1 production gate. */
const UNVERIFIED_DATA_USE_MODES = new Set(['unverified', 'training_allowed', 'opt_in', 'false']);

export interface ServerConfig {
  readonly host: string;
  readonly port: number;
  readonly reload: boolean;
}

export interface AuthConfig {
  readonly useLocalAuth: boolean;
  readonly localDevUserId: string;
  readonly jwtSecret: string;
  readonly jwtAlgorithm: typeof JWT_ALGORITHM;
  readonly jwtAudience: string;
}

export interface LlmConfig {
  readonly geminiApiKey: string | undefined;
  readonly googleApiKey: string | undefined;
  /** Kept for parity; defined in Python but unused. TODO(Phase 8): confirm drop. */
  readonly groqApiKey: string | undefined;
  readonly tavilyApiKey: string | undefined;
  readonly dataUseMode: string;
  readonly killSwitch: boolean;
  readonly rotatingModels: readonly string[];
  /** Fleet-wide cap on simultaneous Gemini attempts (Phase 23 spend gate). */
  readonly maxConcurrentCalls: number;
  /** Lease lifetime for a concurrency slot; must exceed the request timeout. */
  readonly budgetLeaseSeconds: number;
  /** How long a caller waits for a slot before failing over/degrading. */
  readonly budgetAcquireTimeoutMs: number;
  /** Approximate rolling window used for cost-anomaly detection. */
  readonly costAlarmWindowSeconds: number;
  /** Alert when the window's estimated spend reaches this many USD. */
  readonly costAlarmThresholdUsd: number;
}

export interface SupabaseConfig {
  readonly url: string | undefined;
  readonly anonKey: string;
  readonly serviceRoleKey: string | undefined;
}

/**
 * Direct-TCP PostgreSQL access settings (Phase 6).
 *
 * `drizzle-orm/node-postgres` talks to Postgres over TCP, not through
 * PostgREST. `url` must therefore be a Postgres connection string
 * (`postgresql://user:pass@host:port/db`), not the Supabase project URL.
 *
 * Pool math (Phase 22):
 *
 *   (poolMax + readPoolMax) × instance count + non-HTTP workers <= DB ceiling
 *
 * Every Node instance opens at most `poolMax` primary connections and
 * `readPoolMax` replica connections. Both must stay below the Supabase
 * Supavisor/PgBouncer transaction-pool ceiling for the project plan (the
 * pooler's `default_pool_size` per user/database pair), leaving headroom for
 * migrations, `psql` sessions and the retention CLI. Defaults: 10 primary and
 * 10 read; for example 4 instances × (10 + 10) = 80 connections.
 */
export interface DatabaseConfig {
  readonly url: string | undefined;
  readonly poolMax: number;
  readonly idleTimeoutMs: number;
  readonly connectionTimeoutMs: number;
  /** Optional read-replica/pooler URL for analytics reads. */
  readonly readUrl: string | undefined;
  /** Bounded pool size for the read replica; defaults to `poolMax`. */
  readonly readPoolMax: number;
  /** `statement_timeout` applied to every session (milliseconds). */
  readonly statementTimeoutMs: number;
  /** `idle_in_transaction_session_timeout` applied to every session (milliseconds). */
  readonly idleInTransactionTimeoutMs: number;
  /** Upper bound for a single explicit transaction (milliseconds). */
  readonly transactionTimeoutMs: number;
  /** Keyset batch size for retention/erasure/administrative sweeps. */
  readonly sweepBatchSize: number;
  /** Maximum rows per multi-row INSERT round trip. */
  readonly insertBatchSize: number;
  /** Hard cap applied to every list query, even when a caller asks for more. */
  readonly listMaxLimit: number;
  /** SQLite fallback file used only outside production, as in Python. */
  readonly fallbackPath: string;
}

/**
 * Fleet-wide hot-read caching (Phase 22).
 *
 * Only derived/read-optimisation state is cached: subscription status, credits
 * balance and analytics snapshots. The credit ledger is never served from
 * cache — deduct/verify/webhook paths read and write the primary directly, then
 * invalidate. TTLs are deliberately short so a missed invalidation self-heals.
 */
export interface CacheConfig {
  readonly hotReadsEnabled: boolean;
  readonly creditsTtlSeconds: number;
  readonly subscriptionTtlSeconds: number;
  readonly analyticsTtlSeconds: number;
  /**
   * JD parsed-structure cache (Phase 23). Parsing is deterministic for a given
   * document, so repeated uploads of the same JD can reuse the structured
   * result across replicas when Redis is configured.
   */
  readonly jdParseEnabled: boolean;
  readonly jdParseTtlSeconds: number;
}

/** Payment idempotency window (Phase 22). */
export interface PaymentsConfig {
  /** How long a processed verify/webhook key blocks a replay. Default 24 h. */
  readonly idempotencyTtlSeconds: number;
}

/**
 * Outbound dependency deadlines (Phase 23).
 *
 * Every third-party call has a hard timeout so a hung provider cannot pin a
 * request slot indefinitely. Tavily falls back to deterministic market data;
 * Razorpay failures are mapped by the payment route; SMTP failures return the
 * existing dispatch-failure message.
 */
export interface OutboundConfig {
  readonly tavilyTimeoutMs: number;
  readonly razorpayTimeoutMs: number;
  readonly smtpConnectionTimeoutMs: number;
  readonly smtpGreetingTimeoutMs: number;
  readonly smtpSocketTimeoutMs: number;
}

export interface SmtpConfig {
  readonly server: string;
  readonly port: number;
  readonly username: string | undefined;
  readonly password: string | undefined;
  readonly sender: string | undefined;
}

export interface RazorpayConfig {
  readonly keyId: string;
  readonly keySecret: string;
  readonly webhookSecret: string;
}

export interface CorsConfig {
  readonly allowedOrigins: readonly string[];
  readonly previewOriginRegex: string;
}

export interface TelemetryConfig {
  /** Python has no telemetry env toggles; metrics are always enabled. */
  readonly enabled: true;
  /** Warn when the event-loop delay p99 exceeds this many milliseconds. */
  readonly eventLoopLagWarnMs: number;
}

/**
 * CPU offloading (Phase 21).
 *
 * PDF/DOCX extraction, deterministic resume parsing and PDF report generation
 * run in a bounded `worker_threads` pool when enabled. Production turns this on
 * by default; tests and local development keep inline execution unless
 * `WORKER_POOL_ENABLED=true` is set, so the same code paths stay deterministic.
 */
export interface WorkersConfig {
  readonly enabled: boolean;
  /** Maximum concurrent worker threads. */
  readonly size: number;
  /** Maximum queued tasks before admission is rejected with 503. */
  readonly maxQueue: number;
}

/**
 * Chat streaming admission control (Phase 21).
 *
 * The cap is per instance: each replica may hold this many concurrent SSE
 * responses. Once reached the route returns `429` with `Retry-After` instead of
 * letting long-lived streams exhaust file descriptors.
 */
export interface ChatConfig {
  readonly maxSseConnections: number;
  /** SSE comment frame interval; keeps proxies from idling the stream out. */
  readonly sseHeartbeatSeconds: number;
  /** Close a stream that produced no event frames for this long. */
  readonly sseIdleTimeoutSeconds: number;
}

/** Structured log verbosity (Phase 19). */
export interface LoggingConfig {
  readonly level: LogLevel;
}

/**
 * In-process request rate limiting (Phase 19).
 *
 * Python has no global limiter, so this is a Node-side production-hardening
 * addition. It is enabled by default only when `isProduction`; development and
 * tests stay unlimited unless `RATE_LIMIT_ENABLED=true` is set explicitly.
 *
 * The limiter is per process and keyed by client IP. It is a coarse abuse guard
 * for a single instance, not a distributed quota; Phase 22 moves fleet-wide
 * quotas to Redis if needed.
 */
export interface RateLimitConfig {
  readonly enabled: boolean;
  readonly windowSeconds: number;
  readonly maxRequests: number;
  /**
   * Trust `X-Forwarded-For` for the client IP. Enable only when the service is
   * reachable exclusively through a proxy that overwrites the header.
   */
  readonly trustProxy: boolean;
  /**
   * Per-user tiered quotas (Phase 23). This is the fine-grained fair-use layer
   * mounted after authentication; the global limiter above stays as the coarse
   * pre-auth guard. Disabled outside production unless explicitly enabled.
   */
  readonly tieredEnabled: boolean;
  /** Sliding window for every tier; defaults to 60 seconds. */
  readonly tierWindowSeconds: number;
  /**
   * Per-IP limit multiplier relative to the per-user limit for the same tier.
   * A higher value lets several users share a NAT/proxy address while still
   * bounding a single abusive client. Defaults to 4.
   */
  readonly ipMultiplier: number;
  /** Per-user request budget per tier/window. */
  readonly tiers: Readonly<Record<RateLimitTier, number>>;
}

/** Fair-use tiers, matching `docs/slo.md` §4 (chat 60/min). */
export const RATE_LIMIT_TIERS = [
  'chat',
  'email',
  'payments',
  'ingest',
  'evaluate',
  'write',
  'read',
] as const;

export type RateLimitTier = (typeof RATE_LIMIT_TIERS)[number];

export type RateLimitTierLimits = Readonly<Record<RateLimitTier, number>>;

export const DEFAULT_RATE_LIMIT_TIER_LIMITS: RateLimitTierLimits = {
  // 60 chat requests/minute per recruiter workspace (docs/slo.md §4).
  chat: 60,
  // Outbound email is expensive and mostly LLM-drafted.
  email: 20,
  // Payment mutations are idempotent but must not be scriptable.
  payments: 30,
  // Batch ingestion is capped at 10 files/request; bound batches per minute.
  ingest: 30,
  // Candidate evaluation/ATS export invokes the LLM pool.
  evaluate: 30,
  // Generic authenticated mutations (sessions, privacy, reports, users).
  write: 120,
  // Read/list/status endpoints get a larger but still bounded budget.
  read: 600,
};

/**
 * Async chat job execution (Phase 14).
 *
 * The Python job queue is process-local. When `REDIS_URL` is set the service
 * uses the BullMQ-backed manager; otherwise it falls back to the in-memory
 * Python-equivalent manager so local development and tests need no Redis.
 */
export interface JobsConfig {
  readonly redisUrl: string | null;
  readonly queueName: string;
  /** Job/event retention in seconds (Python: 3600). */
  readonly ttlSeconds: number;
  /** Fleet-wide cap on concurrently running turns per user. */
  readonly perUserConcurrency: number;
  /** Turns a single worker process may run at once (Python: 10 threads). */
  readonly workerConcurrency: number;
  /** Maximum events kept for replay per job. */
  readonly eventReplayLimit: number;
}

/**
 * Operational data-retention sweeps (Phase 16).
 *
 * Python only exposes retention as an authenticated request
 * (`POST /api/privacy/retention/run`) and never schedules it. The Node backend
 * keeps that route and adds an opt-in Express-side scheduler, disabled unless
 * `RETENTION_JOB_ENABLED=true` so a deploy never starts deleting data without
 * an explicit decision.
 */
export interface RetentionConfig {
  readonly enabled: boolean;
  /** Seconds between sweeps when the scheduler is enabled. */
  readonly intervalSeconds: number;
  /** Python default: raw resume text is cleared after 90 days. */
  readonly rawResumeTtlDays: number;
  /** Python default: chat messages are purged after 365 days. */
  readonly chatTtlDays: number;
}

export interface AppConfig {
  readonly environment: string;
  readonly nodeEnv: string | undefined;
  readonly isProduction: boolean;
  readonly server: ServerConfig;
  readonly auth: AuthConfig;
  readonly llm: LlmConfig;
  readonly supabase: SupabaseConfig;
  readonly database: DatabaseConfig;
  readonly smtp: SmtpConfig;
  readonly razorpay: RazorpayConfig;
  readonly cors: CorsConfig;
  readonly jobs: JobsConfig;
  readonly retention: RetentionConfig;
  readonly workers: WorkersConfig;
  readonly chat: ChatConfig;
  readonly cache: CacheConfig;
  readonly payments: PaymentsConfig;
  readonly outbound: OutboundConfig;
  readonly telemetry: TelemetryConfig;
  readonly logging: LoggingConfig;
  readonly rateLimit: RateLimitConfig;
  /** Required keys that are currently missing (informational outside production). */
  readonly missingKeys: readonly string[];
}

/** AI-SEC-1. Mirrors verify_provider_compliance() in the Python config. */
export function verifyProviderCompliance(config: AppConfig): void {
  if (
    config.isProduction &&
    (UNVERIFIED_DATA_USE_MODES.has(config.llm.dataUseMode.toLowerCase()) ||
      config.llm.dataUseMode !== DEFAULT_LLM_DATA_USE_MODE)
  ) {
    throw new Error(
      `FATAL SECURITY VIOLATION (AI-SEC-1): LLM_DATA_USE_MODE is '${config.llm.dataUseMode}'. ` +
        "Enterprise production requires 'zero_retention_verified' with active provider DPA " +
        'and training opt-out to prevent candidate data ingestion by foundational models.',
    );
  }
}

/** Mirrors get_missing_keys() from the Python config. */
export function getMissingKeys(env: EnvSource): string[] {
  return REQUIRED_PRODUCTION_KEYS.filter((key) => !env[key]);
}

/**
 * Build a validated config object from an env source.
 *
 * Throws when:
 * - a production AI-SEC-1 data-use violation is detected
 * - required production keys are missing
 * - PORT is present but not an integer
 */
export function loadConfig(env: EnvSource = process.env): AppConfig {
  const nodeEnv = readString(env, 'NODE_ENV');
  const environment = (env.ENVIRONMENT ?? nodeEnv ?? 'development').toLowerCase();
  const isProduction = environment === 'production';

  const username = readString(env, 'SMTP_USERNAME');
  const port = readIntStrict(env, 'PORT', 8000);

  // Parsed first so the read pool can default to the primary pool size.
  const poolMax = readPositiveIntStrict(env, 'PG_POOL_MAX', 10);

  const allowedOrigins = readCsvList(env, 'ALLOWED_ORIGINS') ?? [...DEFAULT_ALLOWED_ORIGINS];

  const config: AppConfig = {
    environment,
    nodeEnv,
    isProduction,
    server: {
      host: readStringOr(env, 'HOST', '0.0.0.0'),
      port,
      reload: readBoolean(env, 'RELOAD', !isProduction),
    },
    auth: {
      // Dev-only bypass; never active in production.
      useLocalAuth: isProduction ? false : readBoolean(env, 'USE_LOCAL_AUTH', false),
      localDevUserId: readStringOr(env, 'LOCAL_DEV_USER_ID', DEFAULT_LOCAL_DEV_USER_ID),
      jwtSecret: readStringOr(env, 'SUPABASE_JWT_SECRET', ''),
      jwtAlgorithm: JWT_ALGORITHM,
      jwtAudience: readStringOr(env, 'SUPABASE_JWT_AUDIENCE', DEFAULT_JWT_AUDIENCE),
    },
    llm: {
      geminiApiKey: readString(env, 'GEMINI_API_KEY'),
      googleApiKey: readString(env, 'GOOGLE_API_KEY'),
      groqApiKey: readString(env, 'GROQ_API_KEY'),
      tavilyApiKey: readString(env, 'TAVILY_API_KEY'),
      dataUseMode: readStringOr(env, 'LLM_DATA_USE_MODE', DEFAULT_LLM_DATA_USE_MODE),
      killSwitch: readBoolean(env, 'LLM_KILL_SWITCH', false),
      rotatingModels: ROTATING_MODELS,
      maxConcurrentCalls: readPositiveIntStrict(env, 'LLM_MAX_CONCURRENT_CALLS', 8),
      budgetLeaseSeconds: readPositiveIntStrict(env, 'LLM_BUDGET_LEASE_SECONDS', 120),
      budgetAcquireTimeoutMs: readPositiveIntStrict(env, 'LLM_BUDGET_ACQUIRE_TIMEOUT_MS', 1500),
      costAlarmWindowSeconds: readPositiveIntStrict(env, 'LLM_COST_ALARM_WINDOW_SECONDS', 300),
      costAlarmThresholdUsd: readPositiveFloatStrict(env, 'LLM_COST_ALARM_THRESHOLD_USD', 1),
    },
    supabase: {
      url: readString(env, 'SUPABASE_URL'),
      anonKey: readStringOr(env, 'SUPABASE_ANON_KEY', ''),
      serviceRoleKey: readString(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    },
    database: {
      // Direct Postgres connection string. `SUPABASE_DB_URL` is accepted as a
      // fallback because that is the name Supabase's dashboard exposes.
      url: readString(env, 'DATABASE_URL') ?? readString(env, 'SUPABASE_DB_URL'),
      poolMax,
      idleTimeoutMs: readNonNegativeIntStrict(env, 'PG_IDLE_TIMEOUT_MS', 30_000),
      connectionTimeoutMs: readNonNegativeIntStrict(env, 'PG_CONNECTION_TIMEOUT_MS', 5_000),
      // `DATABASE_READ_URL` points at a read replica or a replica pooler. When
      // unset every read stays on the primary, so the code path is identical.
      readUrl: readString(env, 'DATABASE_READ_URL'),
      readPoolMax: readPositiveIntStrict(env, 'PG_READ_POOL_MAX', poolMax),
      statementTimeoutMs: readPositiveIntStrict(env, 'PG_STATEMENT_TIMEOUT_MS', 15_000),
      idleInTransactionTimeoutMs: readPositiveIntStrict(
        env,
        'PG_IDLE_IN_TRANSACTION_TIMEOUT_MS',
        30_000,
      ),
      transactionTimeoutMs: readPositiveIntStrict(env, 'PG_TRANSACTION_TIMEOUT_MS', 10_000),
      sweepBatchSize: readPositiveIntStrict(env, 'DB_SWEEP_BATCH_SIZE', 500),
      insertBatchSize: readPositiveIntStrict(env, 'DB_INSERT_BATCH_SIZE', 500),
      listMaxLimit: readPositiveIntStrict(env, 'DB_LIST_MAX_LIMIT', 1_000),
      fallbackPath: readStringOr(env, 'SQLITE_FALLBACK_PATH', 'recruitai_fallback.db'),
    },
    smtp: {
      server: readStringOr(env, 'SMTP_SERVER', 'smtp.gmail.com'),
      port: readInt(env, 'SMTP_PORT', 587),
      username,
      password: readString(env, 'SMTP_PASSWORD'),
      sender: env.SMTP_SENDER ?? username,
    },
    razorpay: {
      keyId: readStringOr(env, 'RAZORPAY_KEY_ID', ''),
      keySecret: readStringOr(env, 'RAZORPAY_KEY_SECRET', ''),
      webhookSecret: readStringOr(env, 'RAZORPAY_WEBHOOK_SECRET', ''),
    },
    cors: {
      allowedOrigins,
      previewOriginRegex: VERCEL_PREVIEW_ORIGIN_REGEX,
    },
    jobs: {
      redisUrl: readString(env, 'REDIS_URL') || null,
      queueName: readStringOr(env, 'JOB_QUEUE_NAME', 'recruitai-agent-jobs'),
      ttlSeconds: readPositiveIntStrict(env, 'JOB_TTL_SECONDS', 3600),
      perUserConcurrency: readPositiveIntStrict(env, 'JOB_PER_USER_CONCURRENCY', 2),
      workerConcurrency: readPositiveIntStrict(env, 'JOB_WORKER_CONCURRENCY', 10),
      eventReplayLimit: readPositiveIntStrict(env, 'JOB_EVENT_REPLAY_LIMIT', 100),
    },
    retention: {
      enabled: readBoolean(env, 'RETENTION_JOB_ENABLED', false),
      intervalSeconds: readPositiveIntStrict(env, 'RETENTION_JOB_INTERVAL_SECONDS', 86_400),
      rawResumeTtlDays: readNonNegativeIntStrict(env, 'RETENTION_RAW_RESUME_TTL_DAYS', 90),
      chatTtlDays: readNonNegativeIntStrict(env, 'RETENTION_CHAT_TTL_DAYS', 365),
    },
    workers: {
      enabled: readBoolean(env, 'WORKER_POOL_ENABLED', isProduction),
      size: readPositiveIntStrict(env, 'WORKER_POOL_SIZE', 2),
      maxQueue: readPositiveIntStrict(env, 'WORKER_POOL_MAX_QUEUE', 100),
    },
    chat: {
      maxSseConnections: readPositiveIntStrict(env, 'CHAT_MAX_SSE_CONNECTIONS', 200),
      sseHeartbeatSeconds: readPositiveIntStrict(env, 'CHAT_SSE_HEARTBEAT_SECONDS', 15),
      sseIdleTimeoutSeconds: readPositiveIntStrict(env, 'CHAT_SSE_IDLE_TIMEOUT_SECONDS', 300),
    },
    cache: {
      // Enabled by default; the Redis store is the fleet-wide backend and the
      // in-memory TTL cache keeps local development dependency-free.
      hotReadsEnabled: readBoolean(env, 'CACHE_HOT_READS_ENABLED', true),
      creditsTtlSeconds: readPositiveIntStrict(env, 'CACHE_CREDITS_TTL_SECONDS', 15),
      subscriptionTtlSeconds: readPositiveIntStrict(env, 'CACHE_SUBSCRIPTION_TTL_SECONDS', 30),
      analyticsTtlSeconds: readPositiveIntStrict(env, 'CACHE_ANALYTICS_TTL_SECONDS', 30),
      jdParseEnabled: readBoolean(env, 'CACHE_JD_PARSE_ENABLED', true),
      jdParseTtlSeconds: readPositiveIntStrict(env, 'CACHE_JD_PARSE_TTL_SECONDS', 3600),
    },
    payments: {
      idempotencyTtlSeconds: readPositiveIntStrict(env, 'PAYMENT_IDEMPOTENCY_TTL_SECONDS', 86_400),
    },
    outbound: {
      tavilyTimeoutMs: readPositiveIntStrict(env, 'TAVILY_TIMEOUT_MS', 8_000),
      razorpayTimeoutMs: readPositiveIntStrict(env, 'RAZORPAY_TIMEOUT_MS', 10_000),
      smtpConnectionTimeoutMs: readPositiveIntStrict(env, 'SMTP_CONNECTION_TIMEOUT_MS', 10_000),
      smtpGreetingTimeoutMs: readPositiveIntStrict(env, 'SMTP_GREETING_TIMEOUT_MS', 10_000),
      smtpSocketTimeoutMs: readPositiveIntStrict(env, 'SMTP_SOCKET_TIMEOUT_MS', 20_000),
    },
    telemetry: {
      enabled: true,
      eventLoopLagWarnMs: readPositiveIntStrict(env, 'EVENT_LOOP_LAG_WARN_MS', 200),
    },
    logging: {
      level: readEnumStrict(env, 'LOG_LEVEL', LOG_LEVELS, 'info'),
    },
    rateLimit: {
      // Production hardening is on by default in production; development and
      // tests keep Python's unlimited behavior unless explicitly enabled.
      enabled: readBoolean(env, 'RATE_LIMIT_ENABLED', isProduction),
      windowSeconds: readPositiveIntStrict(env, 'RATE_LIMIT_WINDOW_SECONDS', 60),
      maxRequests: readPositiveIntStrict(env, 'RATE_LIMIT_MAX_REQUESTS', 600),
      trustProxy: readBoolean(env, 'TRUST_PROXY', false),
      tieredEnabled: readBoolean(env, 'RATE_LIMIT_TIERED_ENABLED', isProduction),
      tierWindowSeconds: readPositiveIntStrict(env, 'RATE_LIMIT_TIER_WINDOW_SECONDS', 60),
      ipMultiplier: readPositiveIntStrict(env, 'RATE_LIMIT_IP_MULTIPLIER', 4),
      tiers: {
        chat: readPositiveIntStrict(
          env,
          'RATE_LIMIT_CHAT_MAX',
          DEFAULT_RATE_LIMIT_TIER_LIMITS.chat,
        ),
        email: readPositiveIntStrict(
          env,
          'RATE_LIMIT_EMAIL_MAX',
          DEFAULT_RATE_LIMIT_TIER_LIMITS.email,
        ),
        payments: readPositiveIntStrict(
          env,
          'RATE_LIMIT_PAYMENTS_MAX',
          DEFAULT_RATE_LIMIT_TIER_LIMITS.payments,
        ),
        ingest: readPositiveIntStrict(
          env,
          'RATE_LIMIT_INGEST_MAX',
          DEFAULT_RATE_LIMIT_TIER_LIMITS.ingest,
        ),
        evaluate: readPositiveIntStrict(
          env,
          'RATE_LIMIT_EVALUATE_MAX',
          DEFAULT_RATE_LIMIT_TIER_LIMITS.evaluate,
        ),
        write: readPositiveIntStrict(
          env,
          'RATE_LIMIT_WRITE_MAX',
          DEFAULT_RATE_LIMIT_TIER_LIMITS.write,
        ),
        read: readPositiveIntStrict(
          env,
          'RATE_LIMIT_READ_MAX',
          DEFAULT_RATE_LIMIT_TIER_LIMITS.read,
        ),
      },
    },
    missingKeys: getMissingKeys(env),
  };

  // Production gate ordering matches the Python import-time check:
  // AI-SEC-1 compliance first, then required-key fail-fast hardening.
  verifyProviderCompliance(config);

  if (isProduction && config.missingKeys.length > 0) {
    throw new Error(
      `Missing required production configuration: ${config.missingKeys.join(', ')}. ` +
        'Set these values before starting the backend in production.',
    );
  }

  return config;
}

let cachedConfig: AppConfig | undefined;

/**
 * Typed process-wide config singleton.
 *
 * Call once during bootstrap (after loadEnvFileIfPresent) so invalid
 * production configuration fails fast before the server starts listening.
 */
export function getConfig(env: EnvSource = process.env): AppConfig {
  cachedConfig ??= loadConfig(env);
  return cachedConfig;
}

/** Test helper: drop the memoized singleton. */
export function resetConfig(): void {
  cachedConfig = undefined;
}

/** Mode helpers requested by the plan. */
export function isProduction(config: AppConfig = getConfig()): boolean {
  return config.isProduction;
}

export function isLlmKilled(config: AppConfig = getConfig()): boolean {
  return config.llm.killSwitch;
}

/** Runtime LLM gate: mirrors the kill-switch short-circuit in call_llm. */
export function isLlmAllowed(config: AppConfig = getConfig()): boolean {
  return !config.llm.killSwitch;
}

/** AI-SEC-1 data-use gate (startup enforcement is verifyProviderCompliance). */
export function isLlmDataUseModeVerified(config: AppConfig = getConfig()): boolean {
  return config.llm.dataUseMode === DEFAULT_LLM_DATA_USE_MODE;
}
