# Backend cutover and rollback

Operational procedure for moving RecruitAI traffic from the FastAPI backend in
`backend/` to the Express/TypeScript backend in `backend-node/`.

The cutover is **reversible at every step**. Both services speak the same HTTP
contract, read and write the same PostgreSQL schema, and are deployed
independently. No client-visible URL changes are required: the client switch is
a base-URL change (`NEXT_PUBLIC_BACKEND_URL`, `EXPO_PUBLIC_BACKEND_URL`) or a
reverse-proxy upstream change.

Related documents:

- `docs/runbooks.md` — incident procedures once Node is serving traffic.
- `docs/slo.md` — SLIs/SLOs and the metrics contract.
- `backend-node/tests/PARITY.md` — Python test module → Node suite matrix and
  the intentional gaps.

---

## 0. Preconditions

Do not start the cutover until every row is true.

| Requirement | Check |
| :--- | :--- |
| Node phase gate is green | `cd backend-node && npm test && npm run lint && npm run typecheck && npm run build && npm run format:check` |
| Node reaches the same database | `DATABASE_URL` or `SUPABASE_DB_URL` points at the production PostgreSQL instance (direct TCP, not the PostgREST URL) |
| Auth material matches Python | Same `SUPABASE_JWT_SECRET`, `SUPABASE_JWT_AUDIENCE`, and `USE_LOCAL_AUTH` policy |
| Product integrations match | Same `GEMINI_API_KEY`, `TAVILY_API_KEY`, SMTP settings, Razorpay keys/webhook secret |
| CORS knows the clients | `ALLOWED_ORIGINS` includes every web origin that currently calls Python |
| Queue mode is decided | Either `REDIS_URL` unset (in-memory jobs) or a Redis instance both acceptable to keep and able to drain |
| Retention ownership is explicit | `RETENTION_JOB_ENABLED` stays `false` on Node while Python still runs its own job; never let two schedulers sweep |
| Python is warm and pinned | The Python deployment stays running at its current image for the whole soak |
| No DDL is planned | Node performs no schema migrations at cutover; it reads/writes the existing schema |

Node needs a direct Postgres connection string. Python's `SUPABASE_URL` is not
enough: Drizzle uses `drizzle-orm/node-postgres` over TCP. If only the
Supabase URL is available, Node silently falls back to SQLite, which is fine for
shape checks and unacceptable for cutover (readiness reports
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
Node and Python use the same tables and the same tenant scoping. Do not run the
retention scheduler on both sides, and do not import bulk data from both.

---

## 2. Read-only parity validation

Run the parity checker against the live pair:

```bash
cd backend-node
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

Use a dedicated staging tenant for strict mode, and compare the same session
ids on both sides. Shape mode alone does not prove data-dependent branches
(credit balances, shortlist ordering, analytics aggregation).

---

## 3. Representative write validation

On the staging tenant, exercise each write path against Node and compare the
response with Python for the same inputs:

| Flow | Endpoint(s) | What must match |
| :--- | :--- | :--- |
| Session lifecycle | `POST/GET/PATCH/DELETE /api/sessions`, `GET /api/sessions/:id` | ids, titles, `conversation_history`, `resumes`, `last_shortlist`, `scheduled_interviews` |
| Chat (sync + async) | `POST /api/chat`, `GET /api/chat/jobs/:id`, `.../stream` | response fields, 202 envelope, job status transitions, SSE event framing and terminal event |
| Ingest | `POST /api/ingest/upload`, `POST /api/ingest/upload-jd` | per-file results, deterministic dedupe, job/session binding, 207 on partial failure |
| Evaluation + ATS | `POST /api/candidates/evaluate`, `POST /api/candidates/:id/status`, `POST /api/export/ats` | rubric persistence, `new_status`, JSON map and CSV header |
| Email + credits | `POST /api/email/send`, `GET /api/email/history`, `GET /api/email/stats` | simulated/sent status, credit deduction, 402 on insufficient balance, isolation |
| Billing | `POST /api/payments/order`, `POST /api/payments/verify`, `POST /api/payments/webhook` | order envelope, signature acceptance/rejection, subscription activation, ledger rows |
| Privacy | `GET /api/privacy/export/:id`, `DELETE /api/privacy/candidates/:id`, `GET /api/privacy/user/export`, `GET /api/privacy/bias-audit` | export shape, cascade deletion, audit fields |
| Users | `GET/PATCH /api/users/me` | eight preference defaults, profile fields |

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
   move the upstream from Python to Node. This is the fastest rollback path if
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

### First 24 hours

- Compare `/api/metrics` request counts and latency with the Python baseline
  captured before the switch. Node's RED maps are process-local, so compare
  rates, not absolute counters.
- Re-run `npm run parity:check` against the Node host and a Python canary host
  (if one is still up) to confirm no contract drift was introduced by runtime
  configuration.
- Inspect 422 rates for new validation mismatches and 500s for unhandled
  branches.
- Verify the retention scheduler remains disabled, or enable it on Node only
  after Python's scheduler is disabled.

### Soak before decommission

Keep Python deployed, warm and reachable for at least 7 days of normal traffic.
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
   redeploy the client, or point the reverse-proxy upstream back to Python.
   Proxy rollback is immediate; client rollback needs a rebuild/release.
2. **Keep Node running but unscheduled from the public path** for log capture.
   Do not delete its logs: they are the incident record.
3. **Verify Python health** at `/health` and `/api/health/ready`, then smoke a
   read (`GET /api/users/me`), a write (`POST /api/sessions`), and an async chat
   job.
4. **Resolve in-flight async jobs.**
   - In-memory mode: jobs die with the Node process; affected users see a
     missing job on polling. The client falls back to a new turn — acceptable,
     but record how many were open.
   - Redis/BullMQ mode: Python does not consume BullMQ queues. Leave the Node
     workers running until the queue is empty, or accept and record the loss.
     Never delete the queue before draining it.
5. **Reconcile writes.** Both backends use the same database, so no data rollback
   is required. Audit the cutover window for partial flows: sessions created
   without a follow-up turn, duplicate outreach rows, credit ledger entries.
   Reverse only what is clearly duplicated, with the tenant's user id recorded.
6. **Disable Node-only schedulers** (`RETENTION_JOB_ENABLED=false`) and confirm
   Python's scheduler is active again.
7. **File the incident** with the parity/validation record, the failing check,
   and the time of the switch back.

### After a rollback

Treat the cause as a blocker: add a regression test to the owning Node suite
(`backend-node/tests/`), fix it, and restart the cutover from section 1 with a
fresh parity run. Do not resume at the client-switch step.

---

## 7. Decommissioning Python (after soak)

Only after the soak and a clean parity record:

1. Freeze Python writes, run one final strict parity check on the same database.
2. Export the last Python metrics/log window for the SLO baseline.
3. Remove the Python deployment from the proxy and autoscaling group; keep the
   image tag and this document for one release cycle.
4. Enable `RETENTION_JOB_ENABLED=true` on exactly one Node instance, or run the
   manual `npm run retention:run` schedule documented in `docs/runbooks.md`.
5. Update `backend/README.md` to mark the service retired, and remove Python
   from the deployment pipeline only after the next successful Node release.
