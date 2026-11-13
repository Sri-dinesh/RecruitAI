# RecruitAI Backend — Node.js / Express / TypeScript

Target backend for the FastAPI → Node.js migration. **Phases 1–9 complete**:
scaffold, tooling, boot, typed configuration with production gates, the
auth/request-identity foundation, Express app wiring with CORS and global error
handling, the shared validation/types contract layer, the Drizzle database
access layer, the structured logging/telemetry layer, the Gemini LLM routing
layer with safety gates, and the document/resume/JD parsing plus matching
services. The Python backend in `../backend/` remains the running service and is
untouched until cutover.

## Status

| Area                                  | Status                                  |
| ------------------------------------- | --------------------------------------- |
| Phase 1 — scaffold, tooling, boot     | ✅ complete                             |
| Phase 2 — config + production gates   | ✅ complete                             |
| Phase 3 — auth + request identity     | ✅ complete                             |
| Phase 4 — app wiring + error handling | ✅ complete                             |
| Phase 5 — validation + API contracts  | ✅ complete                             |
| Phase 6 — database access layer       | ✅ complete                             |
| Phase 7 — logging, context, telemetry | ✅ complete                             |
| Phase 8 — LLM routing + safety gates  | ✅ complete                             |
| Phase 9 — parsing + matching services | ✅ complete                             |
| Phases 10–24                          | pending (see `../Backend-Migration.md`) |

## Commands

```bash
npm install          # install dependencies
npm run dev          # tsx watch src/main.ts (development)
npm run build        # tsc → dist/
npm start            # node dist/main.js (production)
npm run typecheck    # tsc --noEmit (src + tests)
npm test             # node:test via tsx
npm run lint         # eslint .
npm run format       # prettier --write .
npm run format:check # prettier --check .
```

Default server: `http://localhost:8000` (`HOST` / `PORT` from the environment).

## Layout (mirrors the Python separation of concerns)

```
src/
├── app.ts          # Express app factory
├── main.ts         # bootstrap / entrypoint
├── routes/         # api/routes_*.py equivalents (health + empty API router)
├── config/         # app/core/config.py            (Phase 2 ✅)
├── types/          # shared contracts + HTTP errors (Phase 2 ✅)
├── auth/           # app/core/auth.py + tenancy    (Phase 3 ✅)
├── context/        # request-scoped identity (ALS) (Phase 3 ✅)
├── middleware/     # CORS, auth, errors, uploads, validators (Phase 3/4/5)
├── schemas/        # app/schemas/* + inline models            (Phase 5 ✅)
├── db/             # Drizzle + pgvector/SQLite       (Phase 6 ✅)
├── telemetry/      # app/core/logging.py/telemetry (Phase 7 ✅)
├── llm/            # app/core/llm_router.py         (Phase 8 ✅)
├── agents/         # app/graph/*                   (Phase 13)
├── rag/            # app/rag/*                     (later phases)
├── services/       # app/services/*                (Phase 9 ✅ + later phases)
│                   #   parsing, resume/JD, Tavily, matching (Phase 9 ✅)
│                   #   + quota guard + persistence  (Phases 2/6 ✅)
├── tools/          # app/tools/*                   (Phase 11/13)
└── jobs/           # app/services/job_queue.py     (Phase 14/21)
tests/              # ported pytest suite          (Phase 18)
```

## Environment

Copy `.env.example` to `.env` and fill in values. `.env` is git-ignored and is
loaded at boot via Node's built-in `process.loadEnvFile` (resolved relative to
the module, so the working directory does not matter). Real environment
variables win over file values, matching `load_dotenv` in the Python backend.

`src/config/index.ts` is the **single source of configuration**. Feature code
must call `getConfig()`; it must not read `process.env` directly.

Ported behavior from `app/core/config.py`:

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

Production gates (fail-fast at boot, before the server listens):

- **AI-SEC-1** — throws unless `LLM_DATA_USE_MODE` is exactly
  `zero_retention_verified`.
