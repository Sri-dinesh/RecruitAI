# RecruitAI Service Level Objectives (SLOs) & Reliability Targets

## 1. Executive Summary & Philosophy

RecruitAI is an enterprise autonomous recruitment orchestration platform. High availability, deterministic low-latency interactions, and zero-loss resume ingestion are mission-critical. This document defines our formal Service Level Indicators (SLIs), Service Level Objectives (SLOs), and Error Budgets for production operations (OPS-1).

---

## 2. Core Service Level Indicators & Objectives

| User Journey / Service Area    | Service Level Indicator (SLI)                                | Service Level Objective (SLO) | Window          | Measurement Mechanism                                                                                                                                        |
| :----------------------------- | :----------------------------------------------------------- | :---------------------------- | :-------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API Availability**           | Successful non-5xx responses / total requests                | **>= 99.9%** availability     | 30-Day Rolling  | In-process RED metrics (`recruitai_requests_total`); derive 5xx from `status_breakdown` (the `slo_health.error_rate` field also counts 4xx in both backends) |
| **Chat Acknowledgment**        | Time between client `POST /api/chat` and `HTTP 202 Accepted` | **p99 < 2.0s**                | 7-Day Rolling   | API Controller Tracing (`trace_span`)                                                                                                                        |
| **Agent Reasoning Turnaround** | Time from job enqueue to final SSE completion                | **p95 < 30.0s**               | 7-Day Rolling   | Async Job Queue telemetry (`job_manager`)                                                                                                                    |
| **Resume Ingestion**           | End-to-end parsing & embedding per document (<15MB)          | **p95 < 5.0s** per resume     | 7-Day Rolling   | Ingestion pipeline metrics (`routes_ingest`)                                                                                                                 |
| **Database Query Ping**        | Database health ping latency                                 | **p99 < 50ms**                | 24-Hour Rolling | Authenticated readiness probe (`/api/health/ready`)                                                                                                          |
| **LLM Provider Availability**  | Multi-model failover success rate                            | **>= 99.95%**                 | 30-Day Rolling  | Circuit Breaker telemetry (`ModelCircuitBreaker`)                                                                                                            |

The contract-level SLOs are enforced by the Phase 24 load suite
(`backend/scripts/load/traffic-mix.js`): `recruitai_enqueue_duration`
p99 < 2 s, `recruitai_agent_turnaround_duration` p95 < 30 s,
`recruitai_sse_attach_duration` p95 < 1 s and `recruitai_ingest_duration`
p95 < 5 s. A scheduled run fails when any of these thresholds is crossed.
Availability, DB-ping and failover rates remain 30-day telemetry aggregates,
not single-run assertions.

---

## 3. Error Budget & Burn Rate Alerting

### Error Budget Allocation (30-Day Window)

At **99.9% Availability**, the error budget permits:

- **0.1%** non-transient server errors.
- Maximum allowable unplanned downtime: **43.2 minutes per month** (or 10.1 minutes per week).

### Multi-Window Multi-Burn Rate Alert Policy

| Severity          | Burn Rate | Budget Consumed | Short Window (1h)         | Long Window (6h)           | Notification Channel   | Pager Protocol                        |
| :---------------- | :-------- | :-------------- | :------------------------ | :------------------------- | :--------------------- | :------------------------------------ |
| **P1 - Critical** | **14.4x** | 2% in 1 hour    | 1 Hour Error Rate > 1.44% | 6 Hour Error Rate > 1.44%  | PagerDuty + Call Tree  | Immediate page on-call engineer       |
| **P2 - High**     | **6.0x**  | 5% in 6 hours   | 1 Hour Error Rate > 0.60% | 6 Hour Error Rate > 0.60%  | Slack #alerts-critical | Page on-call if unacknowledged in 15m |
| **P3 - Elevated** | **1.0x**  | 10% in 3 days   | 6 Hour Error Rate > 0.10% | 24 Hour Error Rate > 0.10% | Slack #alerts-dev      | Next business day review              |

---

## 4. Tenant Isolation & Fair-Use Limits

1. **Chat Ingestion Limits**: 60 requests / minute per recruiter workspace.
2. **Batch Upload Limits**: Max 10 resumes per batch, max 15MB per file.
3. **Workspace Reset**: 1 reset per 30 seconds per tenant (`_LAST_RESET_REQUESTS`).
4. **LLM Quota Defense**: Dynamic circular failover across 5 Gemini models (`gemini-2.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.7-flash`).

### Tiered fair-use enforcement (Phase 23)

The authenticated API enforces a sliding-window quota per user **and** per
client IP (IP budget = user budget × `RATE_LIMIT_IP_MULTIPLIER`, default `4`).
The separate global IP limiter remains the coarse pre-auth guard.

