import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

/**
 * Post-cutover stabilization check (Phase 20).
 *
 * Phase 20 is the live-traffic phase: some regressions only appear under real
 * data. This CLI turns the cutover watch list into one repeatable probe so the
 * on-call engineer does not have to stitch together health, readiness, metrics
 * and status buckets by hand.
 *
 * It is read-only and safe to run against production:
 *   - `GET /health` (public liveness),
 *   - `GET /api/health/ready` (authenticated deep readiness),
 *   - `GET /api/metrics` (authenticated JSON + Prometheus).
 *
 * Failure thresholds come from `docs/slo.md` and the cutover runbooks. Warnings
 * expose signals that need a human decision (401/402/422 mix, baseline drift)
 * without pretending that a rate alone proves a regression.
 *
 * Usage:
 *   npm run stabilize
 *   STABILIZATION_BASE_URL=https://<host> \
 *   STABILIZATION_BEARER_TOKEN=<service token> \
 *   npm run stabilize
 *
 * Exit codes: 0 = no hard failures, 1 = hard failure, 2 = usage error.
 */

export const STABLE_METRIC_NAMES = [
  'recruitai_requests_total',
  'recruitai_queue_depth',
  'recruitai_tokens_total',
  'recruitai_llm_cost_usd',
] as const;

/** Defaults mirror the SLO document and the cutover watch list. */
export const DEFAULT_STABILIZATION_THRESHOLDS = {
  /** 99.9% availability ⇒ at most 0.1% 5xx. */
  max5xxRate: 0.001,
  /** Auth failures: watch for a spike, not every bad token. */
  max401Rate: 0.02,
  /** 402 is a normal product response; a spike means quota/pricing trouble. */
  max402Rate: 0.05,
  /** 422 can be normal client input; a spike means a contract mismatch. */
  max422Rate: 0.02,
  /** Runbook 3 pages at 50 pending jobs. */
  maxQueueDepth: 50,
  /** Below this sample size, rates are too noisy to judge. */
  minRequests: 100,
  /** Node 5xx rate may not exceed the Python baseline by this much. */
  baselineTolerance: 0.0,
} as const;

export type StabilizationThresholds = {
  -readonly [Key in keyof typeof DEFAULT_STABILIZATION_THRESHOLDS]: number;
};

export interface StabilizationFlags {
  readonly allowDegraded: boolean;
  readonly allowSqlite: boolean;
  readonly allowLocalAuth: boolean;
  readonly strict: boolean;
}

export interface ProbeResult {
  readonly ok: boolean;
  readonly status?: number;
  readonly body?: unknown;
  readonly text?: string;
  readonly error?: string;
}

export interface StatusBuckets {
  readonly total: number;
  readonly fiveXx: number;
  readonly fourXx: number;
  readonly authFailures: number;
  readonly paymentRequired: number;
  readonly validation: number;
  readonly webhookTotal: number;
  readonly webhookFailures: number;
  readonly webhook5xx: number;
}

export interface MetricsSnapshot {
  readonly buckets: StatusBuckets;
  readonly queueDepth: number;
  readonly reportedErrorRate?: number | undefined;
  readonly sloCompliant?: boolean | undefined;
}

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip';

export interface StabilizationCheck {
  readonly id: string;
  readonly status: CheckStatus;
  readonly detail: string;
}

export interface StabilizationReport {
  readonly ok: boolean;
  readonly checks: readonly StabilizationCheck[];
}

