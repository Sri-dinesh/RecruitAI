import { isLlmDataUseModeVerified, loadConfig, type AppConfig } from './index.js';
import type { EnvSource } from './env.js';

/**
 * Production preflight checks (Phase 19).
 *
 * `loadConfig` already enforces the Python-compatible gates (AI-SEC-1,
 * required keys, local-auth forcing, strict numeric parsing). Preflight covers
 * the cross-field checks that should block a production deploy but do not
 * belong in the shared config loader:
 *
 * - JWT material is present and strong enough to verify tokens;
 * - a direct PostgreSQL URL is configured (no SQLite fallback in production);
 * - CORS does not ship local development origins;
 * - secrets are not obvious placeholders;
 * - partial SMTP/Razorpay configuration is caught before traffic;
 * - hardening switches (rate limit, debug logging, trust proxy) are reviewed.
 *
 * It is intentionally side-effect free and prints no secret values. The CLI
 * (`npm run preflight`) is the deployment entrypoint; `main.ts` also runs the
 * same evaluation in production and refuses to start on any failure.
 */

export type PreflightStatus = 'pass' | 'warn' | 'fail';

export interface PreflightCheck {
  readonly id: string;
  readonly status: PreflightStatus;
  readonly detail: string;
}

export interface PreflightReport {
  readonly ok: boolean;
  readonly checks: readonly PreflightCheck[];
}

/** Substrings that mark a value as a sample/placeholder rather than a secret. */
const PLACEHOLDER_MARKERS = [
  'placeholder',
  'changeme',
  'change-me',
  'replace_me',
  'replace-me',
  'your_',
  'your-',
  'dummy',
];

/** Minimum length for an HS256 signing secret (256-bit material). */
export const MIN_JWT_SECRET_LENGTH = 32;

export function looksLikePlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker));
}

function isPostgresUrl(value: string): boolean {
  return /^postgres(ql)?:\/\//i.test(value);
}

/** True for loopback origins, which should never ship to production CORS. */
function isLoopbackOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin);
}

/**
 * Evaluate a loaded config against production expectations.
 *
 * Pure: no filesystem or network access, so it is safe to call from bootstrap
 * and deterministic in tests. `env` is used for the few checks that must see
 * the raw value (for example `USE_LOCAL_AUTH=true`, which config forces off).
 */
