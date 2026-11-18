# RecruitAI Production Incident & Alert Runbooks

This document contains operational procedures for responding to production alerts, system degradations, and high-severity incidents for RecruitAI (OPS-1).

For the FastAPI → Express switchover itself — dual-run validation, client switch order, and the rollback procedure — see [`docs/cutover.md`](./cutover.md). After a cutover rollback, resume here for the incident follow-up.

---

## Escalation Matrix & Severity Tiers

| Severity  | Definition                                                          | Response SLA | Primary Responder              |
| :-------- | :------------------------------------------------------------------ | :----------- | :----------------------------- |
| **SEV-1** | Outage affecting all users, data loss threat, security breach       | < 15 minutes | On-Call Lead Engineer + VP Eng |
| **SEV-2** | Critical functionality degraded (e.g. chat down, screening stalled) | < 30 minutes | On-Call Engineer               |
| **SEV-3** | Non-critical bug or minor latency elevation; workaround available   | < 4 hours    | Core Backend / Frontend Team   |

---

## Runbook 1: High HTTP 5xx Error Rate Spike (> 1.0%)

### Symptoms

- Prometheus alert: `HighErrorRateBurn` firing.
- Ingress returning `HTTP 500 Internal Server Error`.
- Frontend displaying: _"An unexpected server error occurred. (ref=...)"_

### Immediate Diagnostics

1. **Fetch Telemetry Summary** (the route is authenticated in both backends):
   ```bash
   curl -s -H "Authorization: Bearer $ADMIN_JWT" \
     http://localhost:8000/api/metrics | jq .red_metrics
   ```
2. **Inspect Server Logs for the Reference ID**:
   ```bash
   # Node/Express (post-cutover): one JSON object per line
   docker logs recruitai_backend 2>&1 | jq -c 'select(.ref=="<ref>")'

   # FastAPI (current): plain-text logs
   tail -n 100 backend/logs/server.log | grep -E "UNHANDLED_EXCEPTION|ref="
   ```
   The client-visible error text contains `ref=<id>`; server logs add
   `request_id`, and `user_id` / `tenant_id` when authentication succeeded.
   The same `ref` appears as `error_type` plus route/method in structured logs.
3. **Verify Database Readiness**:
   ```bash
   curl -s -H "Authorization: Bearer $ADMIN_JWT" \
     http://localhost:8000/api/health/ready | jq .services.database
   ```
   `status: degraded` with `type: sqlite_fallback` means the PostgreSQL
   connection failed and the process fell back to SQLite; `status: unhealthy`
   (HTTP 503) means the readiness ping itself failed.

### Correlating a Single Request

1. Read `X-Request-ID` from the failing response (or from the gateway log). If
   the client did not send one, the backend generated it and echoed it back.
2. Search logs by that id:
   ```bash
   docker logs recruitai_backend 2>&1 | jq -c 'select(.request_id=="<id>")'
   ```

### Mitigation

