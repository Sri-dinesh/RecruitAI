#!/usr/bin/env node
/**
 * Read-only parity check between the running FastAPI and Node/Express backends.
 *
 * It compares HTTP status codes, response content types and the JSON *shape*
 * (key sets and value types) for the contracts clients depend on. With
 * `PARITY_STRICT_DATA=true` it also compares array lengths and scalar values
 * (volatile keys such as timestamps are ignored).
 *
 * Both backends must be pointed at the same database and the same tenant for
 * the strict data mode to be meaningful. The default shape mode is still
 * useful with separate databases, as long as the sample rows exist.
 *
 * Usage:
 *   node scripts/parity-check.mjs
 *   PARITY_BEARER_TOKEN=... node scripts/parity-check.mjs
 *   PARITY_STRICT_DATA=true node scripts/parity-check.mjs
 *
 * Environment:
 *   PYTHON_BASE_URL       default http://127.0.0.1:8000
 *   NODE_BASE_URL         default http://127.0.0.1:8001
 *   PARITY_BEARER_TOKEN   bearer token for both backends
 *   PYTHON_BEARER_TOKEN   per-backend override
 *   NODE_BEARER_TOKEN     per-backend override
 *   PARITY_STRICT_DATA    "true" to compare values and array lengths
 *   PARITY_CHECK_READY    "false" to skip the authenticated readiness probe
 *   PARITY_TIMEOUT_MS     per-request timeout, default 15000
 *
 * Exit codes: 0 = parity, 1 = drift or request failure, 2 = usage error.
 */

const PYTHON_BASE_URL = process.env.PYTHON_BASE_URL ?? 'http://127.0.0.1:8000';
const NODE_BASE_URL = process.env.NODE_BASE_URL ?? 'http://127.0.0.1:8001';
const SHARED_TOKEN = process.env.PARITY_BEARER_TOKEN ?? '';
const PYTHON_TOKEN = process.env.PYTHON_BEARER_TOKEN ?? SHARED_TOKEN;
const NODE_TOKEN = process.env.NODE_BEARER_TOKEN ?? SHARED_TOKEN;
const STRICT_DATA = /^(1|true|yes)$/i.test(process.env.PARITY_STRICT_DATA ?? '');
const CHECK_READY = !/^(0|false|no)$/i.test(process.env.PARITY_CHECK_READY ?? 'true');
const TIMEOUT_MS = Number(process.env.PARITY_TIMEOUT_MS ?? '15000');

const VOLATILE_KEYS = new Set([
  'timestamp',
  'uptime_seconds',
  'audit_timestamp',
  'request_id',
  'created_at',
  'updated_at',
  'last_sign_in_at',
  'occurred_at',
  'booked_at',
  'scheduled_at',
  'current_period_end',
  'check_url',
  'stream_url',
  // Process-local RED maps: both backends collect their own request history.
  'latencies_ms',
  'status_breakdown',
]);

const CHECKS = [
  { name: 'root', path: '/' },
  { name: 'liveness /health', path: '/health' },
  { name: 'liveness /api/health', path: '/api/health' },
  { name: 'payments plans', path: '/api/payments/plans' },
  { name: 'users/me', path: '/api/users/me', auth: true },
  { name: 'sessions', path: '/api/sessions', auth: true },
  { name: 'analytics summary', path: '/api/analytics/summary', auth: true },
  { name: 'analytics pipeline', path: '/api/analytics/pipeline', auth: true },
  {
    name: 'analytics candidates-over-time',
    path: '/api/analytics/candidates-over-time?days=30',
    auth: true,
  },
  { name: 'analytics match-distribution', path: '/api/analytics/match-distribution', auth: true },
  { name: 'analytics top-skills', path: '/api/analytics/top-skills?top_n=12', auth: true },
  { name: 'analytics hiring-velocity', path: '/api/analytics/hiring-velocity', auth: true },
  { name: 'analytics jobs-summary', path: '/api/analytics/jobs-summary', auth: true },
  {
    name: 'analytics recent-activity',
    path: '/api/analytics/recent-activity?limit=20',
    auth: true,
  },
  { name: 'payments status', path: '/api/payments/status', auth: true },
  { name: 'payments transactions', path: '/api/payments/transactions', auth: true },
  { name: 'email history', path: '/api/email/history?limit=20', auth: true },
  { name: 'email stats', path: '/api/email/stats', auth: true },
  { name: 'privacy bias audit', path: '/api/privacy/bias-audit', auth: true },
  { name: 'metrics (JSON)', path: '/api/metrics', auth: true },
  {
    name: 'metrics (Prometheus)',
    path: '/api/metrics',
    auth: true,
    accept: 'text/plain',
    prometheus: true,
  },
  ...(CHECK_READY ? [{ name: 'readiness', path: '/api/health/ready', auth: true }] : []),
];