export function evaluatePreflight(config: AppConfig, env: EnvSource): PreflightReport {
  const checks: PreflightCheck[] = [];
  const add = (id: string, status: PreflightStatus, detail: string): void => {
    checks.push({ id, status, detail });
  };

  add(
    'environment',
    config.isProduction ? 'pass' : 'fail',
    config.isProduction ? 'ENVIRONMENT=production' : `ENVIRONMENT=${config.environment}`,
  );

  add(
    'node-env',
    (env.NODE_ENV ?? '').toLowerCase() === 'production' ? 'pass' : 'warn',
    (env.NODE_ENV ?? '').toLowerCase() === 'production'
      ? 'NODE_ENV=production'
      : 'NODE_ENV is not production; containers already set it',
  );

  add(
    'required-keys',
    config.missingKeys.length === 0 ? 'pass' : 'fail',
    config.missingKeys.length === 0
      ? 'GEMINI_API_KEY, TAVILY_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are set'
      : `missing ${config.missingKeys.join(', ')}`,
  );

  add(
    'llm-data-use',
    isLlmDataUseModeVerified(config) ? 'pass' : 'fail',
    isLlmDataUseModeVerified(config)
      ? 'LLM_DATA_USE_MODE=zero_retention_verified'
      : `LLM_DATA_USE_MODE=${config.llm.dataUseMode} is not verified`,
  );

  add(
    'llm-kill-switch',
    config.llm.killSwitch ? 'warn' : 'pass',
    config.llm.killSwitch
      ? 'LLM_KILL_SWITCH=true; agent calls degrade to rule-based paths'
      : 'LLM calls enabled',
  );

  const jwtSecret = env.SUPABASE_JWT_SECRET ?? config.auth.jwtSecret;
  if (!jwtSecret) {
    add('jwt-secret', 'fail', 'SUPABASE_JWT_SECRET is required to verify API tokens');
  } else if (looksLikePlaceholder(jwtSecret)) {
    add('jwt-secret', 'fail', 'SUPABASE_JWT_SECRET looks like a placeholder');
  } else if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    add(
      'jwt-secret',
      'fail',
      `SUPABASE_JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`,
    );
  } else {
    add('jwt-secret', 'pass', 'HS256 signing secret is set');
  }

  add(
    'jwt-audience',
    config.auth.jwtAudience === 'authenticated' ? 'pass' : 'warn',
    config.auth.jwtAudience === 'authenticated'
      ? 'SUPABASE_JWT_AUDIENCE=authenticated'
      : `custom audience "${config.auth.jwtAudience}"; confirm tokens use it`,
  );

  const databaseUrl = config.database.url;
  if (!databaseUrl) {
    add('database-url', 'fail', 'DATABASE_URL/SUPABASE_DB_URL is required in production');
  } else if (!isPostgresUrl(databaseUrl)) {
    add('database-url', 'fail', 'DATABASE_URL must be a postgres:// or postgresql:// URL');
  } else if (looksLikePlaceholder(databaseUrl)) {
    add('database-url', 'fail', 'DATABASE_URL looks like a placeholder');
  } else {
    add(
      'database-url',
      'pass',
      `PostgreSQL direct TCP configured (pool max ${config.database.poolMax})`,
    );
  }

  add(
    'local-auth',
    (env.USE_LOCAL_AUTH ?? '').toLowerCase() === 'true' ? 'fail' : 'pass',
    (env.USE_LOCAL_AUTH ?? '').toLowerCase() === 'true'
      ? 'USE_LOCAL_AUTH=true must not be set in production (config would force it off)'
      : 'local development auth disabled',
  );

  const origins = config.cors.allowedOrigins;
  const loopback = origins.filter(isLoopbackOrigin);
  const nonHttp = origins.filter((origin) => !/^https?:\/\//i.test(origin));
  if (origins.length === 0) {
    add('cors-origins', 'fail', 'ALLOWED_ORIGINS is empty');
  } else if (loopback.length > 0) {
    add('cors-origins', 'fail', `remove loopback origins: ${loopback.join(', ')}`);
  } else if (nonHttp.length > 0) {
    add('cors-origins', 'fail', `invalid origins: ${nonHttp.join(', ')}`);
  } else {
    add('cors-origins', 'pass', `${origins.length} explicit origin(s)`);
  }

  const placeholderSecrets = [
    ['GEMINI_API_KEY', config.llm.geminiApiKey],
    ['TAVILY_API_KEY', config.llm.tavilyApiKey],
    ['SUPABASE_SERVICE_ROLE_KEY', config.supabase.serviceRoleKey],
    ['SMTP_PASSWORD', config.smtp.password],
    ['RAZORPAY_KEY_SECRET', config.razorpay.keySecret],
    ['RAZORPAY_WEBHOOK_SECRET', config.razorpay.webhookSecret],
  ]
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .filter(([, value]) => looksLikePlaceholder(value))
    .map(([name]) => name);
  add(
    'secret-placeholders',
    placeholderSecrets.length === 0 ? 'pass' : 'fail',
    placeholderSecrets.length === 0
      ? 'no placeholder secrets detected'
      : `placeholder values in ${placeholderSecrets.join(', ')}`,
  );

  const smtpCredentials = Boolean(config.smtp.username && config.smtp.password);
  const smtpSender = Boolean(config.smtp.sender);
  if (smtpCredentials && smtpSender) {
    add('smtp', 'pass', `SMTP configured for ${config.smtp.server}:${config.smtp.port}`);
  } else if (!smtpCredentials && !smtpSender) {
    add('smtp', 'warn', 'SMTP not configured; outreach runs in simulation mode');
  } else {
    add(
      'smtp',
      'fail',
      'partial SMTP configuration: set SMTP_USERNAME, SMTP_PASSWORD and SMTP_SENDER together',
    );
  }

  const razorpayConfigured = [
    config.razorpay.keyId,
    config.razorpay.keySecret,
    config.razorpay.webhookSecret,
  ];
  const razorpaySet = razorpayConfigured.filter(Boolean).length;
  if (razorpaySet === 3) {
    add('razorpay', 'pass', 'Razorpay keys and webhook secret are set');
  } else if (razorpaySet === 0) {
    add('razorpay', 'warn', 'Razorpay not configured; orders are simulated and webhooks reject');
  } else {
    add(
      'razorpay',
      'fail',
      'partial Razorpay configuration: set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET together',
    );
  }

  add(
    'redis',
    config.jobs.redisUrl ? 'pass' : 'warn',
    config.jobs.redisUrl
      ? 'REDIS_URL set; BullMQ job manager will be used'
      : 'REDIS_URL unset; in-memory jobs require a single instance',
  );

  add(
    'retention-scheduler',
    config.retention.enabled ? 'warn' : 'pass',
    config.retention.enabled
      ? 'RETENTION_JOB_ENABLED=true; ensure only one instance runs the sweep'
      : 'scheduled retention disabled; manual route/CLI remains available',
  );

  add(
    'rate-limit',
    config.rateLimit.enabled ? 'pass' : 'warn',
    config.rateLimit.enabled
      ? `${config.rateLimit.maxRequests} requests / ${config.rateLimit.windowSeconds}s per IP`
      : 'RATE_LIMIT_ENABLED=false; no global abuse guard',
  );

  add(
    'log-level',
    config.logging.level === 'debug' ? 'warn' : 'pass',
    config.logging.level === 'debug'
      ? 'LOG_LEVEL=debug is verbose; use info in production'
      : `LOG_LEVEL=${config.logging.level}`,
  );

  add(
    'trust-proxy',
    config.rateLimit.trustProxy ? 'warn' : 'pass',
    config.rateLimit.trustProxy
      ? 'TRUST_PROXY=true; only safe when a proxy overwrites X-Forwarded-For'
      : 'TRUST_PROXY=false; client IP is the socket address',
  );

  return { ok: !checks.some((check) => check.status === 'fail'), checks };
}

