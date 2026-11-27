# Backend cutover and rollback

Operational procedure for moving RecruitAI traffic from the legacy FastAPI
deployment to the Express/TypeScript backend in `backend/`. The FastAPI source
is preserved on the `archive/fastapi-backend` branch; the main tree ships only
the Express backend.

The cutover is **reversible at every step**. Both services speak the same HTTP
contract, read and write the same PostgreSQL schema, and are deployed
independently. No client-visible URL changes are required: the client switch is
a base-URL change (`NEXT_PUBLIC_BACKEND_URL`, `EXPO_PUBLIC_BACKEND_URL`) or a
reverse-proxy upstream change.

Related documents:

- `docs/runbooks.md` — incident procedures once Node is serving traffic.
- `docs/slo.md` — SLIs/SLOs and the metrics contract.
- `backend/tests/PARITY.md` — archived FastAPI test module → Node suite matrix
  and the intentional gaps.

---

## 0. Preconditions

Do not start the cutover until every row is true.

| Requirement                     | Check                                                                                                                      |
| :------------------------------ | :------------------------------------------------------------------------------------------------------------------------- |
| Node phase gate is green        | `cd backend && npm test && npm run lint && npm run typecheck && npm run build && npm run format:check`                     |
| Node reaches the same database  | `DATABASE_URL` or `SUPABASE_DB_URL` points at the production PostgreSQL instance (direct TCP, not the PostgREST URL)       |
| Auth material matches legacy    | Same `SUPABASE_JWT_SECRET`, `SUPABASE_JWT_AUDIENCE`, and `USE_LOCAL_AUTH` policy                                           |
| Product integrations match      | Same `GEMINI_API_KEY`, `TAVILY_API_KEY`, SMTP settings, Razorpay keys/webhook secret                                       |
| CORS knows the clients          | `ALLOWED_ORIGINS` includes every web origin that currently calls the legacy service                                        |
| Queue mode is decided           | Either `REDIS_URL` unset (in-memory jobs) or a Redis instance both acceptable to keep and able to drain                    |
| Retention ownership is explicit | `RETENTION_JOB_ENABLED` stays `false` on Express while the legacy service runs its own job; never let two schedulers sweep |
| Legacy service is warm          | The FastAPI deployment stays running at its current image for the whole soak                                               |
| No DDL is planned               | Express performs no schema migrations at cutover; it reads/writes the existing schema                                      |

Express needs a direct Postgres connection string. The legacy `SUPABASE_URL` is
not enough: Drizzle uses `drizzle-orm/node-postgres` over TCP. If only the
Supabase URL is available, Express silently falls back to SQLite, which is fine
for shape checks and unacceptable for cutover (readiness reports
`type: sqlite_fallback`).

---

## 1. Dual-run preparation

1. Deploy the Node service on its own host/port, with production configuration.
   Keep it out of the public client path.
2. Confirm liveness and readiness:
   ```bash
   curl -fsS https://<node-host>/health
   curl -fsS -H "Authorization: Bearer $TOKEN" https://<node-host>/api/health/ready | jq
   ```
   Expected: `"status": "healthy"` and
   `services.database.type == "supabase_postgresql"`. `degraded` with
   `sqlite_fallback` means the connection string is wrong — stop here.
3. Confirm logs carry `request_id`, `user_id`, `tenant_id` and `session_id`, and
   that `X-Request-ID` is echoed.
4. Confirm metrics:
   ```bash
   curl -fsS -H "Authorization: Bearer $TOKEN" https://<node-host>/api/metrics
   curl -fsS -H "Authorization: Bearer $TOKEN" -H 'Accept: text/plain' https://<node-host>/api/metrics
   ```
   Both must expose `recruitai_requests_total`, `recruitai_queue_depth`,
   `recruitai_tokens_total` and `recruitai_llm_cost_usd`.

During this window both backends write to the same database. That is safe:
Express and the legacy service use the same tables and the same tenant scoping. Do not run the
retention scheduler on both sides, and do not import bulk data from both.

---

## 2. Read-only parity validation

Run the parity checker against the live pair:

```bash
cd backend
PYTHON_BASE_URL=https://<python-host> \
NODE_BASE_URL=https://<node-host> \
PARITY_BEARER_TOKEN=<<a real user token> \
npm run parity:check
```