| Tier       | Applies to                                                  | Default / minute |
| :--------- | :---------------------------------------------------------- | :--------------- |
| `chat`     | `POST /api/chat` turns (SSE status reads use `read`)        | 60               |
| `email`    | Email draft/dispatch mutations                              | 20               |
| `payments` | Order, verify, consume-credit mutations                     | 30               |
| `ingest`   | Resume/JD upload requests                                   | 30               |
| `evaluate` | Candidate evaluation, status changes, ATS export            | 30               |
| `write`    | Other authenticated mutations (sessions, privacy, reports…) | 120              |
| `read`     | Authenticated reads, polling and list endpoints             | 600              |

Every tier is overridable with `RATE_LIMIT_<TIER>_MAX`; the window is
`RATE_LIMIT_TIER_WINDOW_SECONDS` (default `60`). Redis sorted sets make the
window fleet-wide; without Redis the quota applies per instance. A rejected
request returns `429` with `Retry-After` and
`{ "detail": "...", "code": "rate_limit_exceeded", "retry_after": <seconds> }`.

### Cost-safety limits (Phase 23)

- **JD cache**: identical raw JD text + filename reuses the parsed structure for
  `CACHE_JD_PARSE_TTL_SECONDS` (default `3600`), fleet-wide when Redis is
  configured.
- **LLM concurrency**: at most `LLM_MAX_CONCURRENT_CALLS` (default `8`) Gemini
  attempts run fleet-wide. A caller waits up to `LLM_BUDGET_ACQUIRE_TIMEOUT_MS`
  (default `1500`) for a slot, then degrades to deterministic processing.
- **Cost anomaly**: crossing `LLM_COST_ALARM_THRESHOLD_USD` (default `$1`) in a
  rolling `LLM_COST_ALARM_WINDOW_SECONDS` (default `300`) window emits one
  `llm_cost_anomaly` telemetry event and a warning log per window.
- **Outbound deadlines**: Tavily (`TAVILY_TIMEOUT_MS`, 8 s), Razorpay
  (`RAZORPAY_TIMEOUT_MS`, 10 s) and SMTP
  (`SMTP_CONNECTION_TIMEOUT_MS`/`SMTP_GREETING_TIMEOUT_MS`, 10 s;
  `SMTP_SOCKET_TIMEOUT_MS`, 20 s). Uploads stop buffering at 15 MB per file, and
  SSE streams send keepalives every `CHAT_SSE_HEARTBEAT_SECONDS` (15 s) and
  close after `CHAT_SSE_IDLE_TIMEOUT_SECONDS` (300 s) without an event.

### Dependency breakers and graceful degradation (Phase 24)

Every external dependency has its own circuit breaker. State is process-local by
default and fleet-wide in Redis when `REDIS_URL` is configured
(`recruitai:breaker:<dependency>:<operation>:*`). Trip and recovery transitions
emit a structured `dependency_breaker:<dependency>` event and the Prometheus
gauges below. `RESILIENCE_BREAKERS_ENABLED=false` bypasses breakers entirely for
incident triage.

| Dependency | Failure threshold | Cooldown | Degraded behavior                                                                   |
| :--------- | :---------------- | :------- | :---------------------------------------------------------------------------------- |
| `gemini`   | 3                 | 60 s     | Rotate to the next model; when all are open, deterministic/fallback responses       |
| `tavily`   | 3                 | 60 s     | Deterministic JD/salary/skill fallbacks; no live web intelligence                   |
| `smtp`     | 3                 | 60 s     | Return the simulated/failed dispatch contract; never hang the request               |
| `razorpay` | 3                 | 60 s     | Production fails fast with a 5xx/503; development uses the mock order path          |
| `postgres` | 5                 | 30 s     | New transactions short-circuit; routes return `503` + `Retry-After`                 |
| `redis`    | 3                 | 15 s     | In-memory caches/limits/breakers; async chat enqueue returns `503` in degraded mode |

Only connectivity, timeout, `5xx` and `429`-class failures count toward a trip;
validation and business errors never open a circuit. Readiness probes refresh
the Postgres and Redis breaker state, so an observed outage is shared with the
request path.

- **Redis degraded mode**: with `REDIS_DEGRADED_MODE_ENABLED=true`, a configured
  but unreachable Redis keeps readiness at `200 degraded` and serves sync chat
  from in-memory state. Async chat needs the fleet queue, so `POST /api/chat`
  with `async_mode` returns `503` and `Retry-After: 5` instead of waiting on a
  dead connection. With the flag unset (default), readiness returns `503` and
  traffic drains away, matching Phase 21 behavior.
- **LLM outage messages**: typed pool failures (`AllProvidersFailedError`,
  `LlmBudgetExceededError`, `CircuitOpenError`) are replaced with one stable,
  PII-free sentence before they reach chat/SSE/job payloads. Generic validation
  errors keep their historical text.