export interface StabilizationInput {
  readonly liveness: ProbeResult;
  readonly readiness: ProbeResult;
  readonly metrics: ProbeResult;
  readonly prometheus: ProbeResult;
  readonly thresholds: StabilizationThresholds;
  readonly flags: StabilizationFlags;
  /** Optional Python canary metrics for a baseline comparison. */
  readonly baseline?: ProbeResult | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function ratio(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}

function formatRate(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatThresholds(thresholds: StabilizationThresholds): string {
  return [
    `5xx<=${formatRate(thresholds.max5xxRate)}`,
    `401<=${formatRate(thresholds.max401Rate)}`,
    `402<=${formatRate(thresholds.max402Rate)}`,
    `422<=${formatRate(thresholds.max422Rate)}`,
    `queue<=${thresholds.maxQueueDepth}`,
    `min=${thresholds.minRequests} requests`,
  ].join(', ');
}

/**
 * Turn `red_metrics.status_breakdown` (`endpoint:status` keys) into the buckets
 * the stabilization watch list needs.
 *
 * The metrics contract intentionally counts every 4xx in `errors_total`, so
 * `slo_health` is not the right source for a 5xx alert. This function derives
 * 5xx directly from the status suffix.
 */
export function summarizeStatusBreakdown(breakdown: Record<string, number>): StatusBuckets {
  let total = 0;
  let fiveXx = 0;
  let fourXx = 0;
  let authFailures = 0;
  let paymentRequired = 0;
  let validation = 0;
  let webhookTotal = 0;
  let webhookFailures = 0;
  let webhook5xx = 0;

  for (const [key, value] of Object.entries(breakdown)) {
    if (!Number.isFinite(value) || value < 0) continue;
    total += value;

    const separator = key.lastIndexOf(':');
    const endpoint = separator === -1 ? key : key.slice(0, separator);
    const status = separator === -1 ? Number.NaN : Number(key.slice(separator + 1));
    if (!Number.isInteger(status)) continue;

    if (status >= 500) fiveXx += value;
    if (status >= 400 && status < 500) fourXx += value;
    if (status === 401) authFailures += value;
    if (status === 402) paymentRequired += value;
    if (status === 422) validation += value;

    if (endpoint === '/api/payments/webhook') {
      webhookTotal += value;
      if (status >= 400) webhookFailures += value;
      if (status >= 500) webhook5xx += value;
    }
  }

  return {
    total,
    fiveXx,
    fourXx,
    authFailures,
    paymentRequired,
    validation,
    webhookTotal,
    webhookFailures,
    webhook5xx,
  };
}

/** Extract the fields the stabilization check needs from the metrics summary. */
export function parseMetricsSnapshot(body: unknown): MetricsSnapshot {
  if (!isRecord(body) || !isRecord(body.red_metrics)) {
    throw new Error('metrics response is missing red_metrics');
  }
  const statusBreakdown = body.red_metrics.status_breakdown;
  if (!isRecord(statusBreakdown)) {
    throw new Error('metrics response is missing red_metrics.status_breakdown');
  }

  const breakdown: Record<string, number> = {};
  for (const [key, value] of Object.entries(statusBreakdown)) {
    const count = asNumber(value);
    if (count !== undefined) breakdown[key] = count;
  }

  const useMetrics = isRecord(body.use_metrics) ? body.use_metrics : {};
  const sloHealth = isRecord(body.slo_health) ? body.slo_health : {};

  return {
    buckets: summarizeStatusBreakdown(breakdown),
    queueDepth: asNumber(useMetrics.queue_depth) ?? 0,
    reportedErrorRate: asNumber(body.red_metrics.error_rate),
    sloCompliant: asBoolean(sloHealth.slo_compliant),
  };
}

function add(checks: StabilizationCheck[], id: string, status: CheckStatus, detail: string): void {
  checks.push({ id, status, detail });
}

function readinessBody(result: ProbeResult): Record<string, unknown> | undefined {
  return isRecord(result.body) ? result.body : undefined;
}

function serviceRecord(
  body: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const services = body?.services;
  if (!isRecord(services)) return undefined;
  return isRecord(services[key]) ? services[key] : undefined;
}

/**
 * Pure evaluation shared by the CLI and tests.
 *
 * Hard failures (exit `1`): liveness/readiness broken, SQLite in production,
 * local auth in production, an unreadable metrics contract, 5xx above the SLO
 * budget, queue backpressure, or 5xx webhook deliveries.
 *
 * Warnings (exit `0` unless `strict`): degraded readiness, LLM unconfigured,
 * 401/402/422 mix above its watch threshold, webhook 4xx, 5xx drift above the
 * Python baseline, and the known `slo_health` 4xx accounting.
 */
export function evaluateStabilization(input: StabilizationInput): StabilizationReport {
  const checks: StabilizationCheck[] = [];
  const { liveness, readiness, metrics, prometheus, thresholds, flags } = input;

  if (!liveness.ok) {
    add(checks, 'liveness', 'fail', `GET /health failed: ${liveness.error ?? 'unknown error'}`);
  } else if (liveness.status !== 200) {
    add(checks, 'liveness', 'fail', `GET /health returned ${liveness.status}`);
  } else {
    const body = isRecord(liveness.body) ? liveness.body : {};
    if (body.status !== 'healthy') {
      add(checks, 'liveness', 'fail', `liveness status is ${JSON.stringify(body.status)}`);
    } else {
      add(checks, 'liveness', 'pass', `healthy (version ${String(body.version ?? 'unknown')})`);
    }
  }

  let snapshot: MetricsSnapshot | undefined;
  if (metrics.ok && metrics.status === 200) {
    try {
      snapshot = parseMetricsSnapshot(metrics.body);
      add(
        checks,
        'metrics',
        'pass',
        `${snapshot.buckets.total} requests, queue depth ${snapshot.queueDepth}`,
      );
    } catch (error) {
      add(checks, 'metrics', 'fail', error instanceof Error ? error.message : String(error));
    }
  } else if (metrics.status === 401) {
    add(
      checks,
      'metrics',
      'fail',
      'metrics returned 401; set STABILIZATION_BEARER_TOKEN to a valid service token',
    );
  } else {
    add(
      checks,
      'metrics',
      'fail',
      `GET /api/metrics failed: ${metrics.error ?? `HTTP ${metrics.status}`}`,
    );
  }

  const missingMetrics = STABLE_METRIC_NAMES.filter(
    (name) => !(prometheus.text ?? '').includes(name),
  );
  if (!prometheus.ok || prometheus.status !== 200) {
    add(
      checks,
      'prometheus',
      'fail',
      `Prometheus export failed: ${prometheus.error ?? `HTTP ${prometheus.status}`}`,
    );
  } else if (missingMetrics.length > 0) {
    add(checks, 'prometheus', 'fail', `missing stable metrics: ${missingMetrics.join(', ')}`);
  } else {
    add(checks, 'prometheus', 'pass', `all ${STABLE_METRIC_NAMES.length} stable metrics present`);
  }

  if (readiness.status === 401) {
    add(
      checks,
      'readiness',
      'fail',
      'readiness returned 401; set STABILIZATION_BEARER_TOKEN (local auth is development-only)',
    );
  } else if (!readiness.ok || readiness.status !== 200) {
    add(
      checks,
      'readiness',
      'fail',
      `GET /api/health/ready failed: ${readiness.error ?? `HTTP ${readiness.status}`}`,
    );
  } else {
    const body = readinessBody(readiness);
    const overall = typeof body?.status === 'string' ? body.status : 'unknown';
    const database = serviceRecord(body, 'database');
    const llm = serviceRecord(body, 'llm');
    const auth = serviceRecord(body, 'auth');

    const databaseType = typeof database?.type === 'string' ? database.type : 'unknown';
    const databaseStatus = typeof database?.status === 'string' ? database.status : 'unknown';
    const authMode = typeof auth?.mode === 'string' ? auth.mode : 'unknown';
    const llmStatus = typeof llm?.status === 'string' ? llm.status : 'unknown';
    const databaseLatency = asNumber(database?.latency_ms);

    if (overall === 'unhealthy') {
      add(checks, 'readiness', 'fail', 'readiness reports unhealthy');
    } else if (overall === 'degraded') {
      add(
        checks,
        'readiness',
        flags.allowDegraded ? 'pass' : 'warn',
        'readiness reports degraded (allowed by configuration)',
      );
    } else {
      add(checks, 'readiness', 'pass', 'healthy');
    }

    if (databaseType === 'sqlite_fallback') {
      add(
        checks,
        'readiness-database',
        flags.allowSqlite ? 'warn' : 'fail',
        'SQLite fallback in use; production must use PostgreSQL',
      );
    } else if (databaseStatus !== 'healthy') {
      add(checks, 'readiness-database', 'fail', `database status is ${databaseStatus}`);
    } else {
      add(
        checks,
        'readiness-database',
        'pass',
        `supabase_postgresql${databaseLatency === undefined ? '' : ` (${databaseLatency}ms)`}`,
      );
    }

    if (authMode === 'local_dev') {
      add(
        checks,
        'readiness-auth',
        flags.allowLocalAuth ? 'warn' : 'fail',
        'local development auth is active',
      );
    } else if (authMode !== 'supabase_jwt') {
      add(checks, 'readiness-auth', 'fail', `auth mode is ${authMode}`);
    } else {
      add(checks, 'readiness-auth', 'pass', 'supabase_jwt');
    }

    if (llmStatus === 'configured') {
      add(checks, 'readiness-llm', 'pass', 'LLM provider configured');
    } else {
      add(
        checks,
        'readiness-llm',
        'warn',
        `LLM provider is ${llmStatus}; agent turns will degrade or fail`,
      );
    }
  }

  if (snapshot === undefined) {
    add(checks, 'traffic', 'skip', 'rate checks need a readable metrics summary');
  } else {
    const { buckets } = snapshot;
    const enoughTraffic = buckets.total >= thresholds.minRequests;

    if (!enoughTraffic) {
      add(
        checks,
        'error-budget',
        'skip',
        `only ${buckets.total} requests; need ${thresholds.minRequests} for a stable rate`,
      );
    } else {
      const rate = ratio(buckets.fiveXx, buckets.total);
      add(
        checks,
        'error-budget',
        rate > thresholds.max5xxRate ? 'fail' : 'pass',
        `5xx ${formatRate(rate)} (${buckets.fiveXx}/${buckets.total})`,
      );
    }

    const watch = (id: string, count: number, threshold: number, label: string): void => {
      if (!enoughTraffic) {
        add(checks, id, 'skip', `${label} needs ${thresholds.minRequests} requests`);
        return;
      }
      const rate = ratio(count, buckets.total);
      add(
        checks,
        id,
        rate > threshold ? (flags.strict ? 'fail' : 'warn') : 'pass',
        `${label} ${formatRate(rate)} (${count}/${buckets.total}), watch > ${formatRate(threshold)}`,
      );
    };

    watch('auth-failures', buckets.authFailures, thresholds.max401Rate, '401');
    watch('payment-required', buckets.paymentRequired, thresholds.max402Rate, '402');
    watch('validation', buckets.validation, thresholds.max422Rate, '422');

    if (buckets.webhookTotal === 0) {
      add(checks, 'webhook', 'skip', 'no webhook deliveries in this metrics window');
    } else if (buckets.webhookFailures > 0) {
      add(
        checks,
        'webhook',
        buckets.webhook5xx > 0 ? 'fail' : 'warn',
        `${buckets.webhookFailures}/${buckets.webhookTotal} webhook deliveries returned 4xx/5xx` +
          (buckets.webhook5xx > 0
            ? ` (${buckets.webhook5xx} are 5xx)`
            : ' (invalid signatures or payloads)'),
      );
    } else {
      add(checks, 'webhook', 'pass', `${buckets.webhookTotal} webhook deliveries accepted`);
    }

    add(
      checks,
      'queue-depth',
      snapshot.queueDepth > thresholds.maxQueueDepth ? 'fail' : 'pass',
      `queue depth ${snapshot.queueDepth} (limit ${thresholds.maxQueueDepth})`,
    );

    if (
      snapshot.sloCompliant === false &&
      ratio(buckets.fiveXx, buckets.total) <= thresholds.max5xxRate
    ) {
      add(
        checks,
        'slo-health',
        'warn',
        'reported slo_compliant=false because both backends count 4xx in error_rate; 5xx is within budget',
      );
    } else {
      add(checks, 'slo-health', 'pass', 'reported availability agrees with the 5xx budget');
    }
  }

  if (input.baseline !== undefined) {
    if (!input.baseline.ok || input.baseline.status !== 200) {
      add(
        checks,
        'baseline',
        'warn',
        `Python baseline unavailable: ${input.baseline.error ?? `HTTP ${input.baseline.status}`}`,
      );
    } else {
      try {
        const baseline = parseMetricsSnapshot(input.baseline.body);
        const node5xx =
          snapshot === undefined ? 0 : ratio(snapshot.buckets.fiveXx, snapshot.buckets.total);
        const baseline5xx = ratio(baseline.buckets.fiveXx, baseline.buckets.total);
        const drift = node5xx - baseline5xx;
        add(
          checks,
          'baseline',
          drift > thresholds.baselineTolerance ? 'warn' : 'pass',
          `5xx drift ${formatRate(drift)} vs Python (${formatRate(node5xx)} vs ${formatRate(baseline5xx)}), tolerance ${formatRate(thresholds.baselineTolerance)}`,
        );
      } catch (error) {
        add(
          checks,
          'baseline',
          'warn',
          `Python baseline unreadable: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  const ok = !checks.some(
    (check) => check.status === 'fail' || (flags.strict && check.status === 'warn'),
  );
  return { ok, checks };
}

/** Render a report without ever including tokens or response bodies. */
export function formatStabilizationReport(report: StabilizationReport): string[] {
  const lines = report.checks.map(
    (check) => `${check.status.toUpperCase().padEnd(4)} ${check.id}: ${check.detail}`,
  );
  const counts = report.checks.reduce(
    (acc, check) => {
      acc[check.status] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0, skip: 0 },
  );
  lines.push(
    `${report.ok ? 'PASS' : 'FAIL'} stabilization check: ` +
      `${counts.pass} passed, ${counts.warn} warning(s), ${counts.fail} failure(s), ${counts.skip} skipped`,
  );
  return lines;
}

async function probe(
  url: string,
  token: string | undefined,
  accept: string,
  timeoutMs: number,
): Promise<ProbeResult> {
  const headers: Record<string, string> = { Accept: accept };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    if (accept.includes('json')) {
      let body: unknown;
      try {
        body = text.length > 0 ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      return { ok: true, status: response.status, body };
    }
    return { ok: true, status: response.status, text };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function booleanEnv(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  if (/^(1|true|yes|on)$/i.test(raw.trim())) return true;
  if (/^(0|false|no|off)$/i.test(raw.trim())) return false;
  throw new Error(`Invalid ${key}: expected a boolean, received "${raw}".`);
}

function readNumberEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  bounds: { min?: number; max?: number } = {},
): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ${key}: expected a number, received "${raw}".`);
  }
  if (bounds.min !== undefined && value < bounds.min) {
    throw new Error(`Invalid ${key}: must be >= ${bounds.min}.`);
  }
  if (bounds.max !== undefined && value > bounds.max) {
    throw new Error(`Invalid ${key}: must be <= ${bounds.max}.`);
  }
  return value;
}

export interface StabilizationConfig {
  readonly nodeBaseUrl: string;
  readonly bearerToken?: string | undefined;
  readonly pythonBaseUrl?: string | undefined;
  readonly pythonBearerToken?: string | undefined;
  readonly json: boolean;
  readonly timeoutMs: number;
  readonly thresholds: StabilizationThresholds;
  readonly flags: StabilizationFlags;
}

class HelpRequested extends Error {}

export function readStabilizationConfig(
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv.slice(2),
): StabilizationConfig {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      help: { type: 'boolean', short: 'h' },
      json: { type: 'boolean' },
      'base-url': { type: 'string' },
      'python-url': { type: 'string' },
    },
    allowPositionals: false,
  });

  if (values.help) {
    throw new HelpRequested();
  }

  const nodeBaseUrl = values['base-url'] ?? env.STABILIZATION_BASE_URL ?? 'http://127.0.0.1:8000';
  const pythonBaseUrl = values['python-url'] ?? env.STABILIZATION_PYTHON_BASE_URL;
  const bearerToken = env.STABILIZATION_BEARER_TOKEN;
  const pythonBearerToken = env.STABILIZATION_PYTHON_BEARER_TOKEN ?? bearerToken;

  return {
    nodeBaseUrl: nodeBaseUrl.replace(/\/+$/, ''),
    bearerToken,
    pythonBaseUrl: pythonBaseUrl?.replace(/\/+$/, ''),
    pythonBearerToken,
    json: values.json ?? false,
    timeoutMs: readNumberEnv(env, 'STABILIZATION_TIMEOUT_MS', 15_000, { min: 1 }),
    thresholds: {
      max5xxRate: readNumberEnv(
        env,
        'STABILIZATION_MAX_5XX_RATE',
        DEFAULT_STABILIZATION_THRESHOLDS.max5xxRate,
        { min: 0, max: 1 },
      ),
      max401Rate: readNumberEnv(
        env,
        'STABILIZATION_MAX_401_RATE',
        DEFAULT_STABILIZATION_THRESHOLDS.max401Rate,
        { min: 0, max: 1 },
      ),
      max402Rate: readNumberEnv(
        env,
        'STABILIZATION_MAX_402_RATE',
        DEFAULT_STABILIZATION_THRESHOLDS.max402Rate,
        { min: 0, max: 1 },
      ),
      max422Rate: readNumberEnv(
        env,
        'STABILIZATION_MAX_422_RATE',
        DEFAULT_STABILIZATION_THRESHOLDS.max422Rate,
        { min: 0, max: 1 },
      ),
      maxQueueDepth: readNumberEnv(
        env,
        'STABILIZATION_MAX_QUEUE_DEPTH',
        DEFAULT_STABILIZATION_THRESHOLDS.maxQueueDepth,
        { min: 0 },
      ),
      minRequests: readNumberEnv(
        env,
        'STABILIZATION_MIN_REQUESTS',
        DEFAULT_STABILIZATION_THRESHOLDS.minRequests,
        { min: 1 },
      ),
      baselineTolerance: readNumberEnv(
        env,
        'STABILIZATION_BASELINE_TOLERANCE',
        DEFAULT_STABILIZATION_THRESHOLDS.baselineTolerance,
        { min: 0, max: 1 },
      ),
    },
    flags: {
      allowDegraded: booleanEnv(env, 'STABILIZATION_ALLOW_DEGRADED', false),
      allowSqlite: booleanEnv(env, 'STABILIZATION_ALLOW_SQLITE', false),
      allowLocalAuth: booleanEnv(env, 'STABILIZATION_ALLOW_LOCAL_AUTH', false),
      strict: booleanEnv(env, 'STABILIZATION_STRICT', false),
    },
  };
}

export const STABILIZATION_USAGE = `Usage: npm run stabilize -- [options]

Read-only post-cutover stabilization check for the Express backend.

Options:
  -h, --help            Show this help
      --json            Print the report as JSON
      --base-url URL    Express base URL (default STABILIZATION_BASE_URL or http://127.0.0.1:8000)
      --python-url URL  Optional Python canary for a 5xx baseline comparison

Environment:
  STABILIZATION_BEARER_TOKEN       service token for readiness and metrics
  STABILIZATION_PYTHON_BEARER_TOKEN  Python token (defaults to the Node token)
  STABILIZATION_ALLOW_DEGRADED     allow a degraded readiness report
  STABILIZATION_ALLOW_SQLITE       allow the SQLite fallback (local verification only)
  STABILIZATION_ALLOW_LOCAL_AUTH   allow local development auth (local verification only)
  STABILIZATION_STRICT             treat warnings as failures
  STABILIZATION_MIN_REQUESTS       sample floor for rate checks (default 100)
  STABILIZATION_MAX_5XX_RATE       default 0.001 (99.9% availability)
  STABILIZATION_MAX_401_RATE       default 0.02
  STABILIZATION_MAX_402_RATE       default 0.05
  STABILIZATION_MAX_422_RATE       default 0.02
  STABILIZATION_MAX_QUEUE_DEPTH    default 50
  STABILIZATION_BASELINE_TOLERANCE default 0.005
  STABILIZATION_TIMEOUT_MS         default 15000

Thresholds: ${formatThresholds({
  ...DEFAULT_STABILIZATION_THRESHOLDS,
})}

Exit codes: 0 no failures, 1 hard failure, 2 usage error.`;

/** Execute the probes and return the report. */
export async function runStabilization(config: StabilizationConfig): Promise<StabilizationReport> {
  const [liveness, readiness, metrics, prometheus, baseline] = await Promise.all([
    probe(`${config.nodeBaseUrl}/health`, undefined, 'application/json', config.timeoutMs),
    probe(
      `${config.nodeBaseUrl}/api/health/ready`,
      config.bearerToken,
      'application/json',
      config.timeoutMs,
    ),
    probe(
      `${config.nodeBaseUrl}/api/metrics`,
      config.bearerToken,
      'application/json',
      config.timeoutMs,
    ),
    probe(`${config.nodeBaseUrl}/api/metrics`, config.bearerToken, 'text/plain', config.timeoutMs),
    config.pythonBaseUrl
      ? probe(
          `${config.pythonBaseUrl}/api/metrics`,
          config.pythonBearerToken,
          'application/json',
          config.timeoutMs,
        )
      : Promise.resolve(undefined),
  ]);

  return evaluateStabilization({
    liveness,
    readiness,
    metrics,
    prometheus,
    baseline,
    thresholds: config.thresholds,
    flags: config.flags,
  });
}

export async function runStabilizationCli(
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv.slice(2),
  stdout: (line: string) => void = console.log,
  stderr: (line: string) => void = console.error,
): Promise<number> {
  let config: StabilizationConfig;
  try {
    config = readStabilizationConfig(env, argv);
  } catch (error) {
    if (error instanceof HelpRequested) {
      stdout(STABILIZATION_USAGE);
      return 0;
    }
    stderr(error instanceof Error ? error.message : String(error));
    stderr('');
    stderr(STABILIZATION_USAGE);
    return 2;
  }

  const report = await runStabilization(config);
  if (config.json) {
    const payload = {
      ok: report.ok,
      base_url: config.nodeBaseUrl,
      baseline_url: config.pythonBaseUrl ?? null,
      thresholds: config.thresholds,
      checks: report.checks,
    };
    const line = JSON.stringify(payload, null, 2);
    (report.ok ? stdout : stderr)(line);
  } else {
    stdout('RecruitAI stabilization check');
    stdout(`  Node:     ${config.nodeBaseUrl}`);
    if (config.pythonBaseUrl) stdout(`  Baseline: ${config.pythonBaseUrl}`);
    stdout(
      `  Mode:     ${config.flags.strict ? 'strict' : 'standard'} (${formatThresholds(config.thresholds)})`,
    );
    stdout('');
    const write = report.ok ? stdout : stderr;
    for (const line of formatStabilizationReport(report)) write(line);
  }

  return report.ok ? 0 : 1;
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  void runStabilizationCli().then((code) => {
    process.exitCode = code;
  });
}