/**
 * Load config from `env` and evaluate it. A config-loading failure is reported
 * as a single `config-load` failure instead of throwing, so the CLI can print a
 * useful report for an invalid deployment.
 */
export function runPreflight(env: EnvSource = process.env): PreflightReport {
  let config: AppConfig;
  try {
    config = loadConfig(env);
  } catch (error) {
    return {
      ok: false,
      checks: [
        {
          id: 'config-load',
          status: 'fail',
          detail: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
  return evaluatePreflight(config, env);
}

/** Render a report as printable lines (no secret values). */
export function formatPreflightReport(report: PreflightReport): string[] {
  const lines = report.checks.map(
    (check) => `${check.status.toUpperCase().padEnd(4)} ${check.id}: ${check.detail}`,
  );
  const counts = report.checks.reduce(
    (acc, check) => {
      acc[check.status] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0 },
  );
  lines.push(
    `${report.ok ? 'PASS' : 'FAIL'} production preflight: ` +
      `${counts.pass} passed, ${counts.warn} warning(s), ${counts.fail} failure(s)`,
  );
  return lines;
}

/** CLI body: returns the process exit code and writes a redacted report. */
export function runPreflightCli(
  env: EnvSource = process.env,
  stdout: (line: string) => void = console.log,
  stderr: (line: string) => void = console.error,
): number {
  const report = runPreflight(env);
  const write = report.ok ? stdout : stderr;
  for (const line of formatPreflightReport(report)) {
    write(line);
  }
  return report.ok ? 0 : 1;
}