const STABLE_METRICS = [
  'recruitai_requests_total',
  'recruitai_queue_depth',
  'recruitai_tokens_total',
  'recruitai_llm_cost_usd',
];

function usage() {
  const scripts =
    process.env.npm_lifecycle_event === 'parity:check'
      ? 'npm run parity:check'
      : 'node scripts/parity-check.mjs';
  console.log(`Usage: ${scripts} [--help]

Compares the FastAPI and Node/Express backends read-only.

  PYTHON_BASE_URL     FastAPI base URL (default ${PYTHON_BASE_URL})
  NODE_BASE_URL       Express base URL (default ${NODE_BASE_URL})
  PARITY_BEARER_TOKEN bearer token for both (or PYTHON_BEARER_TOKEN / NODE_BEARER_TOKEN)
  PARITY_STRICT_DATA  compare scalar values and array lengths (default false)
  PARITY_CHECK_READY  set to "false" to skip /api/health/ready (default true)
  PARITY_TIMEOUT_MS   per-request timeout (default ${TIMEOUT_MS})

Exit codes: 0 parity, 1 drift, 2 usage error.`);
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function joinPath(path, key) {
  return path ? `${path}.${key}` : key;
}

/** Objects keyed by data (settings maps, candidate-id maps) are open by design. */
const OPEN_MAP_KEYS = new Set(['preferences', 'evaluations']);

function lastPathKey(path) {
  const segment = path.split('.').at(-1) ?? '';
  return segment.replace(/\[\d+\]$/, '');
}

function compareShape(python, node, path, failures, warnings) {
  const pythonType = typeOf(python);
  const nodeType = typeOf(node);

  // Nullable data fields (`null` on one side, a value on the other) are data
  // differences, not contract drift. Strict mode still reports them.
  if (pythonType === 'null' || nodeType === 'null') {
    if (pythonType !== nodeType) {
      const message = `${path || '<root>'}: nullable ${pythonType} (python) vs ${nodeType} (node)`;
      if (STRICT_DATA) failures.push(message);
      else warnings.push(message);
    }
    return;
  }

  if (pythonType !== nodeType) {
    failures.push(`${path || '<root>'}: type ${pythonType} (python) vs ${nodeType} (node)`);
    return;
  }

  if (pythonType === 'object') {
    const pythonKeys = Object.keys(python).sort();
    const nodeKeys = Object.keys(node).sort();
    const missing = pythonKeys.filter((key) => !nodeKeys.includes(key));
    const extra = nodeKeys.filter((key) => !pythonKeys.includes(key));
    const openMap = OPEN_MAP_KEYS.has(lastPathKey(path));
    if (missing.length > 0) {
      const message = `${path || '<root>'}: node is missing ${missing.join(', ')}`;
      if (openMap) warnings.push(message);
      else failures.push(message);
    }
    if (extra.length > 0) {
      const message = `${path || '<root>'}: node adds ${extra.join(', ')}`;
      if (openMap) warnings.push(message);
      else failures.push(message);
    }
    for (const key of pythonKeys.filter((candidate) => nodeKeys.includes(candidate))) {
      if (VOLATILE_KEYS.has(key)) continue;
      compareShape(python[key], node[key], joinPath(path, key), failures, warnings);
    }
    return;
  }

  if (pythonType === 'array') {
    if (python.length !== node.length) {
      const message = `${path || '<root>'}: length ${python.length} (python) vs ${node.length} (node)`;
      if (STRICT_DATA) failures.push(message);
      else warnings.push(message);
    }
    const sampleSize = Math.min(python.length, node.length);
    const indexes = STRICT_DATA ? [...Array(sampleSize).keys()] : sampleSize > 0 ? [0] : [];
    for (const index of indexes) {
      compareShape(python[index], node[index], `${path}[${index}]`, failures, warnings);
    }
    return;
  }

  if (STRICT_DATA && python !== node) {
    failures.push(
      `${path}: value ${JSON.stringify(python)} (python) vs ${JSON.stringify(node)} (node)`,
    );
  }
}

function stableValues(check, pythonBody, nodeBody, failures) {
  if (check.name === 'root') {
    if (pythonBody.message !== nodeBody.message) {
      failures.push(
        `root.message: ${JSON.stringify(pythonBody.message)} (python) vs ${JSON.stringify(nodeBody.message)} (node)`,
      );
    }
    return;
  }

  if (check.name === 'liveness /health' || check.name === 'liveness /api/health') {
    for (const key of ['status', 'version']) {
      if (pythonBody[key] !== nodeBody[key]) {
        failures.push(
          `${key}: ${JSON.stringify(pythonBody[key])} (python) vs ${JSON.stringify(nodeBody[key])} (node)`,
        );
      }
    }
    return;
  }

  if (check.name === 'payments plans') {
    const ids = (body) => (Array.isArray(body) ? body.map((plan) => plan?.id) : []);
    if (JSON.stringify(ids(pythonBody)) !== JSON.stringify(ids(nodeBody))) {
      failures.push(
        `plan ids drifted: ${JSON.stringify(ids(pythonBody))} vs ${JSON.stringify(ids(nodeBody))}`,
      );
      return;
    }
    for (let index = 0; index < ids(pythonBody).length; index += 1) {
      for (const key of ['amount', 'currency', 'interval', 'candidate_quota']) {
        if (pythonBody[index]?.[key] !== nodeBody[index]?.[key]) {
          failures.push(
            `plans[${index}].${key}: ${JSON.stringify(pythonBody[index]?.[key])} (python) vs ${JSON.stringify(nodeBody[index]?.[key])} (node)`,
          );
        }
      }
    }
  }
}

async function callBackend(baseUrl, check, token) {
  const headers = { Accept: check.accept ?? 'application/json' };
  if (check.auth && token) headers.Authorization = `Bearer ${token}`;

  const url = new URL(check.path, baseUrl).toString();
  const response = await fetch(url, {
    method: 'GET',
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();

  if (check.prometheus) {
    return { status: response.status, contentType, text };
  }

  let body;
  try {
    body = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, contentType, body };
}

async function runCheck(check, pythonToken, nodeToken) {
  const failures = [];
  const warnings = [];
  const skipped = check.auth && !pythonToken && !nodeToken;

  if (skipped) {
    return { check, skipped: true, failures, warnings };
  }

  let pythonResponse;
  let nodeResponse;
  try {
    [pythonResponse, nodeResponse] = await Promise.all([
      callBackend(PYTHON_BASE_URL, check, pythonToken),
      callBackend(NODE_BASE_URL, check, nodeToken),
    ]);
  } catch (error) {
    failures.push(`request failed: ${error instanceof Error ? error.message : String(error)}`);
    return { check, skipped: false, failures, warnings };
  }

  if (pythonResponse.status !== nodeResponse.status) {
    failures.push(`status: ${pythonResponse.status} (python) vs ${nodeResponse.status} (node)`);
    return { check, skipped: false, failures, warnings };
  }

  if (check.prometheus) {
    for (const metric of STABLE_METRICS) {
      if (!pythonResponse.text.includes(metric))
        failures.push(`python output is missing ${metric}`);
      if (!nodeResponse.text.includes(metric)) failures.push(`node output is missing ${metric}`);
    }
    return { check, skipped: false, failures, warnings };
  }

  const pythonJson = /json/i.test(pythonResponse.contentType);
  const nodeJson = /json/i.test(nodeResponse.contentType);
  if (pythonJson !== nodeJson) {
    failures.push(
      `content-type: ${pythonResponse.contentType || '<empty>'} (python) vs ${nodeResponse.contentType || '<empty>'} (node)`,
    );
    return { check, skipped: false, failures, warnings };
  }

  if (!pythonJson) {
    if (
      (pythonResponse.body === null) !== (nodeResponse.body === null) ||
      typeOf(pythonResponse.body) !== typeOf(nodeResponse.body)
    ) {
      failures.push('non-JSON response shape drifted');
    }
    return { check, skipped: false, failures, warnings };
  }

  compareShape(pythonResponse.body, nodeResponse.body, '', failures, warnings);
  if (failures.length === 0) {
    stableValues(check, pythonResponse.body, nodeResponse.body, failures);
  }
  return { check, skipped: false, failures, warnings };
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    usage();
    return 0;
  }

  if (!Number.isFinite(TIMEOUT_MS) || TIMEOUT_MS <= 0) {
    console.error('PARITY_TIMEOUT_MS must be a positive number.');
    return 2;
  }

  console.log('RecruitAI backend parity check');
  console.log(`  Python: ${PYTHON_BASE_URL}`);
  console.log(`  Node:   ${NODE_BASE_URL}`);
  console.log(
    `  Mode:   ${STRICT_DATA ? 'strict data' : 'shape only (set PARITY_STRICT_DATA=true for values)'}`,
  );
  if (!PYTHON_TOKEN && !NODE_TOKEN) {
    console.log('  Auth:   no token supplied — authenticated checks will be skipped');
  }
  console.log('');

  const results = [];
  for (const check of CHECKS) {
    const result = await runCheck(check, PYTHON_TOKEN, NODE_TOKEN);
    results.push(result);
    if (result.skipped) {
      console.log(`SKIP  ${check.path}  (no bearer token)`);
      continue;
    }
    const marker = result.failures.length === 0 ? 'PASS' : 'FAIL';
    console.log(`${marker}  ${check.path}`);
    for (const failure of result.failures) console.log(`      - ${failure}`);
    for (const warning of result.warnings) console.log(`      ~ ${warning}`);
  }

  const passed = results.filter((result) => !result.skipped && result.failures.length === 0).length;
  const failed = results.filter((result) => !result.skipped && result.failures.length > 0).length;
  const skipped = results.filter((result) => result.skipped).length;

  console.log('');
  console.log(`Summary: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  return failed === 0 ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
