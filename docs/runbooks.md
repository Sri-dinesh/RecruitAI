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
2. Determine the client key. The limiter is per process and per client IP
   (`req.ip`). If `TRUST_PROXY=true`, the key comes from `X-Forwarded-For`;
   if the proxy does not overwrite that header, every client shares the proxy
   address and legitimate traffic will be throttled together.
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

## Runbook 7: Incident Post-Mortem Template

Following resolution of any SEV-1 or SEV-2 incident, an RCA (Root Cause Analysis) document must be filed within 48 hours containing:

1. **Executive Summary & Timeline** (Detection, Acknowledgment, Mitigation, Resolution).
2. **Root Cause Analysis** (5-Whys methodology).
3. **Trigger vs Contributing Factors**.
4. **Action Items & Preventive Controls** (Jira / GitHub issues with assigned owners and due dates).
