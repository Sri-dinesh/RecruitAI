# RecruitAI Backend — Node.js / Express / TypeScript

The canonical RecruitAI backend. The FastAPI implementation that preceded it
was archived on the `archive/fastapi-backend` branch and is no longer part of
the main tree. **Phases 1–24 are implemented**: scaffold, tooling, boot, typed
configuration with production gates, the auth/request-identity foundation,
Express app wiring with CORS and global error handling, the shared
validation/types contract layer, the Drizzle database access layer, the
structured logging/telemetry layer, the Gemini LLM routing layer with safety
gates, the document/resume/JD parsing plus matching services, payments/credits,
email tooling with outreach dispatch, history and stats, resume/JD ingestion
with campaign context hydration, the multi-agent supervisor graph with its 15
specialized nodes, the chat API with its async job queue and SSE streaming, the
remaining public route groups (sessions, candidate evaluation/ATS export, PDF
reports, analytics, user profile, and GDPR/privacy), the operational retention
scheduler and CLI, health/readiness and audit logging, the client-contract and
dual-run parity tooling, the deployment artifact and production preflight,
request limiting and log/metric export, the stabilization probe, and the
stateless core with Redis-backed jobs, caching, breakers, rate limits and
graceful drain.

## Status

| Area                                  | Status                                   |
| ------------------------------------- | ---------------------------------------- |
| Phase 1 — scaffold, tooling, boot     | ✅ complete                              |
| Phase 2 — config + production gates   | ✅ complete                              |
| Phase 3 — auth + request identity     | ✅ complete                              |
| Phase 4 — app wiring + error handling | ✅ complete                              |
| Phase 5 — validation + API contracts  | ✅ complete                              |
| Phase 6 — database access layer       | ✅ complete                              |
| Phase 7 — logging, context, telemetry | ✅ complete                              |
| Phase 8 — LLM routing + safety gates  | ✅ complete                              |
| Phase 9 — parsing + matching services | ✅ complete                              |
| Phase 10 — payments + credits         | ✅ complete                              |
| Phase 11 — email + outreach           | ✅ complete                              |
| Phase 12 — ingest + campaign context  | ✅ complete                              |
| Phase 13 — multi-agent graph + nodes  | ✅ complete                              |
| Phase 14 — chat + jobs + SSE          | ✅ complete                              |
| Phase 15 — remaining public API       | ✅ complete                              |
| Phase 16 — operational retention      | ✅ complete                              |
| Phase 17 — observability and health   | ✅ complete                              |
| Phase 18 — tests, parity, cutover     | ✅ complete                              |
| Phase 19 — deploy + hardening         | ✅ complete                              |
| Phase 20 — stabilization probe        | ✅ tooling complete (soak after cutover) |
| Phase 21 — stateless core             | ✅ complete                              |
| Phase 22 — data layer at scale        | ✅ complete                              |
| Phase 23 — streaming and fair use     | ✅ complete                              |
| Phase 24 — reliability and load       | ✅ complete                              |

## Commands

```bash
npm install          # install dependencies
npm run dev          # tsx watch src/main.ts (development)
npm run build        # tsc → dist/
npm start            # node dist/main.js (production)
npm run preflight    # validate a production deployment environment
npm run stabilize    # read-only post-cutover error/auth/payment/queue check
npm run typecheck    # tsc --noEmit (src + tests)
npm test             # node:test via tsx
npm run test:integration:redis # two managers against a real Redis (opt-in)
npm run test:integration:postgres # real-server pool saturation proof (opt-in)
npm run parity:check # read-only Express vs deployed/archived FastAPI comparison
npm run lint         # eslint .
npm run format       # prettier --write .
npm run format:check # prettier --check .
```

Default server: `http://localhost:8000` (`HOST` / `PORT` from the environment).

## Layout

```
src/
├── app.ts          # Express app factory
├── main.ts         # bootstrap / entrypoint
├── routes/         # api/routes_*.py equivalents (health, metrics, payments, email, chat)
│                   #   + sessions, evaluate/ATS, reports, analytics, users, privacy (Phase 15 ✅)
├── config/         # app/core/config.py            (Phase 2 ✅)
├── types/          # shared contracts + HTTP errors (Phase 2 ✅)
├── auth/           # app/core/auth.py + tenancy    (Phase 3 ✅)
├── context/        # request-scoped identity (ALS) (Phase 3 ✅)
├── middleware/     # CORS, auth, errors, uploads, request ids, validators (Phase 3/4/5/17)
├── schemas/        # app/schemas/* + inline models            (Phase 5 ✅)
├── db/             # Drizzle + pgvector/SQLite       (Phase 6 ✅)
├── telemetry/      # app/core/logging.py/telemetry (Phase 7 ✅)
├── llm/            # app/core/llm_router.py         (Phase 8 ✅)
├── graph/          # app/graph/*                   (Phase 13 ✅)
├── rag/            # app/rag/*                     (Phase 12 ✅ + Phase 13)
├── services/       # app/services/*                (Phase 9 ✅ + later phases)
│                   #   parsing, resume/JD, Tavily, matching (Phase 9 ✅)
│                   #   + quota guard + persistence  (Phases 2/6 ✅)
│                   #   + payments + email/outreach  (Phases 10/11 ✅)
│                   #   + ingestion + campaign       (Phase 12 ✅)
│                   #   + redaction, mismatch, RAG intel (Phase 13 ✅)
│                   #   + sessions, evaluation, reports, analytics, users, privacy (Phase 15 ✅)
├── tools/          # app/tools/*                   (Phase 11 ✅ + Phase 13 ✅)
├── jobs/           # app/services/job_queue.py     (Phase 14 ✅)
│                   #   + retention scheduler        (Phase 16 ✅)
└── cli/            # operational commands (retention, preflight, stabilize) (Phases 16/19/20 ✅)
tests/              # node:test suites               (Phase 18 ✅)
                    #   PARITY.md maps archived FastAPI modules to a suite
scripts/            # parity-check.mjs (dual-run HTTP comparison)
Dockerfile          # multi-stage, non-root runtime image (Phase 19 ✅)
.dockerignore       # excludes .env* (except the template) and local databases
```

## Environment

Copy `.env.example` to `.env` and fill in values. `.env` is git-ignored and is
loaded at boot via Node's built-in `process.loadEnvFile` (resolved relative to
the module, so the working directory does not matter). Real environment
variables win over file values.

`src/config/index.ts` is the **single source of configuration**. Feature code
must call `getConfig()`; it must not read `process.env` directly.

Configuration behavior:

- `ENVIRONMENT` falls back to `NODE_ENV`, then `development`, lowercased.
- `production` forces `USE_LOCAL_AUTH=false`, regardless of the env value.
- SMTP port parsing silently falls back to `587` on invalid input.
- `SMTP_SENDER` falls back to `SMTP_USERNAME` only when unset.
- `ALLOWED_ORIGINS` unset → the six defaults; set-but-empty/whitespace → `[]`.
- `SUPABASE_JWT_AUDIENCE` defaults to `authenticated`.
- Razorpay keys default to empty strings.
- `DATABASE_URL` falls back to `SUPABASE_DB_URL`; both are direct Postgres
  connection strings. `PG_POOL_MAX`, `PG_IDLE_TIMEOUT_MS` and
  `PG_CONNECTION_TIMEOUT_MS` are strict: invalid or non-positive values fail at
  boot. `SQLITE_FALLBACK_PATH` defaults to `recruitai_fallback.db`.

Async chat job settings (Phase 14) live under `config.jobs`:

- `REDIS_URL` unset → the in-memory job manager (Python parity, single process).
  Set → the BullMQ/Redis manager with durable jobs and cross-instance SSE.
- `JOB_QUEUE_NAME` defaults to `recruitai-agent-jobs`; `JOB_TTL_SECONDS` to
  `3600`; `JOB_PER_USER_CONCURRENCY` to `2`; `JOB_WORKER_CONCURRENCY` to `10`;
  `JOB_EVENT_REPLAY_LIMIT` to `100`. All numeric values are strict and must be
  positive.

Operational retention settings (Phase 16) live under `config.retention` and are
**opt-in**:

- `RETENTION_JOB_ENABLED` defaults to `false`. Python never scheduled retention,
  so a deploy must explicitly enable sweeps.
- `RETENTION_JOB_INTERVAL_SECONDS` defaults to `86400` (daily) and must be a
  positive integer.
- `RETENTION_RAW_RESUME_TTL_DAYS` defaults to `90` and
  `RETENTION_CHAT_TTL_DAYS` to `365`, matching the Python route defaults. Both
  accept `0` (purge at boot/run time) and are strict non-negative integers;
  invalid values fail at boot.

Data-layer and payment settings (Phase 22):

