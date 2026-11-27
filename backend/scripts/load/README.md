# Phase 24 load and resilience validation

These scripts are the scheduled/optional performance suite. They are **not**
part of the per-commit gate: compile, unit, contract and parity tests stay
fast, while load/soak/spike/chaos runs happen against deployed infrastructure
on a schedule or on demand.

## Prerequisites

- [k6](https://k6.io/docs/get-started/installation/) (`brew install k6` or the
  pinned binary used by `.github/workflows/load.yml`).
- A dedicated load-test identity. Do not reuse a real recruiter account.
- A running deployment whose `BASE_URL` reaches the API directly, or a local
  instance with `USE_LOCAL_AUTH=true`.
- A valid bearer token. The local dev mode still accepts a token-shaped header;
  production must issue a real JWT for a load-test user.

| Variable                                                                         | Default                 | Purpose                                         |
| :------------------------------------------------------------------------------- | :---------------------- | :---------------------------------------------- |
| `BASE_URL`                                                                       | `http://127.0.0.1:8000` | API origin                                      |
| `AUTH_TOKEN`                                                                     | _(required)_            | Bearer token for the load-test user             |
| `SESSION_ID`                                                                     | _(unset)_               | Reuse one session; unset creates a new one      |
| `TARGET_RPS`                                                                     | script-specific         | Chat turns per second                           |
| `DURATION`                                                                       | script-specific         | Scenario duration                               |
| `PEAK_RPS`                                                                       | `400`                   | Spike ceiling                                   |
| `THINK_TIME_SECONDS`                                                             | script-specific         | Pause per iteration                             |
| `CHAT_TIMEOUT`                                                                   | `120s`                  | Per-request deadline                            |
| `SYNC_RPS` / `ASYNC_RPS` / `SSE_RPS` / `READ_RPS` / `INGEST_RPS` / `PAYMENT_RPS` | `100/30/10/50/2/5`      | `traffic-mix.js` per-scenario rates             |
| `RAZORPAY_KEY_SECRET`                                                            | _(unset)_               | Produces real verify signatures; otherwise mock |

## Scenarios

```bash
# Market-basket sanity run (one minute, 5 rps)
BASE_URL=https://staging.example.com AUTH_TOKEN="$TOKEN" \
  k6 run --env TARGET_RPS=5 --env DURATION=1m scripts/load/chat-load.js

# Sustained load: 120 rps for 10 minutes
BASE_URL=... AUTH_TOKEN=... k6 run scripts/load/chat-load.js

# Soak: 30 rps for 2 hours (shorten in the nightly job)
BASE_URL=... AUTH_TOKEN=... k6 run scripts/load/chat-soak.js

# Spike: 20 rps -> 400 rps -> 600 rps burst -> 20 rps
BASE_URL=... AUTH_TOKEN=... k6 run scripts/load/chat-spike.js

# Mixed frontend/mobile replay: sync chat, async polling, SSE, sessions,
# analytics, ingest uploads and payment verify
BASE_URL=... AUTH_TOKEN=... k6 run scripts/load/traffic-mix.js

# Chaos: run this, then inject a fault with chaos-drill.sh
CONFIRM_CHAOS=yes \
  CHAOS_START='...' CHAOS_STOP='...' \
  BASE_URL=... AUTH_TOKEN=... ./scripts/load/chaos-drill.sh
```

`chaos-drill.sh` requires an explicit `CONFIRM_CHAOS=yes` and operator-supplied
fault commands; it never stops infrastructure on its own. It asserts that
liveness stays `200` while readiness answers `200` or `503`, then restores the
dependency even if the drill fails.

## Contract targets

The suite mirrors `docs/slo.md`. It fails a **scheduled** run when these are
missed; it is not a merge gate.

| Signal                               | Target                                   | k6 metric                                    |
| :----------------------------------- | :--------------------------------------- | :------------------------------------------- |
| Sync chat success rate               | `>= 99%` (spike allows 5% rejections)    | `recruitai_chat_failures`, `http_req_failed` |
| Chat turn latency                    | `p95 < 30 s`, soak `p99 < 45 s`          | `recruitai_chat_duration`                    |
| Chat acknowledgment (202)            | `p99 < 2 s`                              | `recruitai_enqueue_duration`                 |
| Agent reasoning turnaround           | `p95 < 30 s` (enqueue → terminal)        | `recruitai_agent_turnaround_duration`        |
| SSE attach                           | `p95 < 1 s` (time to first byte)         | `recruitai_sse_attach_duration`              |
| Resume ingestion                     | `p95 < 5 s` per document                 | `recruitai_ingest_duration`                  |
| Readiness probe latency              | `p99 < 50 ms`                            | `recruitai_readiness_duration`               |
| Liveness during a dependency outage  | `100%` `200`                             | `liveness` check                             |
| Readiness during a dependency outage | `200` (degraded) or `503`, never timeout | `readiness` check                            |
| Unexpected 5xx during a fault window | `0`; deliberate `503`/`429` are allowed  | `unexpectedResponses` counter                |
| Async enqueue with Redis unavailable | `503` + `Retry-After` (degraded mode)    | chaos scenario                               |