- **Tracing**: inbound W3C `traceparent` is adopted, one HTTP span is opened per
  request, and the context propagates through async enqueue payloads into agent
  turns, per-node spans, database calls (`db.*`) and external calls
  (`external.*`). Only method/route/status/ids/model names are recorded; prompts,
  resumes, candidate data, emails and tokens are filtered before they enter a
  span.

---

## 5. Automated Monitoring & Scraping

The Express backend exposes the **same metrics contract** the legacy FastAPI
service used, so existing dashboards, alerts and scrape configs keep working
through cutover:

- **Prometheus scrape**: `GET /api/metrics` with `Accept: text/plain` and an
  `Authorization: Bearer <token>` header (the route is authenticated).
- **Structured JSON telemetry**: `GET /api/metrics` with any non-`text/plain`
  `Accept` value.
- **Deep readiness probe**: `GET /api/health/ready` (alias `GET /health/ready`),
  authenticated.
- **Public liveness probe**: `GET /health` (alias `GET /api/health`).

Stable metric names (do not rename without updating alerting):

| Metric                                     | Type    | Meaning                                                                                   |
| :----------------------------------------- | :------ | :---------------------------------------------------------------------------------------- |
| `recruitai_requests_total`                 | counter | Requests by `endpoint` (matched route template) and `status`                              |
| `recruitai_queue_depth`                    | gauge   | Pending async chat jobs                                                                   |
| `recruitai_tokens_total`                   | counter | LLM tokens by `type="input"\|"output"`                                                    |
| `recruitai_llm_cost_usd`                   | counter | Estimated cumulative LLM cost in USD                                                      |
| `recruitai_dependency_circuit_state`       | gauge   | Breaker state per `dependency`: `0` closed, `1` half-open, `2` open                       |
| `recruitai_dependency_circuit_trips_total` | counter | Opens per `dependency` and `reason` (`failure_threshold`, `rate_limit`)                   |
| `recruitai_db_pool_connections`            | gauge   | Postgres connections per `role` (`primary`/`read`) and `state` (`total`/`idle`/`waiting`) |
| `recruitai_db_pool_size`                   | gauge   | Configured pool ceiling per `role`                                                        |

### Health and readiness semantics

- Liveness returns `200` with no dependency or topology data; it only proves
  the process can answer.
- Readiness checks database connectivity (latency + backend type), LLM provider
  configuration (model names only, never keys), and authentication mode.
- `200 healthy`: all checks passed.
- `200 degraded`: usable but operationally degraded — SQLite fallback in use,
  the LLM provider is unconfigured, or Redis is unreachable while
  `REDIS_DEGRADED_MODE_ENABLED=true`.
- `503 unhealthy`: the database ping failed, or a configured Redis is
  unreachable without degraded mode. The response exposes only the exception
  **type**, never the message, connection string or stack trace.

### Log correlation and audit records

- Every response carries `X-Request-ID`. A short, URL-safe inbound id is reused
  (gateway/trace propagation); otherwise a UUID is generated.
- Requests accept and echo W3C `traceparent`. Async chat jobs serialize the
  enqueue context into the job payload, so one trace spans HTTP → queue → agent
  nodes → database/external calls. Spans are logged as OpenTelemetry-shaped
  records and contain no prompt, resume or candidate text.
- Structured logs (one JSON object per line) carry
  `request_id`, and `user_id` / `tenant_id` / `session_id` once those are known.
  Errors before authentication still carry the request id.
- Sensitive actions emit `[AUDIT]` records with `audit_action`:
  `GDPR_ERASURE`, `GDPR_ACCOUNT_ERASURE`, and `WORKSPACE_RESET`. Payment changes
  remain auditable through the `credit_transactions` ledger.
- Metrics are exported per instance through a `prom-client` registry (Phase 21)
  with the stable metric names above, so Prometheus can sum/rate across
  replicas without a contract change. The JSON `/api/metrics` summary remains
  the in-process view used by `npm run stabilize`; aggregate at the gateway
  when you need fleet totals. Fleet-wide state (jobs, Tavily cache, circuit
  breakers, rate limits, reset throttle, retention lock) lives in Redis when
  `REDIS_URL` is configured; the in-memory implementations are development
  fallbacks only.

### Data-layer budgets (Phase 22)

- **Connection math.** Each instance opens one primary pool of `PG_POOL_MAX`
  (default `10`) and one read pool of `PG_READ_POOL_MAX` (defaults to the
  primary size). Size the fleet so `(PG_POOL_MAX + PG_READ_POOL_MAX) ×
instances + worker connections ≤` the pooler/pgBouncer ceiling. Leave at
  least 20% headroom for migrations and operator sessions. Alert on
  `recruitai_db_pool_connections{state="waiting"} > 0` for more than a scrape
  interval: callers queueing for a slot is saturation, not headroom.