- `DB_LIST_MAX_LIMIT` defaults to `1000` and clamps every tenant list page
  (matching PostgREST's implicit cap). `DB_SWEEP_BATCH_SIZE` and
  `DB_INSERT_BATCH_SIZE` default to `500` for retention sweeps and multi-row
  inserts.
- `CACHE_HOT_READS_ENABLED` defaults to `true`;
  `CACHE_CREDITS_TTL_SECONDS` (15), `CACHE_SUBSCRIPTION_TTL_SECONDS` (30) and
  `CACHE_ANALYTICS_TTL_SECONDS` (30) bound read staleness. Redis is the
  fleet-wide cache, memory is the local fallback, and ledger writes never use
  cached reads.
- `PAYMENT_IDEMPOTENCY_TTL_SECONDS` defaults to `86400`; verify and webhook
  claims are stored in `processed_events` for that window.

Fair-use and cost-safety settings (Phase 23):

- `RATE_LIMIT_TIERED_ENABLED` defaults to `true` when `ENVIRONMENT=production`
  and `false` otherwise. Per-user sliding windows are `chat` 60, `email` 20,
  `payments` 30, `ingest` 30, `evaluate` 30, `write` 120 and `read` 600 per
  `RATE_LIMIT_TIER_WINDOW_SECONDS` (default `60`). Override a tier with
  `RATE_LIMIT_<TIER>_MAX`; the per-IP budget is `RATE_LIMIT_IP_MULTIPLIER`
  (default `4`) times the user budget.
- `CACHE_JD_PARSE_ENABLED` defaults to `true`; parsed JD structures are cached
  by SHA-256 of filename + raw text for `CACHE_JD_PARSE_TTL_SECONDS`
  (default `3600`). Redis is fleet-wide, memory is the local fallback.
- `LLM_MAX_CONCURRENT_CALLS` (default `8`) caps simultaneous Gemini attempts
  fleet-wide; `LLM_BUDGET_LEASE_SECONDS` (120) bounds a lease and
  `LLM_BUDGET_ACQUIRE_TIMEOUT_MS` (1500) bounds waiting for one.
- `LLM_COST_ALARM_WINDOW_SECONDS` (300) and `LLM_COST_ALARM_THRESHOLD_USD`
  (default `$1`, positive float) control the `llm_cost_anomaly` alert.
- `TAVILY_TIMEOUT_MS` (8000) and `RAZORPAY_TIMEOUT_MS` (10000) are hard
  outbound deadlines. SMTP uses `SMTP_CONNECTION_TIMEOUT_MS` and
  `SMTP_GREETING_TIMEOUT_MS` (10000), plus `SMTP_SOCKET_TIMEOUT_MS` (20000).
- Uploads stop buffering at 15 MB per file and reject more than 10 files per
  batch; an oversized file in a mixed batch still yields a per-file 207 result.
- `CHAT_SSE_HEARTBEAT_SECONDS` (15) sends SSE keepalive comments and
  `CHAT_SSE_IDLE_TIMEOUT_SECONDS` (300) closes a stream with no event frames.

Logging and hardening settings (Phase 19):

- `LOG_LEVEL` (`debug`/`info`/`warn`/`error`) defaults to `info` and is
  validated strictly; an invalid value fails boot. It applies to loggers that
  were created at import time because the default level is resolved per emit.
- `RATE_LIMIT_ENABLED` defaults to `true` when `ENVIRONMENT=production` and
  `false` otherwise, so development and tests keep Python's unlimited behavior.
- `RATE_LIMIT_WINDOW_SECONDS` defaults to `60` and
  `RATE_LIMIT_MAX_REQUESTS` to `600`; both are strict positive integers.
- `TRUST_PROXY` defaults to `false` and must be enabled only behind a proxy
  that overwrites `X-Forwarded-For`.

Production gates (fail-fast at boot, before the server listens):

- **AI-SEC-1** — throws unless `LLM_DATA_USE_MODE` is exactly
  `zero_retention_verified`.
- **Required keys** — throws when `GEMINI_API_KEY`, `TAVILY_API_KEY`,
  `SUPABASE_URL`, or `SUPABASE_SERVICE_ROLE_KEY` is missing. This is
  intentional Node-side hardening: Python defines `get_missing_keys()` but never
  enforces it.
- **PORT** — a non-integer value throws instead of silently binding another
  port (mirrors the Python launcher's `int()` crash).
- **Preflight** — in production, startup also runs the Phase 19 preflight and
  exits `1` on any hard failure (missing/weak JWT secret, non-PostgreSQL
  `DATABASE_URL`, loopback CORS, placeholder secrets, partial SMTP/Razorpay).
  Run the same checks against a deployment before switching traffic with
  `npm run preflight` or `node dist/cli/preflight.js`.

Credit-exhaustion responses use the frozen 402 contract in
`src/types/errors.ts` (`INSUFFICIENT_CREDITS`, message, `upgrade_url:
"/pricing"`), including the route-specific evaluation/outreach variants.

## Stateless application core (Phase 21)

Every piece of process-local state that affected visible behavior moved into
Redis, so N identical replicas can sit behind a load balancer:

| State                    | Module                                       | Redis layout                                                               |
| :----------------------- | :------------------------------------------- | :------------------------------------------------------------------------- |
| Async chat jobs / SSE    | `jobs/redis-job-manager.ts`                  | TTL'd job hashes, capped event list, per-job pub/sub, per-user Lua counter |
| Tavily / salary / trends | `cache/ttl-cache.ts` + `services/tavily`     | JSON DTOs under `recruitai:cache:*` with the same TTLs                     |
| LLM circuit breakers     | `llm/router.ts` (`RedisModelCircuitBreaker`) | `recruitai:breaker:<model>` counters/state with a Lua transition script    |
| HTTP rate limit          | `middleware/rate-limit.ts`                   | `recruitai:rl:http:*` atomic `INCR` + `PEXPIRE` fixed window               |
| Reset throttle           | `services/reset-throttle.ts`                 | `recruitai:rl:reset:*` one `SET NX PX` claim per tenant                    |
| Retention sweeps         | `jobs/retention-scheduler.ts`                | `recruitai:lock:retention` distributed lock; non-owners skip the tick      |

`src/redis/client.ts` is the single client module: namespaced `key()`, raw and
JSON accessors, `ping()`, `increment()`, `claimTtl()`, and token-checked locks.
`getSharedRedisStore()` returns `null` when `REDIS_URL` is unset, and every
consumer then uses its in-memory implementation. Those fallbacks exist for
local development and tests only; they are not a multi-replica mode.

New configuration (all strict):

- `WORKER_POOL_ENABLED` defaults to `true` when `ENVIRONMENT=production` and
  `false` otherwise. `WORKER_POOL_SIZE` defaults to `2` and
  `WORKER_POOL_MAX_QUEUE` to `100`.
- `CHAT_MAX_SSE_CONNECTIONS` defaults to `200` per instance;
  `CHAT_SSE_HEARTBEAT_SECONDS`/`CHAT_SSE_IDLE_TIMEOUT_SECONDS` bound stream
  liveness (Phase 23).
- `EVENT_LOOP_LAG_WARN_MS` defaults to `200`; the monitor samples every 10 s
  and warns when the event-loop p99 exceeds it.
- `SHUTDOWN_DRAIN_MS` (default `10000`) and `SHUTDOWN_SSE_GRACE_MS` (default
  `2000`) bound graceful shutdown.

Behavior changes are additive only:

- PDF/DOCX extraction, deterministic resume parsing and PDF report generation
  run in a bounded `worker_threads` pool when enabled. LLM refinement callbacks
  stay on the request thread, so inline execution is still used whenever a
  test or caller injects one.
- Worker queue overflow returns `503` with `Retry-After: 5`. SSE admission
  overflow returns `429` with `Retry-After: 5` and the existing `{ detail }`
  error shape. Success payloads and SSE frames are unchanged.
- `/api/metrics` keeps the same JSON body; the `text/plain` Accept variant now
  comes from a `prom-client` registry with the same `recruitai_*` names.
- With `REDIS_URL` configured, readiness fails (`503`) when Redis cannot be
  pinged. The response shape does not change.
- `SIGTERM`/`SIGINT` switches to draining: readiness reports unhealthy,
  retention and the event-loop monitor stop, SSE streams get a short grace
  period, remaining sockets are force-closed at the drain deadline, BullMQ is
  paused/closed, worker threads and Redis connections are released, then the
  process exits `0`.

## Auth and request identity

`src/auth/` ports `app/core/auth.py`; `src/middleware/auth.ts` exposes the
Express equivalent of `Depends(get_current_user_id)`.

Verification order is unchanged:

1. Local HS256 verification with `SUPABASE_JWT_SECRET`, pinned algorithm,
   mandatory `aud`/`exp` checks.
2. Supabase Auth fallback: `GET {SUPABASE_URL}/auth/v1/user` with the
   service-role `apikey` and caller token (5 s timeout, failures ignored).
3. Dev-only unverified claims when `USE_LOCAL_AUTH=true` (never in production,
   where config forces it off).

Details preserved from Python:

- Non-UUID subjects are rejected with
  `Invalid user identification: token subject must be a valid UUID.` (401).
- Missing credentials return `Authentication required. Please log in to
continue.` with `WWW-Authenticate: Bearer`; other failures return the generic
  `Invalid or expired authentication token. Signature verification failed.`
- Expired tokens are rejected immediately with `Signature has expired.`
- Dev accepts `mock-token`, `local-token`, `test-token`, `local_dev_user_123`
  and the configured `LOCAL_DEV_USER_ID`.

Usage:

```ts
app.use('/api/chat', requireAuth(), chatRouter); // protected, like FastAPI
// Public routes (health liveness, Razorpay webhook) must not use requireAuth.
```

After `requireAuth`, the user is available as `req.userId` and through an
isolated `AsyncLocalStorage` context:

```ts
import { getCurrentUserId, getCurrentTenantId, setSessionId } from '../context/request-context.js';
```

`tenantId` is the authenticated user id, matching Python's `user_id` tenant
scoping. Session-scoped routes call `setSessionId()` once resolved. Explicit
ownership checks can use `canAccessTenantResource()` / `assertTenantAccess()`
from `src/auth/authorization.ts`; normal queries should keep filtering by
`user_id` so cross-tenant reads stay 404, as in Python.

Raw bearer tokens are never stored beyond the verification call.

## Database access layer

`src/db/` maps the existing PostgreSQL schema and ports every Supabase access
pattern to Drizzle. The SQL migrations under `supabase/migrations/`, plus
`backend/scripts/enhanced_schema.sql` and `01_users_schema.sql`, are the **source
of truth**; `schema.ts` is a read-only introspection of them. Drizzle Kit is not
run against the database, and triggers, RLS policies and `SECURITY DEFINER`
functions stay authoritative in SQL.

### Schema mapping

`schema.ts` covers all twelve tables the backend uses: `users`, `jobs`,
`candidates`, `resume_chunks`, `applications`, `interviews`, `chat_sessions`,
`chat_messages`, `session_candidates`, `subscriptions`, `credit_transactions`
and `outreach_logs`.

Preserved details include:

- column names and nullability, including nullable `interviews.scheduled_at`
  (BUG-4) and `duration_minutes DEFAULT 30`;
- `users.credits_balance` (default 10) and `preferences`;
- `resume_chunks.embedding vector(384)` with IVFFlat `vector_cosine_ops`;
- the `(job_id, candidate_id)` unique key on applications, the composite
  `(session_id, candidate_id)` key on session_candidates, and all status checks;
- foreign keys with their cascade semantics (`cascade` for candidate/application
  children, `set null` for `chat_sessions.job_id` and
  `outreach_logs.candidate_id`);
- the migration indexes, including `chat_messages(user_id)`, analytics-relevant
  application indexes and descending ledger/outreach timestamps.

`users.id` and `outreach_logs.user_id` reference Supabase's `auth.users`; the
`auth` schema is not modeled in Drizzle, so those two constraints remain
database-side only.

### PostgreSQL client and pooling

`src/db/client.ts` owns one primary `pg.Pool`, an optional read-replica pool and
one Drizzle instance per pool:

| Env                                 | Default       | Meaning                                    |
| ----------------------------------- | ------------- | ------------------------------------------ |
| `DATABASE_URL`                      | —             | direct TCP Postgres connection string      |
| `SUPABASE_DB_URL`                   | —             | fallback name when `DATABASE_URL` unset    |
| `DATABASE_READ_URL`                 | —             | optional replica for analytics reads       |
| `PG_POOL_MAX`                       | `10`          | max primary connections per Node instance  |
| `PG_READ_POOL_MAX`                  | `PG_POOL_MAX` | max replica connections per Node instance  |
| `PG_IDLE_TIMEOUT_MS`                | `30000`       | idle connection reaping                    |
| `PG_CONNECTION_TIMEOUT_MS`          | `5000`        | acquire timeout                            |
| `PG_STATEMENT_TIMEOUT_MS`           | `15000`       | per-session statement cap                  |
| `PG_IDLE_IN_TRANSACTION_TIMEOUT_MS` | `30000`       | abort sessions idling inside a transaction |
| `PG_TRANSACTION_TIMEOUT_MS`         | `10000`       | per-session transaction cap                |

`DATABASE_URL` must be a Postgres connection string, not the Supabase project
URL (that is the PostgREST endpoint). Connections are created lazily on first
query and reused; nothing opens a connection per request. Pool math:
`(PG_POOL_MAX + PG_READ_POOL_MAX) × instance count + worker connections` must
stay below the Supavisor/PgBouncer transaction-pool ceiling, with 20% headroom.
Invalid pool values fail at boot instead of silently changing the budget.

Session timeouts are set as libpq startup `options` and re-applied with
`SET LOCAL` inside `withTransaction()`, so transaction-pooling poolers cannot
leak a previous tenant's settings. Unset `DATABASE_READ_URL` means analytics
reads share the primary; an unusable read URL fails readiness rather than
silently falling back. Payment and ledger paths always use the primary.

Call `closeDatabase()` during graceful shutdown. Missing configuration raises
the Python-compatible 503 (`Database service configuration missing in production
environment.`) in production.

Saturation is observable, not just theoretical: `/api/metrics` publishes
`recruitai_db_pool_connections{role,state}` and `recruitai_db_pool_size{role}`
at scrape time, so `state="waiting"` above zero means callers are queueing for a
slot. `tests/db-pool-saturation.test.ts` proves the bound against a real server:
40 concurrent `pg_sleep` queries over `PG_POOL_MAX=2` never open more than two
connections, do queue (`waiting > 0`), and all finish. Run it with
`DATABASE_INTEGRATION_URL=postgres://… npm run test:integration:postgres`.

### RPC escape hatch

Drizzle has no RPC equivalent, so `src/db/rpc.ts` calls the SQL functions through
`drizzle.sql` using PostgreSQL named notation, preserving argument names and
result shapes:

| Function                                   | Result                                 |
| ------------------------------------------ | -------------------------------------- |
| `get_analytics_summary(p_user_id)`         | jsonb summary object                   |
| `get_pipeline_funnel(p_user_id)`           | `{stage,count,percentage}[]`           |
| `get_candidates_over_time(p_user_id,days)` | `{day,count}[]`                        |
| `get_match_score_distribution(p_user_id)`  | `{bucket,count,min_score,max_score}[]` |
| `get_top_skills(p_user_id,top_n)`          | `{skill,demand_count}[]`               |
| `get_hiring_velocity(p_user_id)`           | jsonb velocity object                  |
| `get_jobs_summary(p_user_id)`              | per-job summary rows                   |
| `get_recent_activity(p_user_id,limit_n)`   | activity-feed rows                     |
| `reset_user_workspace(target_user_id)`     | `{success,user_id,reset_at}`           |
| `match_resume_chunks(...)`                 | pgvector match rows                    |

`node-postgres` returns `bigint`/`numeric` as strings, while PostgREST emitted
JSON numbers; the RPC client converts counts, percentages and scores back to
numbers so responses stay byte-compatible.

`src/db/vector.ts` is the pgvector integration path: batched chunk inserts,
top-k search through `match_resume_chunks`, and tenant-scoped chunk deletion.

### SQLite fallback

`src/db/fallback.ts` ports `backend/app/rag/fallback_db.py` using Node's built-in
`node:sqlite` driver (Node 24+, hence the package `engines` requirement). It is
dev/test only and throws the Python 503
(`… SQLite fallback is prohibited in production.`) in production.

Preserved behavior:

- WAL, `synchronous=NORMAL`, foreign keys and a 30 s busy timeout;
- all tables, including the monetization tables and `outreach_logs`;
- the seeded local recruiter and preference repair;
- legacy column additions and the BUG-4 `scheduled_at` table rebuild;
- JSON column round-tripping;
- upsert priority: primary-key id first, then `applications(job_id,candidate_id)`,
  `users(email)`, `session_candidates(session_id,candidate_id)` and
  `subscriptions(user_id)`;
- `reset_user_workspace` and `match_resume_chunks` (in-process cosine similarity,
  `candidate_name` + `full_name` in the result).

Unknown fallback RPCs throw instead of silently returning nothing.

### Persistence service

`src/services/persistence.ts` ports `persistence_service.py` over a narrow
`WorkspaceStore` contract (`src/db/workspace-store.ts`) with two
implementations: Drizzle/PostgreSQL for normal operation and SQLite for the
fallback. Every query filters by `user_id`.

Ported behavior:

- `persistJob` upserts by user + title and keeps the Python best-effort failure
  semantics;
- `persistApplications` upserts `(job_id,candidate_id)`, requires real UUIDs and
  defaults missing scores/arrays;
- `persistInterviews` resolves candidates by name and applications by
  candidate + job, strips the slot, never fabricates `scheduled_at`, and keeps
  the duration/mode defaults;
- `persistChatMessage` inserts user/assistant/system messages with optional
  metadata;
- `updateSessionMetadata` always rewrites `last_intent`,
  `pending_confirmation` and `updated_at`, and only changes title/job when
  supplied;
- `persistSessionCandidate` links session ↔ candidate only when both rows belong
  to the tenant.

### Payments, subscriptions, and credits

`src/services/payment-service.ts` ports `payment_service.py`; `src/db/payment-store.ts`
provides the `PaymentStore` contract with Drizzle/PostgreSQL and SQLite
implementations, resolved lazily (PostgreSQL when `DATABASE_URL` is set,
otherwise the SQLite fallback).

Preserved behavior:

- the three plans (`starter` ₹1,499/50 credits, `pro` ₹3,999/250,
  `agency` ₹7,999/1,000) and `DEFAULT_FREE_CREDITS = 10`;
- order creation through Razorpay's REST `/v1/orders` endpoint with Basic auth,
  the `rcpt_<user prefix>_<decimal>` receipt, and notes carrying
  `user_id`/`plan_id`;
- simulated `order_mock_<14 hex>` orders with `rzp_test_mock_key` when keys are
  absent; a live Razorpay failure is fatal in production only, and the frontend
  sandbox keeps working for keys containing `mock`;
- checkout HMAC verification over `order_id|payment_id`, the
  `mock_valid_signature`/`test_` acceptance rules, and webhook HMAC verification
  over the raw body;
- subscription activation (one consolidated row per tenant), 30-day periods,
  credit top-ups, and best-effort ledger writes;
- `sub_<12 hex>`/`tx_<12 hex>` public ids, with storage UUIDs generated on
  PostgreSQL where the schema requires them;
- newest-first credit transaction history and credit consumption with the exact
  messages (`Amount must be greater than 0.`,
  `Insufficient credits. Remaining: X, required: Y`).

`src/routes/payments.ts` ports every endpoint. `/plans` and `/webhook` are
public; `/order`, `/verify`, `/status`, `/transactions` and `/consume-credit`
use `requireAuth()`. `/consume-credit` returns **HTTP 402** with a plain-string
`detail`, matching Python; the structured `INSUFFICIENT_CREDITS` body belongs to
the separate quota guard. The webhook is mounted before the global JSON parser
so signature verification sees the exact bytes and malformed JSON returns the
route's `400 Invalid JSON payload in webhook body.` instead of body-parser's 422.

### Email tooling, outreach dispatch, history, and stats

`src/tools/email-tool.ts` ports `app/tools/email_tool.py`; `src/services/email-service.ts`
ports the behavior of `app/api/routes_email.py`; `src/db/outreach-store.ts`
provides the `OutreachStore` contract with Drizzle/PostgreSQL and SQLite
implementations.

Preserved behavior:

- `draftRecruiterEmail` asks the LLM pool for a subject/body/signature draft and
  falls back to the same action-specific template (`interview invite`,
  `rejection`, `offer`, generic) with the exact fallback note when every
  provider fails;
- `sendEmailDraft` dispatches over SMTP only when **both** `SMTP_USERNAME` and
  `SMTP_PASSWORD` are configured (`nodemailer`, TLS on port 587, sender falling
  back to the username); otherwise it simulates the dispatch;
- simulated logs mask the recipient after the first two characters
  (`alice@example.com` → `al***@example.com`), while the full address is still
  stored in `outreach_logs` for the recruiter;
- the route classifies dispatch from the tool's status string:
  `Email sent successfully via SMTP` → `sent`/`smtp`,
  `Failed to send email via SMTP` → `failed`/`smtp` (HTTP 500),
  anything else → `simulated`/`simulated`;
- `POST /api/email/send` returns `{ status, log_id, dispatch_type,
credits_remaining }`, checks the structured outreach 402 body first, and
  deducts exactly one credit (`Candidate outreach email to <recipient>`) after a
  successful or simulated dispatch; ledger/log failures are logged but never
  fail the request;
- `subject`/`body` override the `Subject:` line in `email_draft`; otherwise the
  line is parsed case-insensitively and the default is `RecruitAI Outreach`;
- `GET /api/email/history` is tenant-scoped, newest first, optional
  `candidate_id`, `limit` default `50` and bounded `1..100`, and degrades to an
  empty result on database failure;
- `GET /api/email/stats` counts `sent`/`simulated`/`failed` for the tenant and
  degrades to zeroed counters.

All three routes use `requireAuth()` and preserve the original recipient
validation (`Invalid recipient email format: '<clean>'`, trimmed) through Zod.

## Logging, request context, and telemetry

`src/telemetry/` ports `app/core/logging.py` (AI-SEC-5) and
`app/core/telemetry.py` (OPS-1).

**Request context.** `requireAuth` runs every request inside an
`AsyncLocalStorage` store. In addition to the authenticated identity, the store
holds a nested `telemetry` scope (`userId`, `sessionId`, `requestId`, `turn`,
`logs`), so `clearTelemetryContext()` can never break authorization. Outside a
request (CLI, tests) a module-level fallback reproduces Python's contextvar
defaults.

**Structured logger** (`logger.ts`). One JSON object per line, level filtering
(default `info`), and a strict field allowlist. Keys containing
`prompt`, `resume`, `completion`, `text`, `message`, `candidate_name`, `email`
or `phone` are dropped; serialization failures fall back to a field-less record
instead of throwing.

**Tenant-scoped events** (`logging.ts`). Ports `set_telemetry_context`,
`clear_telemetry_context`, `log_event`, `increment_turn`, `get_all_logs` and
`mask_exception`. The turn counter survives `set`/`clear`, as in Python.
`maskException()` returns only `{ error_type, error_code }` — never the message.
Audit helpers emit the exact Python messages and add structured fields plus
request/session ids:

```
[AUDIT] [GDPR_ERASURE] candidate_id=... user_id=... status=purged
[AUDIT] [GDPR_ACCOUNT_ERASURE] user_id=... status=account_purged
[AUDIT] [WORKSPACE_RESET] user_id=... timestamp=... action=reset_all_data
```

**Metrics** (`metrics.ts`). In-memory RED/USE registry: requests, 4xx/5xx error
breakdown, per-endpoint latency percentiles (p50/p90/p95/p99, 500-sample window
per endpoint), queue depth/workers, token and cost accounting, and SLO health.
`GET /api/metrics` is authenticated and returns the JSON summary, or Prometheus
text when `Accept` includes `text/plain`. Request labels use the matched route
(`/users/:id`), never the concrete URL; unmatched paths use `unmatched`.

**Tracing** (`tracing.ts`). Dependency-free OpenTelemetry-shaped spans (32-char
trace id, 16-char span id, attributes, events, status) and `withSpan()` for
success/error spans. Swap the span sink for an OTLP exporter later without
touching call sites.

Metrics are always enabled, matching the Python config (no env toggle).

## LLM routing and safety gates

`src/llm/` ports `app/core/llm_router.py` (ENG-4).

**Transport** (`gemini.ts`). `invokeGemini` calls the REST
`models/{model}:generateContent` endpoint with `fetch` — no vendor SDK — and
preserves Python's request settings: `temperature: 0`, an optional
`systemInstruction`, `responseMimeType: application/json` when `jsonMode` is
set, and a 30 s `AbortController` timeout. Responses are shaped like a LangChain
`AIMessage` (`content` plus `usage_metadata`/`response_metadata`), so later
graph nodes can consume them unchanged. Errors carry the provider status
(`Gemini API error (429): ...`) so rate-limit detection keeps working.

**Router** (`router.ts`).

- `callLlm(prompt, { systemInstruction, providerOverride, jsonMode })` returns
  `{ text, provider, latencyMs }` (Python's `(text, provider, latency_ms)`) and
  raises `AllProvidersFailedError` when the pool is exhausted.
- Model order is round-robin across `ROTATING_MODELS`; a valid
  `providerOverride` leads the order without advancing the cursor. Healthy
  circuits (CLOSED/HALF_OPEN) come first, tripped models last, and the full pool
  is returned when every circuit is open.
- `ModelCircuitBreaker` opens after 3 consecutive failures, opens immediately on
  a rate limit (`429` / `resource_exhausted` / `rate_limit`), and probes
  HALF_OPEN after a 60 s cooldown. A success closes the circuit.
- `extractText()` handles every content shape Python handles; `parseJsonSafely()`
  strips markdown fences and trailing commas, and never falls back to literal
  evaluation.
- Accounting uses the provider's token counts, otherwise Python's
  `len(text) // 4` heuristic, at $0.075/1M input and $0.30/1M output. Each call
  emits the `llm_call_completed` telemetry event and feeds `recordTokens()` so
  `/api/metrics` reports totals.

Gates run before any request leaves the process, in Python's order: the kill
switch (`LLM_KILL_SWITCH`) short-circuits with
`AllProvidersFailedError`, `verifyProviderCompliance()` enforces AI-SEC-1 in
production, and a missing or placeholder `GEMINI_API_KEY` is rejected with
Python's exact message.

## Document parsing, resume/JD extraction, and matching

`src/services/` ports the deterministic business logic that ingestion and
evaluation depend on. Every module is a direct translation of its Python
counterpart, including the quirks noted below, so parity checks compare like for
like.

**`document-parser.ts`** (`app/services/document_parser.py`).

- `parsePdf` uses the pdf.js legacy build with standard font data resolved from
  the package. Pages with no text are skipped, page text is joined with blank
  lines, control characters are stripped, and Python's exact `ValueError`
  messages (`File not found:`, `PDF content is empty (0 bytes).`, encrypted,
  scanned-only, `Failed to parse PDF file:`) are preserved. The loading task is
  always destroyed in `finally`.
- `parsePdfDetails` reports `{ text, num_pages, contact_info, has_text }` and
  wraps failures as `Failed to parse PDF details: ...`.
- `parseDocx` reads `word/document.xml` through JSZip. It walks direct
  `<w:body>` children so table-cell paragraphs are not emitted twice, keeps
  Python's paragraph-then-table ordering, joins row cells with `" | "`, joins
  cell paragraphs with newlines, and decodes tabs, breaks and XML entities.
- `parseImage` sends base64 `inlineData` to Gemini at `temperature: 0.1`; without
  a usable key (or when every model fails) it returns Python's placeholder
  `Candidate Resume (Extracted from Mobile Photo Image)`.
- `parseDocument` dispatches by extension first, then sniffs `%PDF`,
  `PK\x03\x04`, PNG and JPEG magic bytes, and falls back to UTF-8 text.
- `extractContactInfo` returns sorted, de-duplicated emails, phones and URLs.

**`resume-parser.ts`** (`app/services/resume_parser.py`). Deterministic by
default: filename/name detection, contact extraction, keyword skill scan,
first years-of-experience mention (default `2.0`), headline, education and role
lines. An LLM refinement pass runs only when `llmFunc` is supplied, matching
Python's quota behaviour; invalid JSON or provider errors fall back silently to
the heuristics. Summary and `candidate_id` follow Python's formatting.

**`jd-parser.ts`** (`app/services/jd_parser.py`). LLM structured extraction is
the default path (the adapter calls Phase 8 `callLlm`), with heuristic fallbacks
that guarantee a non-empty role and `required_skills`
(`Software Development`, `Problem Solving`). Alias lists, labelled-field
extraction (`Company:`, `Location:`), filename-derived roles, and the
`Empty JD text provided.` defaults match Python.

**`tavily.ts`** (`app/services/tavily_service.py`, job-discovery subset). Phase 9
ports `searchLiveJobs` only; salary, trend and recruiter-intel helpers arrive
with later phases. A key must be non-empty, must not contain `your_tavily`, and
must not start with `placeholder`. Searches target the Python job-board domain
list, filter snippets of 100 characters or fewer, cache non-empty results for
one hour (TTL clock injectable for tests), and return `[]` on HTTP/network
failure.

**`job-desc-api.ts`** (`app/services/job_desc_api.py`). `getMockJd` reproduces
the frontend/backend/generic templates; `fetchLiveJobDescription` uses Tavily
when available and falls back to the mock; `mapRawJobToJd` wraps the live result
in a synthetic JD and fills missing company/location.

**`matching.ts`** (`app/services/matching_service.py`). Five-pillar scoring
(technical 35, experience 25, architecture 15, leadership 15, education 10),
synonym-aware token normalisation, composite splitting for `or`/`and`/`/`
requirements, a 30-point floor whenever any skill matched, a 97-point cap, and
Python's half-even rounding. `detectRedFlags` reports insufficient experience and
zero overlap; `evaluateCandidateAgainstJd` mutates the candidate with score,
matched skills, gaps, red flags, headline and summary; `evaluateCandidatesBatch`
sorts descending by score.

Phase 9 adds 98 tests across `document-parser`, `resume-parser`, `jd-parser`,
`tavily` and `matching` (synthetic PDF/DOCX fixtures, multimodal stubs, cache
clocks, and scoring edge cases).

## Ingestion, RAG, and campaign context

**`src/rag/`** ports the pieces ingestion needs from `app/rag/` and
`app/services/redaction.py`:

- `chunking.ts` — paragraph-first resume chunking with the 150-word window and
  25-word overlap.
- `redaction.ts` — stateless PII minimization before embedding
  (`[REDACTED_EMAIL]`, `[REDACTED_PHONE]`, `[REDACTED_URL]`,
  `[REDACTED_LOCATION]`, `[CANDIDATE_ANONYMOUS]`), including tag neutralisation.
- `embeddings.ts` — Gemini `gemini-embedding-2` via `:embedContent` with 384
  output dimensions and the redacted text. A missing/placeholder key, provider
  error or timeout degrades to the reproducible deterministic SHA-256 vector
  instead of failing ingestion.

**`src/services/ingestion-service.ts`** (`app/services/ingestion_service.py`).
Deterministic SHA-256 resume hashing (normalized text, minimum 20 characters)
is the primary deduplication key, with a verified non-`@recruitai.local` email
as the secondary key. It preserves the candidate metadata shape, merges
`session_id`/`session_ids`, links `session_candidates`, scores new candidates
immediately against the session's active JD (writing `applications` and
metadata), and replaces the candidate's `resume_chunks` with freshly embedded
chunks. Every read and write goes through the tenant-scoped `WorkspaceStore`,
so the Drizzle/PostgreSQL path and the SQLite fallback share one
implementation. `saveJobDescription` always inserts a new job, binds it to the
session, retitles the campaign `Hiring: <role>`, and re-scores existing session
candidates as `new` applications.

**`src/routes/ingest.ts`** (`app/api/routes_ingest.py`). Both endpoints require
auth. `/api/ingest/upload` accepts `files` (many) then `file` (single), resolves
extensions from the filename, Content-Type or magic bytes, enforces the 15 MB
per-file limit, and preserves Python's response contract: single failure → 400
plain detail, mixed batch → RFC 4918 `207` array, success → `200` array.
`/api/ingest/upload-jd` requires `file`, maps read failures and empty text to
400, oversize to 413 and parse failures to 500, then persists and binds the job.

**`src/services/campaign-service.ts`** (`app/services/campaign_service.py`).
`ensureSessionExists` creates a `New Hiring Campaign` row when missing and is
tenant-scoped; hydration fills a missing JD from the session's job, up to 50
candidate resumes, and the last 20 messages in ascending order. Every hydration
step is best-effort and matches Python's truthiness rules (an empty JD is
treated as missing). `executeAgentTurn` builds the initial `RecruitState`,
invokes the compiled supervisor graph (a per-instance `graphDeps` bundle, or
the process default), and persists the turn best-effort: candidate rows,
applications for the shortlist, interviews for booked slots, both chat
messages, and the session's `job_id`/`title`/`last_intent`/
`pending_confirmation`. Persistence failures are logged and never discard the
model's response.

Phase 12 adds 64 tests across `rag`, `ingestion-service`, `campaign-service`
and the ingest routes (multipart batches, partial failures, session linking,
JD binding, hydration limits and error swallowing).

## Multi-agent graph and specialized nodes

**`src/graph/runtime.ts`** is a minimal typed `StateGraph`/`END` runtime with no
third-party graph library. It reproduces the observable contract Python relies on:
an entry node, named nodes, static and conditional edges, a reducer-free merge
of each node's partial state, and a hard stop at `END`. `CompiledGraph.invoke`
never mutates the caller's state. `src/graph/state.ts` mirrors
`RecruitState` (`TypedDict, total=False`) field for field, and
`src/graph/deps.ts` defines the injectable `GraphDeps` bundle (LLM, embeddings,
vector store, Tavily, ingestion, email, clock) so nodes and tests run without
Postgres, Gemini or Tavily.

**`src/graph/builder.ts`** matches the verified Python topology:
`supervisor_agent` → one conditional hop to `jd_agent`, `screening_agent`,
`interview_salary_agent`, `hitl_confirm` or `fallback`, each ending at `END`.
`src/graph/router.ts` holds the rule-based intents, the LLM classification gate
(≥ 0.6 confidence), pending-confirmation handling, and entity memory
(`active_candidate_id`, `active_candidate_ids`, pronoun/bare follow-ups).
`GRAPH_NODE_NAMES` and `routeToSubagent` are exported for topology tests.

**`src/graph/nodes/`** contains the 15 ported behaviors, grouped by their
owning agent:

- `jd_agent` — `parse_jd`, `jd_rewrite`, `fetch_jd_api`.
- `screening_agent` — `screen`, `count`, `compare`, `redflags`,
  `candidate_qa`.
- `interview_salary_agent` — `interview_qgen`, `salary`, `email`, `trend`,
  `schedule`, `web_intel`.
- `hitl_confirm` — finalize/replace-JD/edit confirmation flows.

Supporting services added in this phase:

- `src/services/redaction.ts` — stateful `PiiSanitizer` (reversible tokens for
  names, emails, phones, URLs, addresses) plus `detectPromptInjection`;
  `src/rag/redaction.ts` re-exports the stateless embedding variant.
- `src/rag/advanced-rag.ts` — LLM query expansion and 1–10 chunk reranking,
  both with deterministic fallbacks.
- `src/services/mismatch-analyzer.ts` — regex/LLM experience extraction,
  pool-vs-JD mismatch analysis, JD improvement suggestions, red-flag
  detection (results cached on the candidate).
- `src/services/tavily.ts` — salary benchmarks, skill trends, and recruiter
  web intelligence, each live with TTL caching and curated offline fallbacks
  (`data/salary_fallback.json`).
- `src/tools/skill-trend-tool.ts`, `src/tools/tavily-search.ts` — tool-shaped
  wrappers consumed by the trend/web-intel nodes.

Phase 13 adds 156 tests across the graph runtime, router, builder, node
groups, campaign turn persistence, redaction, Tavily intelligence, advanced
RAG and mismatch analysis.

## Chat API, async job queue, and SSE

**`src/routes/chat.ts`** (`app/api/routes_chat.py`). Three authenticated routes
under `/api/chat`, with the Python contract preserved byte-for-byte:

- `POST /api/chat` validates `ChatRequest`, creates/reuses the session and
  hydrates context, then either runs `executeAgentTurn` inline (`200`
  `ChatResponse`) or enqueues it. `async_mode` is accepted from the query
  string (`?async_mode=true`) or the JSON body; sync failures map to
  `500 {"detail":"Agent execution failed. (ref=<8 hex>)"}` with the detail
  logged server-side.
- `GET /api/chat/jobs/:job_id` returns the `AgentJob.to_dict()` field order
  (`job_id, session_id, status, created_at, updated_at, steps_count, result,
error`) and is tenant-scoped: another user's job is a `404
{"detail":"Agent job not found."}`.
- `GET /api/chat/jobs/:job_id/stream` returns `text/event-stream` with
  `init`, `status`, then `complete` or `error` frames. A finished job replays
  its terminal frame immediately. The generator is aborted when the client
  disconnects.

An async request returns `202` with:
`{job_id, session_id, status:"queued", check_url, stream_url}`, where
`check_url`/`stream_url` are `/api/chat/jobs/<id>` and
`/api/chat/jobs/<id>/stream`.

**`src/jobs/`** ports `app/services/job_queue.py` behind one `ChatJobManager`
interface with two implementations, selected by `REDIS_URL`:

- `in-memory-job-manager.ts` — the direct Python equivalent: UUID jobs,
  `queued → running → completed | failed`, `setTimeout` dispatch instead of
  `loop.create_task`, `steps_count`, per-job SSE queues, and a one-hour TTL
  sweep on the next `createJob`. Deliberate improvement: events are buffered
  per job and replayed to every subscriber, so reconnects do not miss the
  `running` frame.
- `redis-job-manager.ts` — BullMQ `Queue`/`Worker` with the job id as the
  BullMQ id, job records in TTL'd Redis hashes, event frames in a capped Redis
  list plus per-job pub/sub for live fan-out and replay, and a Redis Lua
  counter for a fleet-wide per-user concurrency cap (a worker delays and
  retries rather than failing). Unknown/foreign job ids stay indistinguishable
  from missing ones.

Both managers share `chat-job-manager.ts` (types, `formatSseEvent`,
`jobToDict`, terminal-event mapping). `src/app.ts` builds one
`CampaignService` and one `ChatJobManager`, injects them into the API router,
and the manager's runner calls `CampaignService.executeAgentTurn`, keeping the
HTTP request and the long-running turn separate.

Phase 14 adds 44 tests across the in-memory manager, the Redis manager (fake
Redis/queue/worker backend, so no server is needed) and the chat routes
(sync/async dispatch, job polling, SSE frames, tenant isolation, 422/500
shapes). The opt-in `tests/redis-multi-instance.test.ts` additionally runs two
managers against a real Redis and proves job status/SSE cross instance:
`REDIS_INTEGRATION_URL=redis://127.0.0.1:6390 npm run test:integration:redis`.
The same command runs `tests/rolling-deploy.test.ts`, which starts two real HTTP
instances on one Redis, enqueues an 80-job backlog on A, opens SSE on B, sends
A `SIGTERM`, starts a replacement, and asserts a clean exit, zero dropped jobs
and a terminal `complete` frame. `tests/redis-fleet-state.test.ts` uses two
independent stores to prove the rate-limit window, cached values and circuit
state are shared fleet-wide.

## Sessions, evaluation, reports, analytics, users, and privacy

Phase 15 ports the remaining public route groups. All of them share
`src/db/workspace-query-store.ts`, which exposes one `WorkspaceQueryStore`
interface with a Drizzle/Postgres implementation and an equivalent SQLite
implementation over `FallbackDatabase`. Rows cross the boundary as snake_case
`DbRow` dictionaries, the same shape PostgREST returned to Python, so services
keep the Python logic verbatim instead of remapping column names.

| Python module         | Node module           | Routes                                                                                                                                 |
| --------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `routes_sessions.py`  | `routes/sessions.ts`  | `GET/POST /api/sessions`, `GET/PATCH/DELETE /api/sessions/:id`, `POST /api/sessions/reset-all`                                         |
| `routes_evaluate.py`  | `routes/evaluate.ts`  | `POST /api/candidates/evaluate`, `GET /api/candidates/:id/evaluation`, `POST/PATCH /api/candidates/:id/status`, `POST /api/export/ats` |
| `routes_reports.py`   | `routes/reports.ts`   | `POST /api/reports/generate`, `GET /api/reports/session/:id`                                                                           |
| `routes_analytics.py` | `routes/analytics.ts` | eight `GET /api/analytics/*` endpoints                                                                                                 |
| `routes_users.py`     | `routes/users.ts`     | `GET/PATCH /api/users/me`                                                                                                              |
| `routes_privacy.py`   | `routes/privacy.ts`   | export/erasure, retention, bias audit, user export/account purge                                                                       |

Preserved behavior:

- **Tenant isolation everywhere.** Every read/write is scoped by the
  authenticated `user_id`. `reset-all` and account erasure only touch the
  caller's rows (join-table cleanup additionally requires tenant-owned
  candidates), and cross-tenant ids resolve as `404`.