- **Required keys** — throws when `GEMINI_API_KEY`, `TAVILY_API_KEY`,
  `SUPABASE_URL`, or `SUPABASE_SERVICE_ROLE_KEY` is missing. This is
  intentional Node-side hardening: Python defines `get_missing_keys()` but never
  enforces it.
- **PORT** — a non-integer value throws instead of silently binding another
  port (mirrors the Python launcher's `int()` crash).

Credit-exhaustion responses use the frozen 402 contract in
`src/types/errors.ts` (`INSUFFICIENT_CREDITS`, message, `upgrade_url:
"/pricing"`), including the route-specific evaluation/outreach variants.

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

`src/db/client.ts` owns one `pg.Pool` and one Drizzle instance per process:

| Env                        | Default | Meaning                                 |
| -------------------------- | ------- | --------------------------------------- |
| `DATABASE_URL`             | —       | direct TCP Postgres connection string   |
| `SUPABASE_DB_URL`          | —       | fallback name when `DATABASE_URL` unset |
| `PG_POOL_MAX`              | `10`    | max connections per Node instance       |
| `PG_IDLE_TIMEOUT_MS`       | `30000` | idle connection reaping                 |
| `PG_CONNECTION_TIMEOUT_MS` | `5000`  | acquire timeout                         |

`DATABASE_URL` must be a Postgres connection string, not the Supabase project
URL (that is the PostgREST endpoint). Connections are created lazily on first
query and reused; nothing opens a connection per request. Pool math:
`PG_POOL_MAX × instance count` must stay below the Supavisor/PgBouncer
transaction-pool ceiling (Phase 22 expands this). Invalid pool values fail at
boot instead of silently changing the connection budget.

Call `closeDatabase()` during graceful shutdown. Missing configuration raises
the Python-compatible 503 (`Database service configuration missing in production
environment.`) in production.

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

## App wiring and error handling

`createApp({ config })` assembles the stack in the same order as `app/main.py`:

1. **Request metrics** (outermost): records every finished response, including
   errors and 404s.
2. **CORS**: `ALLOWED_ORIGINS` plus the Vercel preview regex,
   `credentials=true`, fixed method list, reflected preflight headers, 600 s
   max-age, and Starlette's `200` preflight status.
3. **JSON body parsing** via `src/middleware/json-body.ts` (`strict: false` so
   primitive JSON roots reach the validators; interim 25 MB limit).
4. **Public health routes**: `/`, `/health`, `/api/health` — mounted before the
   API router so they never inherit route-level auth.
5. **Feature routers under `/api`** — each router applies `requireAuth()`
   itself, matching FastAPI's per-route dependency.
6. **JSON 404** — `{ "detail": "Not Found" }` for unmatched paths.
7. **Terminal error handler** (last):
   - `HttpError` subclasses render their status, headers and `{ detail }`
     (401 Bearer challenge, 402 quota body, 403 denials).
   - validation failures render FastAPI's `422` `{ detail: [...] }` shape.
   - malformed JSON becomes `422 json_invalid` (not body-parser's 400) and an
     oversized body becomes `413`.
   - anything unhandled returns `500` with
     `{ detail: "An unexpected server error occurred. (ref=<8 hex>)", ref }`;
     the ref and error details are logged server-side only.

Multipart uploads are not parsed globally; `src/middleware/upload.ts` exports a
memory-storage middleware for the ingest routes (Phase 12), along with the
existing 15 MB per-file / 10 files-per-batch limits.

Intentionally absent (the Python backend has no such middleware): request-id,
security headers, trusted-host checks, and timing middleware. Do not add them
without marking them as new hardening and keeping response shapes unchanged.

Deep readiness (`/health/ready`, `/api/health/ready`) and metrics
(`/api/metrics`) are authenticated and arrive with the database, telemetry and
observability phases (6/7/17).

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

Public API shapes are frozen during the migration. Nothing in this scaffold
intentionally differs from the FastAPI contracts; changes require explicit review.

## Notes

- No commits are made automatically; branch: `feat/backend-express-migration`.
- Python backend stays runnable during the whole migration for parity checks.
- Scale architecture (Redis jobs/SSE, pooling, rate limits) is specified in
  Phases 21–24 of `../Backend-Migration.md`.