- **Session timeouts.** Every pooled session starts with
  `statement_timeout=15000ms`, `idle_in_transaction_session_timeout=30000ms`
  and `transaction_timeout=10000ms`; `withTransaction()` re-applies the same
  values with `SET LOCAL` so transaction-pooling poolers cannot leak them.
  Transactions intentionally exclude LLM, Tavily, SMTP and Razorpay calls.
- **Read replica.** Set `DATABASE_READ_URL` to route heavy analytics scans to a
  replica. Unset means reads share the primary; an unusable read URL fails
  readiness rather than silently falling back. Ledger and payment paths always
  use the primary.
- **List bounds.** Tenant list endpoints accept `limit`/`offset` but clamp to
  `DB_LIST_MAX_LIMIT` (default `1000`), matching the implicit PostgREST cap
  the legacy backend ran under. Retention and tenant sweeps page with keyset cursors and
  process `DB_SWEEP_BATCH_SIZE` rows per round trip; multi-row inserts chunk at
  `DB_INSERT_BATCH_SIZE`. Both defaults are `500`.
- **Hot-read cache.** With `CACHE_HOT_READS_ENABLED=true`, credits
  (`CACHE_CREDITS_TTL_SECONDS`, default 15), subscription summaries
  (`CACHE_SUBSCRIPTION_TTL_SECONDS`, default 30) and analytics payloads
  (`CACHE_ANALYTICS_TTL_SECONDS`, default 30) may be served from Redis. Writes
  invalidate the tenant's credit/subscription keys after the primary commits.
  The cache is never consulted before a spend, top-up or ledger insert.
- **Payment idempotency.** `processed_events` claims one key per Razorpay
  payment id and one per webhook event id, retained for
  `PAYMENT_IDEMPOTENCY_TTL_SECONDS` (default 24 h). A duplicate verify or
  redelivery returns the stored subscription and balance without granting
  credits again.

### Load and resilience validation (Phase 24)

The k6 suite under `backend/scripts/load/` covers sustained load, soak,
spike and dependency-chaos profiles against a deployed target. It is a
scheduled/manual job (`.github/workflows/load.yml`), never a required check on
every commit. Contract targets, scenario sizing (10K active users ≈ 333 chat
turns/s) and every scaling lever are documented in
[`backend/scripts/load/README.md`](../backend/scripts/load/README.md).

During the cutover soak, `npm run stabilize` evaluates these signals from the
same metrics contract. Only the 5xx budget is a formal SLO; the rest are
migration watch thresholds that need judgement rather than automatic rollback.

| Signal           | Watch threshold | Hard failure?     | Notes                                                                    |
| :--------------- | :-------------- | :---------------- | :----------------------------------------------------------------------- |
| 5xx rate         | `<= 0.1%`       | Yes               | Availability SLO budget; derived from `status_breakdown`                 |
| 401 rate         | `<= 2%`         | No, unless strict | Bad/expired tokens are normal; a sustained spike means auth config drift |
| 402 rate         | `<= 5%`         | No, unless strict | Normal quota response; a spike means credits/pricing regressed           |
| 422 rate         | `<= 2%`         | No, unless strict | Normal client input; a spike means a validation contract mismatch        |
| Webhook 5xx      | `0`             | Yes               | Handler failure or unreadable payload path                               |
| Webhook 4xx      | `0`             | No                | Invalid signatures/payloads; confirm Razorpay and secret alignment       |
| Queue depth      | `<= 50`         | Yes               | Runbook 3 page threshold for chat backlog                                |
| SQLite fallback  | `0`             | Yes               | Production must be on PostgreSQL                                         |
| Local auth       | `0`             | Yes               | Development-only identity bypass                                         |
| Unconfigured LLM | `0`             | Warning           | Agent turns degrade; production preflight already requires a key         |

`npm run stabilize` also compares the Node 5xx rate with an optional legacy
Python canary (`--python-url` / `STABILIZATION_PYTHON_BASE_URL`) and warns on
drift during the cutover window.
Rates are compared, never absolute counters: each process has its own uptime
window. Below `STABILIZATION_MIN_REQUESTS` (default 100), rate checks are
skipped because a single request would look like a spike.

The reported `slo_health` object is preserved from the legacy backend and counts **4xx**
responses as errors, so `slo_compliant` can be false on a perfectly healthy
window that served 401/404/422 responses. Availability alerts and the
stabilization check use status buckets (`>= 500`) instead. Do not change the
`slo_health` shape during the migration; fix the accounting separately if the
product wants it.