- **Reset rate limit** stays 30 s per user with the Python detail string and a
  `Retry-After` header.
- **Evaluation quota** returns `402` with the `INSUFFICIENT_CREDITS` body and
  deducts one credit after the rubric is saved. The GDPR Art. 22 guard returns
  the exact `403` detail for automated adverse decisions.
- **Cascades** keep the Python order: candidate erasure
  `session_candidates → interviews → applications → resume_chunks → candidates`;
  account purge adds `chat_messages`, `chat_sessions`, `jobs`, then `users`.
- **Reports** stream a PDF with `Content-Disposition` (plus
  `Access-Control-Expose-Headers`) and the Python filenames
  (`recruitment_report.pdf`, `{slug}_{session[:8]}.pdf`). ATS export streams
  `ats_export.csv` or returns the JSON payload.
- **Analytics** keeps the RPC semantics (KPI rates, funnel percentages,
  zero-filled day buckets, score tiers, weighted skill demand, velocity, job
  summary, activity feed) including Python's half-even rounding.
- **Privacy** keeps GDPR export sections, retention TTL defaults (90/365 days),
  and the NYC Local Law 144 bias-audit statistics.

Documented deviations:

- PDF generation uses `pdfkit` with the built-in Helvetica fonts and a manual
  layout that mirrors the original PDF sections (banner, KPIs, candidate matrix,
  questions, salary, interviews, compliance, page numbers). Non-WinAnsi
  characters are transliterated or dropped so a candidate name cannot break a
  report.
