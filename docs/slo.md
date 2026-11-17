# RecruitAI Service Level Objectives (SLOs) & Reliability Targets

## 1. Executive Summary & Philosophy
RecruitAI is an enterprise autonomous recruitment orchestration platform. High availability, deterministic low-latency interactions, and zero-loss resume ingestion are mission-critical. This document defines our formal Service Level Indicators (SLIs), Service Level Objectives (SLOs), and Error Budgets for production operations (OPS-1).

---

## 2. Core Service Level Indicators & Objectives

| User Journey / Service Area | Service Level Indicator (SLI) | Service Level Objective (SLO) | Window | Measurement Mechanism |
| :--- | :--- | :--- | :--- | :--- |
| **API Availability** | Successful non-5xx responses / total requests | **>= 99.9%** availability | 30-Day Rolling | In-process RED metrics (`recruitai_requests_total`) exported at `/api/metrics` |
| **Chat Acknowledgment** | Time between client `POST /api/chat` and `HTTP 202 Accepted` | **p99 < 2.0s** | 7-Day Rolling | API Controller Tracing (`trace_span`) |
| **Agent Reasoning Turnaround** | Time from job enqueue to final SSE completion | **p95 < 30.0s** | 7-Day Rolling | Async Job Queue telemetry (`job_manager`) |
| **Resume Ingestion** | End-to-end parsing & embedding per document (<15MB) | **p95 < 5.0s** per resume | 7-Day Rolling | Ingestion pipeline metrics (`routes_ingest`) |
| **Database Query Ping** | Database health ping latency | **p99 < 50ms** | 24-Hour Rolling | Authenticated readiness probe (`/api/health/ready`) |
| **LLM Provider Availability** | Multi-model failover success rate | **>= 99.95%** | 30-Day Rolling | Circuit Breaker telemetry (`ModelCircuitBreaker`) |

---

## 3. Error Budget & Burn Rate Alerting

### Error Budget Allocation (30-Day Window)
At **99.9% Availability**, the error budget permits:
- **0.1%** non-transient server errors.
- Maximum allowable unplanned downtime: **43.2 minutes per month** (or 10.1 minutes per week).

### Multi-Window Multi-Burn Rate Alert Policy

| Severity | Burn Rate | Budget Consumed | Short Window (1h) | Long Window (6h) | Notification Channel | Pager Protocol |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **P1 - Critical** | **14.4x** | 2% in 1 hour | 1 Hour Error Rate > 1.44% | 6 Hour Error Rate > 1.44% | PagerDuty + Call Tree | Immediate page on-call engineer |
| **P2 - High** | **6.0x** | 5% in 6 hours | 1 Hour Error Rate > 0.60% | 6 Hour Error Rate > 0.60% | Slack #alerts-critical | Page on-call if unacknowledged in 15m |
| **P3 - Elevated** | **1.0x** | 10% in 3 days | 6 Hour Error Rate > 0.10% | 24 Hour Error Rate > 0.10% | Slack #alerts-dev | Next business day review |

---

## 4. Tenant Isolation & Fair-Use Limits
1. **Chat Ingestion Limits**: 60 requests / minute per recruiter workspace.
2. **Batch Upload Limits**: Max 10 resumes per batch, max 15MB per file.
3. **Workspace Reset**: 1 reset per 30 seconds per tenant (`_LAST_RESET_REQUESTS`).
4. **LLM Quota Defense**: Dynamic circular failover across 5 Gemini models (`gemini-2.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.7-flash`).

---

## 5. Automated Monitoring & Scraping

The FastAPI and Node/Express backends expose the **same metrics contract**, so
existing dashboards, alerts and scrape configs keep working through cutover:

- **Prometheus scrape**: `GET /api/metrics` with `Accept: text/plain` and an
  `Authorization: Bearer <token>` header (the route is authenticated in both
  backends).
- **Structured JSON telemetry**: `GET /api/metrics` with any non-`text/plain`
  `Accept` value.
- **Deep readiness probe**: `GET /api/health/ready` (alias `GET /health/ready`),
  authenticated.
- **Public liveness probe**: `GET /health` (alias `GET /api/health`).

Stable metric names (do not rename without updating alerting):

| Metric | Type | Meaning |
| :--- | :--- | :--- |
| `recruitai_requests_total` | counter | Requests by `endpoint` (matched route template) and `status` |
| `recruitai_queue_depth` | gauge | Pending async chat jobs |
| `recruitai_tokens_total` | counter | LLM tokens by `type="input"\|"output"` |
| `recruitai_llm_cost_usd` | counter | Estimated cumulative LLM cost in USD |

### Health and readiness semantics

- Liveness returns `200` with no dependency or topology data; it only proves
  the process can answer.
- Readiness checks database connectivity (latency + backend type), LLM provider
  configuration (model names only, never keys), and authentication mode.
- `200 healthy`: all checks passed.
- `200 degraded`: usable but operationally degraded — SQLite fallback in use or
  the LLM provider is unconfigured. This mirrors the FastAPI probe.
- `503 unhealthy`: the database ping failed. The response exposes only the
  exception **type**, never the message, connection string or stack trace.

### Log correlation and audit records

- Every response carries `X-Request-ID`. A short, URL-safe inbound id is reused
  (gateway/trace propagation); otherwise a UUID is generated.
- Structured logs (FastAPI `logging` extras, Node JSON lines) carry
  `request_id`, and `user_id` / `tenant_id` / `session_id` once those are known.
  Errors before authentication still carry the request id.
- Sensitive actions emit `[AUDIT]` records with `audit_action`:
  `GDPR_ERASURE`, `GDPR_ACCOUNT_ERASURE`, and `WORKSPACE_RESET`. Payment changes
  remain auditable through the `credit_transactions` ledger.
- Metrics are process-local in both backends (Python parity). With multiple
  replicas, scrape every pod (or aggregate at the gateway) rather than assuming
  a single global counter.

