# RecruitAI Production Incident & Alert Runbooks

This document contains operational procedures for responding to production alerts, system degradations, and high-severity incidents for RecruitAI (OPS-1).

---

## Escalation Matrix & Severity Tiers

| Severity | Definition | Response SLA | Primary Responder |
| :--- | :--- | :--- | :--- |
| **SEV-1** | Outage affecting all users, data loss threat, security breach | < 15 minutes | On-Call Lead Engineer + VP Eng |
| **SEV-2** | Critical functionality degraded (e.g. chat down, screening stalled) | < 30 minutes | On-Call Engineer |
| **SEV-3** | Non-critical bug or minor latency elevation; workaround available | < 4 hours | Core Backend / Frontend Team |

---

## Runbook 1: High HTTP 5xx Error Rate Spike (> 1.0%)

### Symptoms
- Prometheus alert: `HighErrorRateBurn` firing.
- Ingress returning `HTTP 500 Internal Server Error`.
- Frontend displaying: *"An unexpected server error occurred. (ref=...)"*

### Immediate Diagnostics
1. **Fetch Telemetry Summary**:
   ```bash
   curl -s http://localhost:8000/api/metrics | jq .red_metrics
   ```
2. **Inspect Server Logs for Reference ID**:
   ```bash
   tail -n 100 backend/logs/server.log | grep -E "UNHANDLED_EXCEPTION|ref="
   ```
3. **Verify Database Readiness**:
   ```bash
   curl -s -H "Authorization: Bearer $ADMIN_JWT" http://localhost:8000/api/health/ready | jq .services.database
   ```

### Mitigation
1. If the error is isolated to a single route, verify recent database migrations or deploy a fast rollback:
   ```bash
   git revert HEAD && git push origin main
   ```
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
   curl -s http://localhost:8000/api/metrics | jq .red_metrics.latencies_ms
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
   curl -s http://localhost:8000/api/metrics | jq .use_metrics
   ```
2. Identify slow LangGraph nodes (e.g. `screen_node` vs `candidate_qa_node`):
   ```bash
   grep "Handled by" backend/logs/server.log | tail -n 20
   ```

### Mitigation
1. Increase async worker concurrency in `job_queue.py` (default: 4 workers):
   ```bash
   export ASYNC_WORKER_CONCURRENCY="8"
   ```
2. Check if Tavily search API calls are hanging; verify hermetic fallback is active.

---

## Runbook 4: Database Connection Pool Exhaustion & RLS Lock Contention

### Symptoms
- Backend log: `FATAL: remaining connection slots are reserved for non-replication superuser connections`.
- Readiness check reports `"status": "unhealthy"`.

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

## Runbook 5: Incident Post-Mortem Template
Following resolution of any SEV-1 or SEV-2 incident, an RCA (Root Cause Analysis) document must be filed within 48 hours containing:
1. **Executive Summary & Timeline** (Detection, Acknowledgment, Mitigation, Resolution).
2. **Root Cause Analysis** (5-Whys methodology).
3. **Trigger vs Contributing Factors**.
4. **Action Items & Preventive Controls** (Jira / GitHub issues with assigned owners and due dates).