- Analytics compute from tables directly instead of calling Supabase RPCs; the
  plan permits either, and the values match the Python fallback path.
- `users` has no `department` column and there is no `candidate_evaluations`
  table, so `department` is always `null` in responses and rubric data is read
  from `applications.match_reasoning.rubric` (then candidate metadata).
- Session reports have no `session_id` on interviews, so interviews are filtered
  by the session's candidate ids.

Phase 15 adds 56 tests (store, sessions, evaluation/ATS, analytics, privacy,
reports, and user profile), bringing the suite to 748 tests / 182 suites.

## Operational retention and background jobs

Phase 16 audits everything that runs outside a user request and decides where
it runs in Node:

| Behavior                                      | Python trigger                                       | Node decision                                                                                          |
| --------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Retention sweep (raw resume text + chat TTLs) | Authenticated `POST /api/privacy/retention/run` only | Same route (tenant-scoped) **plus** an opt-in Express-side scheduler and `npm run retention:run`       |
| Candidate erasure / user account purge        | Authenticated privacy routes                         | Same routes, backed by reusable `PrivacyService` methods so future jobs can call the identical cascade |
| Chat/agent turns                              | `asyncio.create_task` background job                 | Phase 14 `ChatJobManager` (in-memory or BullMQ), with TTL sweeps/Redis expiry                          |
| Razorpay webhooks                             | Synchronous route, HMAC over raw bytes               | Same, mounted before the JSON parser; no retry queue because Python has none                           |
| Tavily lookups                                | In-process cache with TTL                            | Same; no durable background work needed                                                                |