- Default mode compares status codes, content types and JSON key/type shapes
  for root, health, plans, users/me, sessions, all analytics endpoints, billing,
  email history/stats, bias audit, metrics (JSON and Prometheus) and readiness.
- `PARITY_STRICT_DATA=true` also compares scalar values and array lengths. It is
  meaningful only when both backends read the same database and tenant; run it
  with a seeded staging account before touching production data.
- Exit code `0` is required. Warnings about nullable fields, empty arrays or
  open preference maps are data differences, not contract drift — confirm each
  one is explained by different data, not by a missing field.
- A missing bearer token skips every authenticated check. A conditional pass
  with `skipped` rows is not a pass.

For a local dry run, check the archived implementation out of the preservation
branch and run both services on their SQLite fallbacks:

```bash
git worktree add /tmp/recruitai-fastapi archive/fastapi-backend
cd /tmp/recruitai-fastapi/backend
USE_LOCAL_AUTH=true SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= PORT=8010 \
  venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8010
```

The Express side uses `USE_LOCAL_AUTH=true`, an empty `DATABASE_URL`, and a
temporary `SQLITE_FALLBACK_PATH`; the exact commands are in
[`backend/README.md`](../backend/README.md#dual-run-parity-checker).

Use a dedicated staging tenant for strict mode, and compare the same session
ids on both sides. Shape mode alone does not prove data-dependent branches
(credit balances, shortlist ordering, analytics aggregation).

---

## 3. Representative write validation

On the staging tenant, exercise each write path against Express and compare the
response with the legacy service for the same inputs:

| Flow                | Endpoint(s)                                                                                                                        | What must match                                                                             |
| :------------------ | :--------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------ |
| Session lifecycle   | `POST/GET/PATCH/DELETE /api/sessions`, `GET /api/sessions/:id`                                                                     | ids, titles, `conversation_history`, `resumes`, `last_shortlist`, `scheduled_interviews`    |
| Chat (sync + async) | `POST /api/chat`, `GET /api/chat/jobs/:id`, `.../stream`                                                                           | response fields, 202 envelope, job status transitions, SSE event framing and terminal event |
| Ingest              | `POST /api/ingest/upload`, `POST /api/ingest/upload-jd`                                                                            | per-file results, deterministic dedupe, job/session binding, 207 on partial failure         |
| Evaluation + ATS    | `POST /api/candidates/evaluate`, `POST /api/candidates/:id/status`, `POST /api/export/ats`                                         | rubric persistence, `new_status`, JSON map and CSV header                                   |
| Email + credits     | `POST /api/email/send`, `GET /api/email/history`, `GET /api/email/stats`                                                           | simulated/sent status, credit deduction, 402 on insufficient balance, isolation             |
| Billing             | `POST /api/payments/order`, `POST /api/payments/verify`, `POST /api/payments/webhook`                                              | order envelope, signature acceptance/rejection, subscription activation, ledger rows        |
| Privacy             | `GET /api/privacy/export/:id`, `DELETE /api/privacy/candidates/:id`, `GET /api/privacy/user/export`, `GET /api/privacy/bias-audit` | export shape, cascade deletion, audit fields                                                |
| Users               | `GET/PATCH /api/users/me`                                                                                                          | eight preference defaults, profile fields                                                   |

Test-mode payments only. Use Razorpay test keys or the documented simulated
orders; never drive a live charge during validation.

Record one comparison per row (status, body diff, database rows written) and
attach it to the cutover record. "Contracts look the same" is not evidence.

---

## 4. Client switch sequence

Switch one client surface at a time, least risky first, and watch between
steps.

1. **Internal/dashboard first.** Point a low-traffic web deployment at Node by
   setting `NEXT_PUBLIC_BACKEND_URL` to the Node host and redeploying. This is
   a static Next.js env var, so it requires a rebuild.
2. **Public web.** After the internal dashboard is clean, repeat for the
   production web deployment.
3. **Mobile.** `EXPO_PUBLIC_BACKEND_URL` is compiled into the app, so a store
   release is required. Until the new build is adopted, old binaries keep
   calling the old host. Keep both hosts serving the same contract; there is no
   forced upgrade.
4. **Reverse proxy (optional).** Alternatively, keep client URLs unchanged and
   move the upstream from FastAPI to Express. This is the fastest rollback path if
   the proxy change is a single config value.

Do not switch web and mobile in the same window. If a client-specific bug
appears, the blast radius must be one surface.

---

## 5. Post-cutover checks

### First 15 minutes

- `/health` 200 on every Node instance; `/api/health/ready` healthy (503 or
  `unhealthy` means revert).
- 5xx rate below the SLO burn threshold (`docs/slo.md`); follow Runbook 1 in
  `docs/runbooks.md` if it trips.
- Auth: no spike in 401/403 for valid tokens.
- SSE: async chat jobs reach `completed`; streams terminate with a final event
  instead of hanging.
- Credit ledger: `consume-credit`, email sends and payment activation produce
  one ledger row per action; balances match the pre-cutover snapshot for the
  test tenant.
- Outbound email: sends are `sent` or `simulated` as configured, no increase in
  `failed`.
- Database: no connection-pool exhaustion (Runbook 4), no lock contention.
- Run the stabilization probe every 15 minutes for the first hour:
  ```bash
  cd backend
  STABILIZATION_BASE_URL=https://<node-host> \
  STABILIZATION_BEARER_TOKEN=<<service token> \
  npm run stabilize
  ```
  It checks liveness, readiness (database type, auth mode, LLM), the four
  stable metrics, 5xx budget, 401/402/422 mix, webhook outcomes and queue depth.
  Exit `1` is a rollback trigger when the failure is attributable to Node.

### First 24 hours

- Compare `/api/metrics` request counts and latency with the legacy baseline
  captured before the switch. Node's RED maps are process-local, so compare
  rates, not absolute counters.
- Re-run `npm run parity:check` against the Express host and a legacy canary host
  (if one is still up) to confirm no contract drift was introduced by runtime
  configuration.
- Inspect 422 rates for new validation mismatches and 500s for unhandled
  branches.
- Verify the retention scheduler remains disabled, or enable it on Node only
  after the legacy scheduler is disabled.
- Re-run `npm run stabilize` hourly. Re-run `npm run parity:check` with a legacy
  canary URL (or a saved baseline snapshot) to confirm runtime configuration did
  not change contract behavior.

### Soak before decommission

Keep the legacy service deployed, warm and reachable for at least 7 days of normal traffic.
Rollback is a config change while it is warm; it is a redeploy afterwards.

---

## 6. Rollback plan

### Triggers

Roll back immediately when any of the following is true:

- Readiness is `unhealthy`/503 on a majority of Node instances for more than
  five minutes.
- 5xx rate exceeds the error-budget burn threshold and is attributable to Node.
- Valid-token 401/403 spikes.
- A parity check fails on auth, sessions, chat, ingest, evaluation, billing,
  privacy or analytics shapes.
- Credit balances diverge from the ledger, or duplicate charges/emails appear.
- SSE streams fail to terminate or async chat jobs stall.

### Steps

1. **Stop sending new traffic to Node.** Either revert the client base URL and
   redeploy the client, or point the reverse-proxy upstream back to FastAPI.
   Proxy rollback is immediate; client rollback needs a rebuild/release.
2. **Keep Node running but unscheduled from the public path** for log capture.
   Do not delete its logs: they are the incident record.
3. **Verify legacy health** at `/health` and `/api/health/ready`, then smoke a
   read (`GET /api/users/me`), a write (`POST /api/sessions`), and an async chat
   job.
4. **Resolve in-flight async jobs.**
   - In-memory mode: jobs die with the Node process; affected users see a
     missing job on polling. The client falls back to a new turn — acceptable,
     but record how many were open.
   - Redis/BullMQ mode: the legacy service does not consume BullMQ queues. Leave the Express
     workers running until the queue is empty, or accept and record the loss.
     Never delete the queue before draining it.
5. **Reconcile writes.** Both backends use the same database, so no data rollback
   is required. Audit the cutover window for partial flows: sessions created
   without a follow-up turn, duplicate outreach rows, credit ledger entries.
   Reverse only what is clearly duplicated, with the tenant's user id recorded.
6. **Disable Node-only schedulers** (`RETENTION_JOB_ENABLED=false`) and confirm
   the legacy scheduler is active again.
7. **File the incident** with the parity/validation record, the failing check,
   and the time of the switch back.

### After a rollback

Treat the cause as a blocker: add a regression test to the owning Node suite
(`backend/tests/`), fix it, and restart the cutover from section 1 with a
fresh parity run. Do not resume at the client-switch step.

---

## 7. Stabilization window (Phase 20)

Stabilization starts when Node receives its first production traffic and ends
only after the soak below. The goal is to find real-traffic regressions without
widening scope: fix contract, auth, money and data-integrity defects; record
everything else for later phases.

### Cadence

| Window                 | What to run                                                           | Owner            |
| :--------------------- | :-------------------------------------------------------------------- | :--------------- |
| First hour             | `npm run stabilize` every 15 minutes; follow Runbook 8 on any failure | On-call engineer |
| First 24 hours         | `npm run stabilize` hourly; review 401/402/422 and webhook deltas     | On-call engineer |
| Through the 7-day soak | Daily `npm run stabilize` and `npm run parity:check`; review SLO burn | Backend on-call  |

The probe is read-only. It exits `1` on hard failures and `0` with warnings for
signals that need judgement. Use `STABILIZATION_STRICT=true` only when the team
agrees that any warning blocks the rollout.

### Client verification

Exercise these once per client surface after switching it. Mobile is a separate
row because `EXPO_PUBLIC_BACKEND_URL` ships in the binary.

| Check                                                                 | Web | Mobile |
| :-------------------------------------------------------------------- | :-- | :----- |
| Sign-in / valid token accepted                                        | ☐   | ☐      |
| Session list loads and a session opens                                | ☐   | ☐      |
| Sync chat turn completes                                              | ☐   | ☐      |
| Async chat turn reaches `completed`; SSE closes with a terminal event | ☐   | ☐      |
| Resume/JD upload returns per-file results                             | ☐   | ☐      |
| Candidate evaluation and ATS export                                   | ☐   | ☐      |
| Analytics pages match the legacy baseline                             | ☐   | ☐      |
| Billing/credit balance and 402 message                                | ☐   | ☐      |
| Outreach history/stats and send status                                | ☐   | ☐      |
| Privacy export, bias audit, deletion cascade                          | ☐   | ☐      |

Record the client build/version next to each row. A blank row is not a pass.

### Triage and fix policy

1. **Contract or money first.** Auth/401-403 spikes, 402/quota changes, webhook
   rejection, ledger divergence and missing response fields take priority over
   latency or cosmetic differences.
2. **Reproduce before changing code.** Add the failing input to the owning
   suite in `backend/tests/`; a fix without a regression test is incomplete.
3. **Fix only the migration regression.** Do not fold in refactors, dependency
   upgrades or new features during stabilization. If the defect is a genuine
   product bug that also exists in the legacy backend, record it and schedule it separately.
4. **Document the difference.** Every intentional divergence (or legacy bug
   preserved for parity) goes in the register below and, if it changes a
   contract expectation, in `backend/tests/PARITY.md`.
5. **Roll back on the documented triggers.** Do not debug a money/auth incident
   in the serving path; switch traffic back first, then fix forward.

### Behavior-difference register

| Date | Area | Observed | Expected | Resolution | Owner |
| :--- | :--- | :------- | :------- | :--------- | :---- |
|      |      |          |          |            |       |

### Exit criteria

- Seven days of normal traffic with the legacy service still warm and deployable.
- No unexplained SEV-1/SEV-2 incident and no open contract/money defect.
- `npm run stabilize` has no hard failures and every warning is explained.
- A final parity run against the same database is clean.
- Retention has exactly one owner (Express scheduler or manual CLI, never the
  legacy service and Express together).
- Rollback remains a config change, not a redeploy, until the soak ends.

---

## 8. Decommissioning the legacy FastAPI service (after soak)

The repository already ships only the Express backend; this section retires the
still-deployed legacy service. Only after the soak and a clean parity record:

1. Freeze FastAPI writes, run one final strict parity check on the same database.
2. Export the last FastAPI metrics/log window for the SLO baseline.
3. Remove the FastAPI deployment from the proxy and autoscaling group; keep the
   image tag and this document for one release cycle.
4. Enable `RETENTION_JOB_ENABLED=true` on exactly one Express instance, or run
   the manual `npm run retention:run` schedule documented in `docs/runbooks.md`.
5. Remove the legacy service from the deployment pipeline. The source remains
   on `archive/fastapi-backend` as the historical reference and rollback image
   source.