1. If the error is isolated to a single route, verify recent database migrations or deploy a fast rollback:
   ```bash
   git revert HEAD && git push origin main
   ```
   If the errors started with the Express cutover, follow the
   [rollback steps](./cutover.md#6-rollback-plan) instead of reverting code.
2. If database is unreachable, check Supabase status dashboard or restart the backend pod:
   ```bash
   docker restart recruitai_backend
   ```

---

## Runbook 2: LLM Provider Quota Exhaustion / 429 Cascade

### Symptoms

- Circuit breaker logs: `[circuit_breaker] Model ... hit rate limit. Circuit tripped to OPEN`.
- Logs show failover attempts across all 5 models.
- If all 5 models exhaust quota, `AllProvidersFailedError` is raised.

### Immediate Diagnostics

1. Check model circuit breaker states in metrics:
   ```bash
   curl -s -H "Authorization: Bearer $ADMIN_JWT" \
     http://localhost:8000/api/metrics | jq .red_metrics.latencies_ms
   ```
2. Check Google Cloud Gemini Quota console for 429 rate limit spikes.

### Mitigation

1. **Activate Rule-Based Degradation**:
   If Gemini quota is completely exhausted, set environment kill-switch to degrade gracefully to deterministic 5-pillar matching without crashing:
   ```bash
   export LLM_KILL_SWITCH="true"
   ```
2. **Add / Rotate API Key**:
   Update `GEMINI_API_KEY` in production secrets manager and trigger a rolling restart.

---

## Runbook 3: High Chat P99 Latency & Worker Queue Backlog

### Symptoms

- Chat responses taking > 30 seconds.
- Metric `recruitai_queue_depth` rising above 50 pending jobs.
- Clients experiencing timeout on SSE `/api/chat/jobs/{job_id}/stream`.

### Immediate Diagnostics

1. Check current queue depth:
   ```bash
   curl -s -H "Authorization: Bearer $ADMIN_JWT" \
     http://localhost:8000/api/metrics | jq .use_metrics
   ```
2. Identify slow LangGraph nodes (e.g. `screen_node` vs `candidate_qa_node`):
   ```bash
   grep "Handled by" backend/logs/server.log | tail -n 20
   ```

### Mitigation

1. Increase async worker concurrency. Python uses `ASYNC_WORKER_CONCURRENCY`; the Node backend uses `JOB_WORKER_CONCURRENCY` (default `10`):
   ```bash
   export JOB_WORKER_CONCURRENCY="8"
   ```
2. Check if Tavily search API calls are hanging; verify hermetic fallback is active.

---

## Runbook 4: Database Connection Pool Exhaustion & RLS Lock Contention

### Symptoms

- Backend log: `FATAL: remaining connection slots are reserved for non-replication superuser connections`.
- Readiness check reports `"status": "unhealthy"` (HTTP 503) or
  `"status": "degraded"` with `type: sqlite_fallback` after a failed
  PostgreSQL connection.

### Immediate Diagnostics

1. Check active PostgreSQL connections on Supabase:
   ```sql
   SELECT count(*), state FROM pg_stat_activity GROUP BY state;
   ```
2. Check for long-running uncommitted transactions:
   ```sql
   SELECT pid, now() - query_start AS duration, query
   FROM pg_stat_activity
   WHERE state != 'idle'
   ORDER BY duration DESC LIMIT 10;
   ```

### Mitigation

1. Terminate orphaned backend connections:
   ```sql
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND state_change < now() - interval '5 minutes';
   ```
2. Ensure connection pooling (PgBouncer/Supabase Pooler on port 6543) is enabled.

---

## Runbook 5: Production Startup Failure / Readiness Not Ready

### Symptoms

- The Node service exits `1` immediately after deploy; the platform shows a
  crash loop or "no healthy upstream".
- Startup logs end with `production preflight failed; refusing to start`
  followed by one `preflight failure <check>:` line per problem.
- The container is running but `GET /api/health/ready` returns `503`, or
  reports `services.database.type = sqlite_fallback`.

### Immediate Diagnostics

1. Read the preflight output from the deploy logs. Each failing check is a
   self-contained message and never contains secret values:
   ```bash
   # Platform log drain, or locally against the deployment environment:
   cd backend-node && node dist/cli/preflight.js
   ```
   Hard-check reference and required values: [`docs/deployment.md`](./deployment.md#4-production-gates).
2. For a readiness failure while the process is up, check which service is
   unhealthy:
   ```bash
   curl -s -H "Authorization: Bearer $ADMIN_JWT" \
     https://<backend-host>/api/health/ready | jq .services
   ```
   `sqlite_fallback` means `DATABASE_URL` was unset or unreachable; the
   SQLite fallback is refused in production, so this is a configuration error,
   not a capacity problem.

### Mitigation

1. Fix the reported environment variable in the platform secret store. The
   common causes are a missing `SUPABASE_JWT_SECRET` (< 32 characters), a
   Supabase project URL in `DATABASE_URL` instead of a `postgresql://` string,
   a loopback entry in `ALLOWED_ORIGINS`, or a `USE_LOCAL_AUTH=true` left over
   from development.
2. Redeploy. A deploy that fails preflight never receives traffic, so no
   rollback is needed for the failed revision itself; if it replaced a healthy
   revision, follow [`docs/cutover.md`](./cutover.md#6-rollback-plan).
3. If the failure started with a secret rotation, restore the previous value
   first, then rotate deliberately (see
   [`docs/deployment.md`](./deployment.md#3-secrets-management)).

---

## Runbook 6: Request Rate Limiting (HTTP 429 Spike)

### Symptoms

- Clients receive `429` with body
  `{"detail":"Too many requests. Please retry shortly."}` and a `Retry-After`
  header.
- `recruitai_requests_total{endpoint=...,status="429"}` rises while the error
  rate alert stays otherwise quiet.
- Users report the UI showing a retry message right after a burst of actions.

### Immediate Diagnostics

1. Confirm the limiter is the source and find the affected endpoints:
   ```bash
   curl -s -H "Authorization: Bearer $ADMIN_JWT" \
     https://<backend-host>/api/metrics | jq '.red_metrics.requests_total // .red_metrics'
   ```
2. Determine the client key. The limiter key is the client IP (`req.ip`). When
   `REDIS_URL` is configured the fixed window is shared by every replica, so a
   `429` means the fleet-wide ceiling was reached, not the local process. If
   `TRUST_PROXY=true`, the key comes from `X-Forwarded-For`; if the proxy does
   not overwrite that header, every client shares the proxy address and
   legitimate traffic will be throttled together.
3. Compare `RATE_LIMIT_MAX_REQUESTS` / `RATE_LIMIT_WINDOW_SECONDS` against the
   observed request rate for the window. A page load with several parallel
   calls counts once per request, not once per session.

### Mitigation

1. For a legitimate traffic surge, raise the ceiling and redeploy:
   ```bash
   RATE_LIMIT_MAX_REQUESTS=1200 RATE_LIMIT_WINDOW_SECONDS=60
   ```
   Preflight reports the active values as the `rate-limit` check.
2. If the 429s are a single abusive client, keep the limit and block at the
   edge instead. Do not disable the limiter during an attack.
3. If every client is affected at once, suspect proxy configuration: verify
   `TRUST_PROXY` matches the platform and that the proxy sets
   `X-Forwarded-For`. Preflight warns when `TRUST_PROXY=true`, because it is
   only safe behind a header-overwriting proxy.
4. `RATE_LIMIT_ENABLED=false` is an emergency-only change; it removes the
   global abuse guard and preflight reports it as a warning. Re-enable after
   the incident.

---

## Runbook 7: Redis Outage, Worker Overload, SSE Capacity and Shutdown Drain

Phase 21 moved fleet-wide state into Redis and CPU-heavy work onto worker
threads. These are the operational failure modes that look different from a
plain HTTP 5xx.

### Symptoms

- Readiness returns `503` with `services.redis` missing (the payload shape is
  unchanged) while `/api/health` still answers `200`.
- Logs repeat `[redis] ping failed` or `Redis window failed; using local
  fallback`; rate limits, Tavily cache hits and circuit state become
  per-instance.
- `[event_loop] p99 delay ... exceeds ...ms` appears while request latency
  climbs and CPU sits on the request thread.
- Chat stream requests return `429` with
  `{"detail":"Too many active chat streams. Please retry shortly."}` and
  `Retry-After: 5`.
- During a deploy, `SIGTERM` logs a drain message and readiness flips to `503`
  before the process exits.

### Immediate Diagnostics

1. Check Redis reachability and readiness detail:
   ```bash
   redis-cli -u "$REDIS_URL" ping
   curl -s -H "Authorization: Bearer $ADMIN_JWT" \
     https://<backend-host>/api/health/ready | jq '{status, services}'
   ```
   A configured `REDIS_URL` that fails `PING` makes readiness unhealthy on
   purpose, so the load balancer drains the instance instead of serving with
   split state.
2. Inspect key families and TTLs (never delete `recruitai:jobs*` while jobs are
   running):
   ```bash
   redis-cli -u "$REDIS_URL" --scan --pattern 'recruitai:*' | head -50
   redis-cli -u "$REDIS_URL" pttl recruitai:lock:retention
   ```
3. Confirm worker offloading is active:
   ```bash
   grep '\[worker_pool\] started' <platform-logs>
   grep '\[event_loop\]' <platform-logs> | tail
   ```
   If `WORKER_POOL_ENABLED=false` in production, a large upload can block the
   event loop for every request on that instance.
4. Count active SSE streams per instance from the logs or a process metric;
   the cap is `CHAT_MAX_SSE_CONNECTIONS` (default `200`) per replica.

### Mitigation

1. **Redis outage:** restore Redis first. The process keeps serving with local
   fallbacks, but retention sweeps skip (the lock cannot be acquired), the
   reset throttle and HTTP limiter become per-instance, and jobs stay in
   whichever instance accepted them unless BullMQ mode was already configured.
   Do not scale out during the outage; scale-in or hold traffic until Redis is
   healthy again.
2. **Worker overload:** raise `WORKER_POOL_SIZE` (bounded by CPU) or
   `WORKER_POOL_MAX_QUEUE`, and scale replicas. Overflow is a deliberate `503`
   + `Retry-After: 5`, not a crash; check whether a single large document is
   monopolising a worker before raising limits.
3. **SSE capacity:** treat a sustained `429` as a capacity signal. Add replicas
   or raise `CHAT_MAX_SSE_CONNECTIONS` only after confirming file-descriptor
   headroom. Stale streams are released on client disconnect and aborted after
   the shutdown grace period.
4. **Slow drain / stuck deploy:** `SHUTDOWN_DRAIN_MS` (default `10000`) forces
   remaining sockets closed; `SHUTDOWN_SSE_GRACE_MS` (default `2000`) aborts
   streams first. If a deploy exceeds the orchestrator's termination grace,
   lower the drain values rather than killing the process, so BullMQ can
   release active jobs to another replica.

---

## Runbook 8: Post-Cutover Stabilization Triage

Use this runbook during the Phase 20 soak, when Node is serving traffic but
Python is still warm for rollback. For an active outage, use the matching
runbook above first; stabilization is for drift that is not yet an outage.

### Symptoms

- `npm run stabilize` reports a warning: 401/402/422 rate above the watch
  threshold, 5xx drift above the Python canary, or webhook 4xx.
- `npm run stabilize` reports a hard failure: 5xx above budget, queue depth
  above 50, SQLite fallback, local auth, unreadable metrics/readiness.
- Users report a flow that works but differs from Python (analytics numbers,
  outreach status, privacy export fields).
- Client smoke checks fail on one surface while the other is healthy.

### Immediate Diagnostics

1. Run the read-only probe against the affected host:
   ```bash
   cd backend-node
   STABILIZATION_BASE_URL=https://<node-host> \
   STABILIZATION_BEARER_TOKEN=$ADMIN_JWT \
   npm run stabilize
   ```
   Add `--python-url https://<python-host>` to compare 5xx rates with the
   still-warm Python canary. Use `STABILIZATION_STRICT=true` only when the team
   has agreed warnings block the rollout.
2. Inspect the status mix directly:
   ```bash
   curl -s -H "Authorization: Bearer $ADMIN_JWT" \
     https://<node-host>/api/metrics \
     | jq '{total: .red_metrics.requests_total, status: .red_metrics.status_breakdown, errors: .red_metrics.error_breakdown, queue: .use_metrics.queue_depth, slo: .slo_health}'
   ```
   `slo_health.error_rate` includes 4xx in both backends; use the `:5xx` keys
   for availability questions.
3. Check readiness detail before blaming a route:
   ```bash
   curl -s -H "Authorization: Bearer $ADMIN_JWT" \
     https://<node-host>/api/health/ready | jq .services
   ```
4. Read the relevant structured logs:
   ```bash
   # Webhook outcome classification (processed / skipped / ignored)
   docker logs recruitai_backend 2>&1 | jq -c 'select(.logger=="recruitai.payments.webhook")'

   # Async chat job failures
   docker logs recruitai_backend 2>&1 | jq -c 'select(.message | test("Job .* failed"))'

   # 401/402/422/500 by request id
   docker logs recruitai_backend 2>&1 | jq -c 'select(.status_code==401 or .status_code==402 or .status_code==500)'
   ```

### Data Reconciliation

1. Credit ledger vs. user balance (must return zero rows outside known
   in-flight transactions):
   ```sql
   WITH latest AS (
     SELECT user_id, balance_after,
            ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS rn
     FROM credit_transactions
   )
   SELECT u.id, u.credits_balance, l.balance_after
   FROM users u
   JOIN latest l ON l.user_id = u.id AND l.rn = 1
   WHERE u.credits_balance <> l.balance_after;
   ```
2. Outreach outcomes in the cutover window:
   ```sql
   SELECT status, COUNT(*)
   FROM outreach_logs
   WHERE created_at > now() - interval '24 hours'
   GROUP BY status
   ORDER BY status;
   ```
   `failed` should not rise after the switch; `simulated` is expected when SMTP
   is intentionally unconfigured.
3. Duplicate sends/charges for one candidate or payment in the cutover window:
   ```sql
   SELECT user_id, candidate_id, template_id, COUNT(*)
   FROM outreach_logs
   WHERE created_at > now() - interval '24 hours'
   GROUP BY user_id, candidate_id, template_id
   HAVING COUNT(*) > 1;
   ```
4. Analytics/privacy/outreach contract comparison:
   ```bash
   PYTHON_BASE_URL=https://<python-host> \
   NODE_BASE_URL=https://<node-host> \
   PARITY_BEARER_TOKEN=$ADMIN_JWT \
   npm run parity:check
   ```
   The checker covers analytics, email history/stats, bias audit and metrics.
   Privacy export/delete need a seeded candidate and are exercised manually per
   `docs/cutover.md` §3.

### Mitigation

1. **Auth (401 spike):** confirm both backends use the same
   `SUPABASE_JWT_SECRET`, `SUPABASE_JWT_AUDIENCE`, and that `USE_LOCAL_AUTH` is
   unset/false on Node. Compare a failing token across both hosts before
   changing anything.
2. **Payments (402 spike or webhook 4xx):** confirm the Razorpay webhook secret
   and plan metadata; check the `credit_transactions` ledger and that
   `processWebhookEvent` logged `processed`/`skipped` rather than a 5xx. Do not
   re-drive payments until duplicates are ruled out.
3. **Chat jobs (queue depth):** follow Runbook 3. In-memory mode cannot survive
   a restart; Redis/BullMQ mode must not be deleted before draining.
4. **Analytics/outreach drift:** run the parity checker. If shapes match and
   values differ, verify both backends read the same database and tenant before
   calling it a regression.
5. **Any auth/money/data-integrity failure:** switch traffic back using
   `docs/cutover.md` §6, then fix forward with a regression test. Do not debug
   on the serving path.

### Regression Fix

- Reproduce in the owning suite under `backend-node/tests/`, then fix.
- Do not include refactors or unrelated improvements in the stabilization fix.
- Record every intentional difference or Python bug preserved for parity in the
  behavior-difference register in `docs/cutover.md` §7.
- Re-run `npm run stabilize`, `npm run parity:check` and the full gate before
  resuming the rollout.

---

## Runbook 9: Incident Post-Mortem Template

Following resolution of any SEV-1 or SEV-2 incident, an RCA (Root Cause Analysis) document must be filed within 48 hours containing:

1. **Executive Summary & Timeline** (Detection, Acknowledgment, Mitigation, Resolution).
2. **Root Cause Analysis** (5-Whys methodology).
3. **Trigger vs Contributing Factors**.
4. **Action Items & Preventive Controls** (Jira / GitHub issues with assigned owners and due dates).