**`src/jobs/retention-scheduler.ts`** runs `PrivacyService.enforceRetentionPolicy`
for each tenant:

- **Disabled by default** (`RETENTION_JOB_ENABLED=false`). Python never deleted
  data on a timer, so enabling this is an explicit deployment decision.
- **Tenant isolation by construction**: the scheduler reads tenant ids from
  `users`, then calls the tenant-scoped service/store for each one. There is no
  global `WHERE created_at < cutoff` delete path, so one tenant's sweep cannot
  touch another tenant's rows.
- **Single flight**: overlapping ticks are skipped and logged, not queued.
- **Deferred first run**: the first sweep happens one interval after boot, not
  during startup.
- **Observable**: each run logs tenant counts, rows touched, failures and
  duration (`[retention] ...`), and per-tenant failures are counted without
  aborting the rest of the sweep.
- The timer is `unref()`ed so it never keeps the process alive.

**`src/cli/retention.ts`** is the manual operational path:

```bash
npm run retention:run -- --dry-run
npm run retention:run -- --user-id <uuid> --raw-resume-ttl-days 30 --chat-ttl-days 365
```

It shares the scheduler/service code, prints one JSON result on stdout
(operational logs go to stderr), exits non-zero if any tenant failed, and
supports `--dry-run` (count rows without mutating) plus `--help`. Defaults are
the Python TTLs (90/365 days).