The custom trends are recorded by `traffic-mix.js` so the run itself fails when
a documented SLO in `docs/slo.md` is missed; they are not re-derived by hand
from HTTP percentiles.

### Five-times spike comparison

`chat-spike.js` accepts `BASELINE_RPS` and `PEAK_RPS`. To prove the error rate
stays flat through a 5× spike (rather than merely staying under a fixed cap):

```bash
# 1. Baseline: 80 rps, record recruitai_chat_failures and p95.
BASE_URL=... AUTH_TOKEN=... k6 run --env TARGET_RPS=80 --env DURATION=10m scripts/load/chat-load.js

# 2. Spike: 80 rps -> 400 rps (5x) -> 600 rps burst -> 80 rps.
BASE_URL=... AUTH_TOKEN=... \
  k6 run --env BASELINE_RPS=80 --env PEAK_RPS=400 scripts/load/chat-spike.js
```

Compare the spike's `recruitai_chat_failures` and `http_req_failed` with the
baseline. Deliberate `429`/`503` rejections are the fair-use contract; an
increase in `5xx` is a regression.

Load is expressed as chat turns per second. A recruiter typically sends one
turn every 30 s, so **10K concurrently active users ≈ 333 rps** before polling
and SSE traffic. The spike profile covers that rate and a 1.5× burst.

## Scaling levers

Everything below is a configuration value; no code change is needed to scale.

| Lever                              | Default                             | Effect                                                                |
| :--------------------------------- | :---------------------------------- | :-------------------------------------------------------------------- |
| API replicas                       | deployment-defined                  | Horizontal scale; all fleet state is Redis-backed when configured     |
| `PG_POOL_MAX` / `PG_READ_POOL_MAX` | `10` / same as primary              | Per-instance DB concurrency; size against the pooler ceiling          |
| `DB_LIST_MAX_LIMIT`                | `1000`                              | Caps tenant list scans                                                |
| `DB_SWEEP_BATCH_SIZE`              | `500`                               | Retention/tenant sweep batch size                                     |
| `DB_INSERT_BATCH_SIZE`             | `500`                               | Multi-row insert chunk size                                           |
| `WORKER_POOL_ENABLED` / `_SIZE`    | prod `true` / `2`                   | CPU-bound parsing workers; queue bounded by `WORKER_POOL_MAX_QUEUE`   |
| `JOB_WORKER_CONCURRENCY`           | `10`                                | Agent turns processed per replica                                     |
| `JOB_PER_USER_CONCURRENCY`         | `2`                                 | Fairness cap per tenant                                               |
| `LLM_MAX_CONCURRENT_CALLS`         | `8`                                 | Fleet-wide Gemini concurrency guard                                   |
| `LLM_BUDGET_ACQUIRE_TIMEOUT_MS`    | `1500`                              | Wait before degrading to deterministic processing                     |
| `CHAT_MAX_SSE_CONNECTIONS`         | `200`                               | Per-replica SSE admission                                             |
| `CHAT_SSE_HEARTBEAT_SECONDS`       | `15`                                | Keepalive cadence                                                     |
| `CHAT_SSE_IDLE_TIMEOUT_SECONDS`    | `300`                               | Idle stream teardown                                                  |
| `RATE_LIMIT_TIER_WINDOW_SECONDS`   | `60`                                | Fair-use window                                                       |
| `RATE_LIMIT_<TIER>_MAX`            | per tier (`chat=60`, `read=600`, …) | Tenant/IP budget per window                                           |
| `CACHE_HOT_READS_ENABLED`          | `false`                             | Serve credits/subscriptions/analytics from Redis                      |
| `REDIS_URL`                        | _(unset)_                           | Enables fleet-wide jobs, SSE fan-out, caches, breakers and quotas     |
| `RESILIENCE_BREAKERS_ENABLED`      | `true`                              | Per-dependency circuit breakers                                       |
| `REDIS_DEGRADED_MODE_ENABLED`      | `false`                             | Keep serving from local state when Redis is down; async enqueue → 503 |
| `REDIS_HEALTH_CACHE_MS`            | `5000`                              | Readiness/probe reuse window                                          |

When `REDIS_URL` is unset the process runs in single-instance mode: caches,
breakers, quotas and jobs are local, and no async job survives a restart.
Production is expected to set it.