Destructive privacy cascades keep the Phase 15 ordering and are intentionally
not autonomous: GDPR Art. 17 erasure still requires the authenticated route (or
an explicit operational call to `PrivacyService`), never a scheduled sweep.

Phase 16 adds 17 tests (scheduler behavior, CLI parsing/execution, store count
helpers and config defaults), bringing the suite to 765 tests / 185 suites.

## Observability, health, readiness, and metrics (Phase 17)

Phase 17 makes the Node backend operably equivalent to FastAPI without changing
any response contract clients rely on.

### Health and readiness

- `GET /health` and `GET /api/health` remain **public liveness** probes. They
  return process status, timestamp, uptime and version only — no dependency
  data.
- `GET /health/ready` and `GET /api/health/ready` are **authenticated deep
  readiness** probes with the same JSON shape as Python:
  - `services.database` — a real round trip through the shared
    `WorkspaceQueryStore.ping()` (never tenant data), plus `type`
    (`supabase_postgresql` / `sqlite_fallback`) and `latency_ms`.
  - `services.llm` — `configured` with the rotating model names, or
    `unconfigured`/`error`. The API key is never returned.
  - `services.auth` — `local_dev`, `supabase_jwt` or `unconfigured_jwt`.
- Status semantics match Python: `200 healthy`, `200 degraded` when the SQLite
  fallback is active or the LLM is unconfigured, `503 unhealthy` when the
  database ping fails. Error replies expose only the exception **type**, so
  connection strings, credentials and stack traces never leak.
- Liveness and readiness routes are registered individually so request metrics
  use the real path instead of `unmatched`.

### Metrics export

`/api/metrics` keeps the Phase 7 contract: `Accept: text/plain` returns the
Prometheus exposition format and any other `Accept` returns the JSON summary;
the route is authenticated. Metric names stay stable for existing alerts and
scraping:

- `recruitai_requests_total{endpoint,status}`
- `recruitai_queue_depth`
- `recruitai_tokens_total{type}`
- `recruitai_llm_cost_usd`

The request middleware labels requests with the **matched route template**
(`req.baseUrl + req.route.path`), so cardinality stays bounded; unmatched paths
share the `unmatched` label. Python defines `record_request` but never calls it,
so Node is the first runtime to populate these counters.

### Request ids and log correlation

`src/middleware/request-id.ts` runs first, before metrics, CORS, rate limiting
and body parsing:

- reuses a short, URL-safe inbound `X-Request-ID` or mints a UUID;
- echoes the id on every response, including 401/404/422/500;
- opens an AsyncLocalStorage scope so logs emitted _before_ authentication still
  carry `request_id`;
- `requireAuth` then builds the full request context with the same id, adding
  `user_id`, `tenant_id` and (when resolved) `session_id`.

The structured logger injects these identity fields into every record and makes
them authoritative over caller-supplied values, so a log call cannot spoof
another tenant.

### Errors and audit trails

Every router throws `HttpError`/`ValidationError` and lets the single terminal
handler map the response; no route writes its own 5xx. The handler now logs
`HttpError` 5xx responses as well as unhandled exceptions with `request_id`,
tenant identity, method/path and duration, while the client still sees only
`{ detail }` (plus an opaque `ref` for unhandled errors).

Sensitive actions go through `src/telemetry/logging.ts` on the dedicated
`recruitai.audit` logger:

- `GDPR_ERASURE` (candidate cascade),
- `GDPR_ACCOUNT_ERASURE` (tenant purge),
- `WORKSPACE_RESET`.

Each record includes `audit_action`, the tenant/user id, and the active
`request_id`/`session_id`. Payment changes remain auditable through the
`credit_transactions` ledger, matching Python.

Phase 17 adds 18 tests (readiness healthy/degraded/unhealthy/auth, request-id
propagation, error-log fields, metrics Accept/name stability, audit records),
bringing the suite to 783 tests / 188 suites.

## Verification, parity, and cutover (Phase 18)

Phase 18 closes the migration with behaviour-level verification rather than only
a green build.

### Parity matrix and focused suites

`tests/PARITY.md` maps the 33 archived FastAPI test modules (branch
`archive/fastapi-backend`) to the Node suites that own the same behaviour, and
records the three intentional gaps (Python span tracing, live network smoke
tests, Supabase-REST transport). Every Phase 18 focus area has a dedicated
owner:

| Area                                       | Suite(s)                                                                                      |
| :----------------------------------------- | :-------------------------------------------------------------------------------------------- |
| Auth extraction/failures, tenant isolation | `auth.test.ts`, `session-routes.test.ts`, `evaluate-routes.test.ts`                           |
| Credit consumption, 402, quota edges       | `payment-service.test.ts`, `payments-routes.test.ts`, `quota.test.ts`, `email-routes.test.ts` |
| Webhook signature verification             | `payment-service.test.ts`, `payments-routes.test.ts`                                          |
| Outreach persistence/isolation             | `email-routes.test.ts`, `email-tool.test.ts`                                                  |
| Session CRUD                               | `session-routes.test.ts`, `client-contract.test.ts`                                           |
| Ingest outcomes and dedupe                 | `ingest-routes.test.ts`, `ingestion-service.test.ts`, `document-parser.test.ts`               |
| Job/SSE lifecycle                          | `chat-job-manager.test.ts`, `redis-job-manager.test.ts`, `chat-routes.test.ts`                |
| Privacy cascade and retention              | `privacy-routes.test.ts`, `retention-scheduler.test.ts`, `retention-cli.test.ts`              |

`tests/client-contract.test.ts` pins only the response fields the shipped
clients read: the mobile `Candidate` / `ChatSession` / `ChatApiResponse` /
`CandidateEvaluation` shapes, the analytics types in
`frontend/src/lib/analyticsTypes.ts`, the outreach history/stats shape, the
pricing/credit ledger fields, and the GDPR export/audit fields. It fails on
shape drift even when the behaviour still works.

### Dual-run parity checker

`scripts/parity-check.mjs` (`npm run parity:check`) compares a running FastAPI
backend (the archived implementation or a still-deployed legacy service) with
the Express backend, read-only:

```bash
PYTHON_BASE_URL=http://127.0.0.1:8000 \
NODE_BASE_URL=http://127.0.0.1:8001 \
PARITY_BEARER_TOKEN=<token> \
npm run parity:check
```

- Compares status codes, JSON content types and key/type shapes across root,
  health, plans, `users/me`, sessions (list and missing detail), all analytics
  endpoints, billing, email history/stats, bias audit, GDPR user export,
  reports by session, metrics (JSON and Prometheus), and authenticated
  readiness.
- `PARITY_STRICT_DATA=true` adds scalar values and array lengths; use it only
  when both backends share one database and tenant.
- Always ignores process-local metric maps (`latencies_ms`, `status_breakdown`,
  `error_breakdown`) and volatile timestamps. `null`-vs-value differences and
  open map keys (`preferences`, `evaluations`) are warnings in shape mode.
- Exit code `0` means parity; `1` means drift or a failed request.

Verified locally: **25/25 checks pass** in shape mode with both backends on
their SQLite fallbacks. To reproduce without touching Supabase, check out the
archived backend in a worktree, start both with local auth and SQLite, and
compare:

```bash
# FastAPI (SQLite fallback because the Supabase keys are empty)
git worktree add /tmp/recruitai-fastapi archive/fastapi-backend
cd /tmp/recruitai-fastapi/backend
USE_LOCAL_AUTH=true SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= PORT=8010 \
  venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8010

# Express (SQLite fallback because DATABASE_URL is unset)
cd /path/to/RecruitAI/backend
USE_LOCAL_AUTH=true SQLITE_FALLBACK_PATH=/tmp/recruitai-parity.db PORT=8011 \
  ./node_modules/.bin/tsx src/main.ts

# Compare
PYTHON_BASE_URL=http://127.0.0.1:8010 NODE_BASE_URL=http://127.0.0.1:8011 \
  PARITY_BEARER_TOKEN=local-token npm run parity:check
```

The only shape-mode warning in that run is array length on
`analytics/candidates-over-time`, because the two fallback databases hold
different rows. Shared-database strict mode is part of the cutover procedure.

### Cutover and rollback

`../docs/cutover.md` is the operational procedure: preconditions (same database,
JWT secret, integrations, CORS, queue mode, retention ownership), dual-run
validation, representative write flows, client switch order (internal web →
public web → mobile), post-cutover checks, and a step-by-step rollback with
in-flight async job handling. `../docs/runbooks.md` links to it from the
incident index and from the 5xx mitigation path.

Phase 18 adds 11 client-contract tests plus the parity tooling, bringing the
suite to 794 tests / 194 suites.

## Deployment and production hardening (Phase 19)

Phase 19 turns the Node backend into a deployable service and closes the
production-safety gaps that only appear outside development. The canonical
deployment contract is [`../docs/deployment.md`](../docs/deployment.md);
incident procedures are in [`../docs/runbooks.md`](../docs/runbooks.md) and the
switchover steps in [`../docs/cutover.md`](../docs/cutover.md).

### Artifact and entrypoint

- `Dockerfile` is multi-stage: `npm ci` + `tsc` in a build stage, then a runtime
  stage with production dependencies and `dist/` only, running as the non-root
  `node` user.
- `CMD ["node", "dist/main.js"]` loads `.env` only when present (platform
  variables always win), validates config, sets the log level, runs the
  production preflight, then starts the retention scheduler and HTTP server.
- `RELOAD` is accepted for compatibility but has no effect on the built server;
  `npm run dev` (`tsx watch`) is the development loop.
- The container healthcheck calls the public `/health` liveness route.
  Readiness (`/api/health/ready`) is authenticated and is used as a post-deploy
  check.
- `../render.yaml` is the concrete deployment target: a Docker web service
  rooted at `backend`, `/health` health check, non-secret production values
  inline, and every credential marked `sync: false` so Render prompts for it.
- The archived FastAPI developer REPL is intentionally not replaced: it was an
  interactive development tool, not an operational command. The HTTP API,
  retention CLI and preflight CLI cover the ops surface.

### Production preflight

`src/config/preflight.ts` is side-effect free, prints no secret values, and is
shared by two entrypoints:

- `npm run preflight` (`tsx src/cli/preflight.ts`) for a deployment environment;
- the compiled `node dist/cli/preflight.js` for containers and CI;
- `src/main.ts`, which runs the same evaluation at production startup.

Hard failures (exit `1`, server refuses to listen): non-production
environment, missing required keys, unverified `LLM_DATA_USE_MODE`, missing or
< 32-character/placeholder JWT secret, missing or non-PostgreSQL `DATABASE_URL`,
`USE_LOCAL_AUTH=true`, empty/loopback/invalid CORS origins, placeholder
integration secrets, and partial SMTP or Razorpay configuration.

Warnings (deployment continues): kill switch on, non-default JWT audience,
SMTP/Razorpay absent (simulation mode), Redis absent (single instance),
retention scheduler enabled, limiter disabled, debug logging, and
`TRUST_PROXY=true`.

CI runs `node dist/cli/preflight.js` against a complete fixture production
environment, so a change that breaks the gates fails the pipeline before
deploy.

### Request rate limiting

`src/middleware/rate-limit.ts` adds a dependency-free fixed-window limiter:

- enabled by default only when `ENVIRONMENT=production`;
- keyed by `req.ip` (proxy-aware only when `TRUST_PROXY=true`);
- `429` + `Retry-After` with the standard `{ "detail": "..." }` body, emitted
  after CORS so browsers can read it and before parsing so abuse is cheap;
- bounded memory: expired windows are pruned and the oldest is evicted at
  10,000 tracked keys;
- fleet-wide when `REDIS_URL` is configured (one atomic `INCR` + `PEXPIRE`
  key); without Redis the same fixed window is enforced per process and is a
  development fallback only.

### Log and metric export

- Structured logs already go to stdout/stderr as one JSON object per line;
  `LOG_LEVEL` controls verbosity. The request id is on every line and every
  response, and sensitive fields (`prompt`, `resume`, `completion`, `text`,
  `message`, `email`, `phone`) are never logged.
- `/api/metrics` keeps its Phase 7/17 contract and stable metric names. It is
  authenticated, so Prometheus scrapes it with an HS256 service token
  (`aud=authenticated`, UUID `sub`) stored as a secret. Configuration is in
  `docs/deployment.md`.
- Secrets live in the platform store (Render env vars; `sync: false` in the
  blueprint) and never in git or the image. Preflight reports check names, not
  values.

### Operational commands

| Command                                   | Use                                             |
| :---------------------------------------- | :---------------------------------------------- |
| `npm run preflight`                       | Validate a deployment environment (hard gates). |
| `node dist/cli/preflight.js`              | Same check from the built image/CI.             |
| `npm run retention:run -- --dry-run`      | Preview tenant-scoped retention.                |
| `npm run retention:run -- --user-id <id>` | Sweep one tenant manually.                      |
| `npm run parity:check`                    | Read-only FastAPI vs Express comparison.        |
| `npm start`                               | Run the built server.                           |

Phase 19 adds focused tests for the limiter, preflight report and dynamic log
level, bringing the suite to **823 tests / 198 suites**, and the Node job in
`.github/workflows/ci.yml` gates lint, formatting, typecheck, tests, build and
preflight.

## Post-cutover stabilization (Phase 20)

Phase 20 is the live-traffic phase: some regressions only appear under real
data, real tokens and real payment traffic. The repository cannot prove
production stability without a cutover, so this phase ships the verification
harness and the operating procedure, then the soak itself runs against the
deployed Node service.

### Stabilization probe

`npm run stabilize` (`src/cli/stabilization.ts`) is read-only and safe against
production. It probes:

| Probe                             | What it proves                                                      |
| :-------------------------------- | :------------------------------------------------------------------ |
| `GET /health`                     | Process is serving and reports healthy.                             |
| `GET /api/health/ready`           | Database round trip, backend type, auth mode and LLM configuration. |
| `GET /api/metrics` (JSON)         | Status buckets, queue depth, reported SLO fields.                   |
| `GET /api/metrics` (`text/plain`) | All four stable metric names are exported.                          |

It then evaluates the cutover watch list:

| Signal              | Default   | Behaviour                                       |
| :------------------ | :-------- | :---------------------------------------------- |
| 5xx rate            | `<= 0.1%` | Fail (availability SLO budget).                 |
| Queue depth         | `<= 50`   | Fail (Runbook 3 threshold).                     |
| SQLite fallback     | `0`       | Fail in production.                             |
| Local dev auth      | `0`       | Fail in production.                             |
| Readiness           | `healthy` | `degraded` warns; `503`/unhealthy fails.        |
| 401 rate            | `<= 2%`   | Warn, or fail with `STABILIZATION_STRICT=true`. |
| 402 rate            | `<= 5%`   | Warn, or fail in strict mode.                   |
| 422 rate            | `<= 2%`   | Warn, or fail in strict mode.                   |
| Webhook 5xx         | `0`       | Fail.                                           |
| Webhook 4xx         | `0`       | Warn (invalid signature/payload).               |
| Python 5xx baseline | no drift  | Warn; optional canary comparison.               |

Below `STABILIZATION_MIN_REQUESTS` (default 100), rate checks are skipped
because one request would look like a spike.

```bash
cd backend
STABILIZATION_BASE_URL=https://<node-host> \
STABILIZATION_BEARER_TOKEN=<service token> \
npm run stabilize

# Optional Python canary during the soak
STABILIZATION_BASE_URL=https://<node-host> \
STABILIZATION_PYTHON_BASE_URL=https://<python-host> \
STABILIZATION_BEARER_TOKEN=<service token> \
npm run stabilize
```

Exit `0` means no hard failures; `1` means an outage-level signal or strict-mode
warning; `2` is a usage error. `--json` emits a machine-readable report for a
dashboard or incident record.

For local verification against a development server, the opt-in flags
`STABILIZATION_ALLOW_DEGRADED=true`, `STABILIZATION_ALLOW_SQLITE=true` and
`STABILIZATION_ALLOW_LOCAL_AUTH=true` prevent expected dev-only warnings from
failing the probe. Never set those against a production cutover.

### Webhook outcome logging

The Razorpay webhook now logs one classified outcome per accepted delivery
(`processed`, `skipped` or `ignored`) on `recruitai.payments.webhook`. It logs
the event/action and outcome only — no payload, amount, email or candidate
data — so stabilization can distinguish a handled event from a rejected
signature or a 5xx.

### Operating procedure

The cadence, client verification matrix, behavior-difference register and exit
criteria live in [`../docs/cutover.md`](../docs/cutover.md) §7. Incident
diagnostics, ledger reconciliation SQL and the rollback path live in
[`../docs/runbooks.md`](../docs/runbooks.md) Runbook 8. Watch thresholds and the
known `slo_health` accounting caveat are in
[`../docs/slo.md`](../docs/slo.md).

This phase does not change contracts: the probe consumes the Phase 7/17 metrics
and Phase 17 readiness shapes, and the client smoke checks reuse the Phase 18
contract suite.

Phase 20 adds focused tests for the probe evaluation, thresholds and
configuration, bringing the suite to **840 tests / 202 suites**.

## Reliability operations and scale validation (Phase 24)

Phase 24 turns the Phase 21/22/23 safeguards into one operating model.

### Dependency breakers

`src/resilience/breaker.ts` is a generic circuit breaker used by every external
dependency. `ModelCircuitBreaker` and `RedisModelCircuitBreaker` are now thin
subclasses, so the Phase 8 LLM behavior (rotation, kill switch, budget lease)
and its public exports are unchanged.

| Dependency | Default trip | Cooldown | Caller behavior when OPEN                                        |
| :--------- | :----------: | :------: | :--------------------------------------------------------------- |
| `gemini`   |  3 failures  |   60 s   | Skip the model; rotate; fall back when every model is open       |
| `tavily`   |  3 failures  |   60 s   | Deterministic JD/salary/skill fallbacks                          |
| `smtp`     |  3 failures  |   60 s   | Failed/simulated dispatch contract; request returns promptly     |
| `razorpay` |  3 failures  |   60 s   | Development uses mock orders; production fails fast              |
| `postgres` |  5 failures  |   30 s   | `withTransaction` short-circuits; terminal handler returns 503   |
| `redis`    |  3 failures  |   15 s   | Local caches/limits/breakers; async enqueue 503 in degraded mode |

- Only connectivity, timeout, 5xx and 429/rate-limit failures count; validation
  and business errors pass through without opening a circuit.
- `runWithBreaker()` in `src/resilience/dependencies.ts` is the call-site API.
  `recordDependencyProbe()` feeds readiness results into the same state.
- State is fleet-wide in Redis (`recruitai:breaker:<dependency>:<operation>:*`)
  when `REDIS_URL` is set, with automatic local fallback if Redis itself fails.
- `RESILIENCE_BREAKERS_ENABLED=false` is an incident-triage bypass only.
- Every transition updates `recruitai_dependency_circuit_state` and
  `recruitai_dependency_circuit_trips_total`, plus a
  `dependency_breaker:<name>` structured event.

### Graceful degradation

- **Postgres**: new transactions fail fast when the circuit is open. The
  terminal error handler maps `CircuitOpenError` and transient driver errors
  (`ECONNREFUSED`, `08xxx`, `57P0x`, timeouts, …) to `503` with `Retry-After: 5`
  and one stable, detail-free message.
- **Redis**: readiness/PING failures refresh the Redis breaker. By default they
  make readiness report `503`, preserving Phase 21 drain semantics. With
  `REDIS_DEGRADED_MODE_ENABLED=true`, readiness reports `200 degraded`, sync
  chat keeps working from local state, and async enqueue returns `503` instead
  of waiting on a dead connection. `REDIS_HEALTH_CACHE_MS` (default `5000`)
  bounds probe frequency.
- **LLM outage**: `userSafeLlmFailure()` in `src/llm/errors.ts` replaces
  provider/budget/breaker errors with one user-safe sentence in chat nodes, job
  `error` fields and the SSE `error` event. Generic validation errors keep their
  historical text, and operator logs still contain the real cause.

### Tracing

`src/telemetry/tracing.ts` now provides `AsyncLocalStorage` trace context and
W3C `traceparent` parsing/formatting. `createTracingMiddleware()` opens one HTTP
span per request (adopting an inbound `traceparent` and echoing one back).
Chat enqueue serializes the context into the job payload; workers resume it, so
one trace covers HTTP → queue → `chat.agent_turn` → `agent.node` → `db.*` /
`external.*` calls. Attribute keys containing prompt/resume/candidate/email/
content/secret fragments are dropped before they are recorded.

### Load and chaos suite

`scripts/load/` contains k6 profiles for sustained load, mixed frontend/mobile
traffic (sync chat, async polling, SSE, sessions CRUD, analytics reads, ingest
uploads and payment verify), soak, spike and dependency chaos, plus
`chaos-drill.sh` for operator-supplied fault injection.
The suite runs from `.github/workflows/load.yml` on a nightly schedule or manual
dispatch and skips cleanly until `LOAD_BASE_URL` / `LOAD_AUTH_TOKEN` secrets
exist. It is intentionally not a per-commit gate. Scenario sizing, contract
targets and every scaling lever are in
[`scripts/load/README.md`](scripts/load/README.md).

Phase 24 adds focused breaker, classifier, tracing, degraded-mode and
user-safe-error tests; the full suite runs with `npm test`.

## App wiring and error handling

`createApp({ config })` assembles the stack in the same order as `app/main.py`:

1. **Request id** (outermost): resolves/echoes `X-Request-ID` and opens the
   correlation scope used by logs for the whole request.
2. **Tracing**: opens the request span, adopts inbound W3C `traceparent`, and
   keeps the trace context active for all downstream async work.
3. **Request metrics**: records every finished response, including errors and
   404s.
4. **CORS**: `ALLOWED_ORIGINS` plus the Vercel preview regex,
   `credentials=true`, fixed method list, reflected preflight headers, 600 s
   max-age, and Starlette's `200` preflight status.
5. **Rate limit**: fixed-window limiter (Phase 19), fleet-wide through Redis
   when configured, enabled by default only in production. Runs after CORS so a
   browser can read the 429, and before parsing so rejected requests are cheap.
6. **Razorpay webhook** (`/api/payments/webhook`): scoped raw-body parsing,
   mounted before the JSON parser so HMAC verification uses the exact bytes.
7. **JSON body parsing** via `src/middleware/json-body.ts` (`strict: false` so
   primitive JSON roots reach the validators; interim 25 MB limit).
8. **Public health routes**: `/`, `/health`, `/api/health` — mounted before the
   API router so they never inherit route-level auth.
9. **Authenticated readiness**: `/health/ready`, `/api/health/ready`.
10. **Feature routers under `/api`** — each router applies `requireAuth()`
    itself, matching FastAPI's per-route dependency. `/api/chat` receives the
    shared `CampaignService` and `ChatJobManager` built by the app factory so
    sync turns, queued turns and SSE all use the same instances. The Phase 15
    routers share one `WorkspaceQueryStore`; `createApp({ workspaceQueryStore })`
    lets tests inject an isolated SQLite store, which is how the Phase 15 suite
    runs without Postgres.
11. **JSON 404** — `{ "detail": "Not Found" }` for unmatched paths.
12. **Terminal error handler** (last):

- `HttpError` subclasses render their status, headers and `{ detail }`
  (401 Bearer challenge, 402 quota body, 403 denials).
- validation failures render FastAPI's `422` `{ detail: [...] }` shape.
- malformed JSON becomes `422 json_invalid` (not body-parser's 400) and an
  oversized body becomes `413`.
- an OPEN dependency circuit or a transient database connectivity failure
  returns `503` with `Retry-After: 5` and one user-safe detail.
- anything unhandled returns `500` with
  `{ detail: "An unexpected server error occurred. (ref=<8 hex>)", ref }`;
  the ref and error details are logged server-side only.

Multipart uploads are not parsed globally; `src/middleware/upload.ts` exports a
memory-storage middleware for the ingest routes (Phase 12), along with the
existing 15 MB per-file / 10 files-per-batch limits.

Bootstrap (`src/main.ts`) also starts the Phase 16 retention scheduler after
the app is created. `start()` is a no-op unless `RETENTION_JOB_ENABLED=true`,
and the timer is stopped on shutdown. Phase 21 adds the event-loop monitor,
worker-pool lifecycle and the `SIGTERM`/`SIGINT` drain described in
[Stateless application core](#stateless-application-core-phase-21).

Intentionally absent: security headers, trusted-host checks, and timing
middleware. Do not add them without marking them as new hardening and keeping
response shapes unchanged. Request-id propagation _is_ present now (Phase 17),
metrics moved to Phase 7, readiness to Phase 17, and global rate limiting to
Phase 19.

## Validation and API contracts

`src/schemas/` mirrors every Pydantic model in `app/schemas/` **and** the inline
models/query/form/header parameters declared in the route modules. Zod is the
single validation library. Request types are `z.infer` outputs, i.e. the value
after Pydantic-style coercion and unknown-key stripping.

Pydantic v2 lax-mode behaviour is reproduced rather than Zod's stricter default:

| Type    | Accepted inputs (examples)                                                            |
| ------- | ------------------------------------------------------------------------------------- |
| `int`   | `"2"`, `"2.0"`, `"1_0"`, `true` → `1`, `2.0` → `2`; `1.5` → `int_from_float`          |
| `float` | `"1.5"`, `"1e3"`, `"1_0"`, `true` → `1`                                               |
| `bool`  | `"true"/"yes"/"on"/"t"/"1"` → `true`; `"false"/"no"/"off"/"f"/"0"` → `false`; `0`/`1` |
| `str`   | strings only (numbers are `string_type`, not coerced)                                 |

Other preserved semantics:

- `Optional[T] = None` → `.nullable().default(null)`; a non-optional list
  defaults to `[]` and rejects an explicit `null` with `list_type`.
- `Dict[str, Any]` rejects non-objects with `dict_type`.
- Unknown keys are stripped, matching Pydantic's default `extra="ignore"`.
- `EmailRequest.recipient_email` is trimmed and checked with
  `^[^\s@]+@[^\s@]+\.[^\s@]+$`; failures render the Python message
  `Value error, Invalid recipient email format: '<clean>'`.
- Credit `amount` keeps `ge=1`; evaluation `tech_score`/`comm_score` keep
  `ge=1, le=5`.
- `RetentionRunRequest` keeps its unconstrained, nullable defaults (90/365).

### Validators

| Helper                                     | Use                                             |
| ------------------------------------------ | ----------------------------------------------- |
| `validateBody(schema)`                     | JSON body; missing/`null` → 422 `missing`       |
| `validateBody(schema, { required:false })` | optional body; missing/`null` → schema defaults |
| `validateForm(schema)`                     | multipart fields after multer                   |
| `validateQuery(schema)`                    | query string; stores on `req.validatedQuery`    |
| `validateHeaders(schema)`                  | headers; stores on `req.validatedHeaders`       |
| `getValidatedQuery<T>(req)`                | typed accessor for the parsed query             |
| `getValidatedHeaders<T>(req)`              | typed accessor for the parsed headers           |
| `serializeResponse(schema, value)`         | strip unknown response keys / serialise dates   |

Query validation stores its output on `req.validatedQuery` because Express 5's
`req.query` is read-only in practice. Repeated scalar parameters use the last
value, matching FastAPI. Path parameters are plain strings in Python and are not
schema-validated.

### 422 error shape

Invalid input is rejected before any handler runs, with FastAPI's body:

```json
{
  "detail": [
    {
      "type": "greater_than_equal",
      "loc": ["body", "amount"],
      "msg": "Input should be greater than or equal to 1",
      "input": 0,
      "ctx": { "ge": 1 }
    }
  ]
}
```

`loc` is prefixed with `body`, `query`, or `header`. A missing JSON body is
`{"type":"missing","loc":["body"],"msg":"Field required","input":null}`; a
non-object JSON root is `model_attributes_type`; malformed JSON is
`json_invalid` on `["body", position]`.

`JSON_BODY_LIMIT` (25 MB) is an interim guard because body-parser requires a
limit while FastAPI does not have one. Phase 23 replaces it with stream-limited
parsing and the fair-use limits from `docs/slo.md`.

## Contract rule

Public API shapes match the FastAPI contracts the shipped clients were built
against. Changes require explicit review and a matching client-contract test.

## Notes

- The FastAPI source is preserved on `archive/fastapi-backend` for reference
  and for the production cutover/rollback window.
- Scale architecture (Redis jobs/SSE, pooling, rate limits) is described in
  Phases 21–24: Redis-backed jobs/SSE, caches, breakers, limits and locks, plus
  worker-thread offloading and `SIGTERM` drain; in-memory implementations remain
  for local development and tests.
