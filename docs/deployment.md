# Node backend deployment and production hardening (Phase 19)

This document is the deployment contract for the Express backend in
`backend-node/`. It covers the build artifact, startup behavior, every
environment variable, production gates, secrets handling, log/metric export and
the operational commands.

For the FastAPI → Express switchover itself, see `docs/cutover.md`. For incident
procedures once Node is serving traffic, see `docs/runbooks.md`.

---

## 1. Artifact and entrypoint

| Item       | Value                                                          |
| :--------- | :------------------------------------------------------------- |
| Build      | `npm ci && npm run build` → `dist/`                            |
| Entrypoint | `node dist/main.js`                                            |
| Container  | `backend-node/Dockerfile` (multi-stage, non-root, healthcheck) |
| Liveness   | `GET /health` (public, process only)                           |
| Readiness  | `GET /api/health/ready` (authenticated, DB round trip)         |
| Port       | `PORT` (default `8000`), `HOST` (default `0.0.0.0`)            |
| Blueprint  | `render.yaml` at the repository root                           |

`src/main.ts` is the Node equivalent of
`uvicorn app.main:app --host $HOST --port $PORT`:

1. loads `backend-node/.env` **only if present** (deployment variables always
   win; a container does not need a file),
2. validates configuration and exits `1` on invalid values,
3. sets the structured log level from `LOG_LEVEL`,
4. in production, runs the preflight checks and refuses to listen on any
   failure (warnings are logged),
5. starts the retention scheduler (no-op unless enabled) and the HTTP server.

`RELOAD` is read for parity with the Python config but has no effect on the
built server; development mode uses `npm run dev` (`tsx watch`).

### Build and run locally

```bash
cd backend-node
npm ci
npm run build
node dist/main.js
```

### Build and run the container

```bash
docker build -t recruitai-backend-node backend-node
docker run --rm -p 8000:8000 \
  -e ENVIRONMENT=development \
  -e USE_LOCAL_AUTH=true \
  recruitai-backend-node
```

Production containers must receive secrets from the platform, not a baked
`.env`; `.dockerignore` excludes every `.env*` file except the template.

---

## 2. Environment matrix

`backend-node/.env.example` is the copyable template. The table below is the
authoritative deployment checklist. “Prod” means a value is required (or must
be explicitly chosen) before the production preflight can pass.

### Runtime and gates

| Variable            | Prod        | Secret | Default                   | Notes                                                          |
| :------------------ | :---------- | :----- | :------------------------ | :------------------------------------------------------------- |
| `ENVIRONMENT`       | **yes**     | no     | `development`             | `production` enables every gate.                               |
| `NODE_ENV`          | recommended | no     | —                         | Container/userland convention; `ENVIRONMENT` wins.             |
| `HOST`              | no          | no     | `0.0.0.0`                 | Bind address.                                                  |
| `PORT`              | no          | no     | `8000`                    | Platform-provided ports override this.                         |
| `RELOAD`            | no          | no     | `true` dev / `false` prod | Parity only; no effect on `dist/main.js`.                      |
| `LLM_DATA_USE_MODE` | **yes**     | no     | `zero_retention_verified` | Exactly this value in production (AI-SEC-1).                   |
| `LLM_KILL_SWITCH`   | no          | no     | `false`                   | `true` disables model calls and degrades to rule-based paths.  |
| `LOG_LEVEL`         | no          | no     | `info`                    | `debug`, `info`, `warn`, `error`. Invalid values fail startup. |

### LLM, search and Supabase

| Variable                    | Prod    | Secret  | Default         | Notes                                                           |
| :-------------------------- | :------ | :------ | :-------------- | :-------------------------------------------------------------- |
| `GEMINI_API_KEY`            | **yes** | **yes** | —               | Required production key.                                        |
| `GOOGLE_API_KEY`            | no      | **yes** | —               | Parity with LangChain integrations; keep in sync if used.       |
| `GROQ_API_KEY`              | no      | **yes** | —               | Deprecated; defined for parity, not part of the Node LLM stack. |
| `TAVILY_API_KEY`            | **yes** | **yes** | —               | Live job/salary/trend search; offline fallbacks without it.     |
| `SUPABASE_URL`              | **yes** | no      | —               | Project URL (not the database URL).                             |
| `SUPABASE_ANON_KEY`         | no      | public  | —               | Client-facing key; harmless but keep out of logs.               |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | **yes** | —               | Server-side Supabase access.                                    |
| `SUPABASE_JWT_SECRET`       | **yes** | **yes** | —               | ≥ 32 characters; HS256 verification.                            |
| `SUPABASE_JWT_AUDIENCE`     | no      | no      | `authenticated` | Non-default values warn in preflight.                           |

### Database

| Variable                   | Prod     | Secret  | Default                 | Notes                                                                     |
| :------------------------- | :------- | :------ | :---------------------- | :------------------------------------------------------------------------ |
| `DATABASE_URL`             | **yes**  | **yes** | —                       | `postgres://` or `postgresql://` direct TCP URL.                          |
| `SUPABASE_DB_URL`          | fallback | **yes** | —                       | Used when `DATABASE_URL` is unset.                                        |
| `PG_POOL_MAX`              | no       | no      | `10`                    | Connections per instance; pool × replicas must stay under the DB ceiling. |
| `PG_IDLE_TIMEOUT_MS`       | no       | no      | `30000`                 | Idle client timeout.                                                      |
| `PG_CONNECTION_TIMEOUT_MS` | no       | no      | `5000`                  | Connect timeout.                                                          |
| `SQLITE_FALLBACK_PATH`     | n/a      | no      | `recruitai_fallback.db` | Development/test only; construction is refused in production.             |

### Auth and CORS

| Variable            | Prod               | Secret | Default                            | Notes                                                         |
| :------------------ | :----------------- | :----- | :--------------------------------- | :------------------------------------------------------------ |
| `USE_LOCAL_AUTH`    | **must be false**  | no     | `false`                            | Forced off in production; a `true` value fails preflight.     |
| `LOCAL_DEV_USER_ID` | no                 | no     | seed UUID                          | Development identity only.                                    |
| `ALLOWED_ORIGINS`   | **yes**            | no     | Python defaults (include loopback) | Explicit `https://` origins; loopback entries fail preflight. |
| `TRUST_PROXY`       | platform-dependent | no     | `false`                            | `true` only behind a proxy that overwrites `X-Forwarded-For`. |

The Vercel preview regex (`https://recruitai-*.vercel.app`) is part of the CORS
middleware and does not need an env var.

### Integrations

| Variable                   | Prod           | Secret  | Default                | Notes                                                            |
| :------------------------- | :------------- | :------ | :--------------------- | :--------------------------------------------------------------- |
| `SMTP_SERVER`              | no             | no      | `smtp.gmail.com`       | Sender host.                                                     |
| `SMTP_PORT`                | no             | no      | `587`                  | Invalid values fall back like Python.                            |
| `SMTP_USERNAME`            | optional       | no      | —                      | Set together with password and sender.                           |
| `SMTP_PASSWORD`            | optional       | **yes** | —                      | Partial SMTP configuration fails preflight.                      |
| `SMTP_SENDER`              | optional       | no      | username               | From-address.                                                    |
| `RAZORPAY_KEY_ID`          | optional       | no      | —                      | All three Razorpay values together, or none.                     |
| `RAZORPAY_KEY_SECRET`      | optional       | **yes** | —                      | Partial configuration fails preflight.                           |
| `RAZORPAY_WEBHOOK_SECRET`  | optional       | **yes** | —                      | HMAC source for `/api/payments/webhook`.                         |
| `REDIS_URL`                | multi-instance | **yes** | unset                  | Enables BullMQ jobs/SSE; unset = single-instance in-memory jobs. |
| `JOB_QUEUE_NAME`           | no             | no      | `recruitai-agent-jobs` | BullMQ queue name.                                               |
| `JOB_TTL_SECONDS`          | no             | no      | `3600`                 | Job/event retention.                                             |
| `JOB_PER_USER_CONCURRENCY` | no             | no      | `2`                    | Fleet-wide running turns per user.                               |
| `JOB_WORKER_CONCURRENCY`   | no             | no      | `10`                   | Turns per worker process.                                        |
| `JOB_EVENT_REPLAY_LIMIT`   | no             | no      | `100`                  | SSE replay buffer per job.                                       |

When SMTP or Razorpay is intentionally absent, the backend keeps Python's
simulation behavior: outreach is logged as simulated and orders are simulated;
payment webhooks reject unless the webhook secret is present. Preflight reports
these as warnings.

### Retention and rate limiting

| Variable                         | Prod               | Secret | Default                            | Notes                                                   |
| :------------------------------- | :----------------- | :----- | :--------------------------------- | :------------------------------------------------------ |
| `RETENTION_JOB_ENABLED`          | no                 | no     | `false`                            | Enable on exactly one instance, after the cutover soak. |
| `RETENTION_JOB_INTERVAL_SECONDS` | no                 | no     | `86400`                            | Sweep interval.                                         |
| `RETENTION_RAW_RESUME_TTL_DAYS`  | no                 | no     | `90`                               | Python default.                                         |
| `RETENTION_CHAT_TTL_DAYS`        | no                 | no     | `365`                              | Python default.                                         |
| `RATE_LIMIT_ENABLED`             | recommended        | no     | `true` in production, else `false` | Per-process request limiter.                            |
| `RATE_LIMIT_WINDOW_SECONDS`      | no                 | no     | `60`                               | Fixed window.                                           |
| `RATE_LIMIT_MAX_REQUESTS`        | no                 | no     | `600`                              | Requests per key per window.                            |
| `TRUST_PROXY`                    | platform-dependent | no     | `false`                            | See auth/CORS table.                                    |

---

## 3. Secrets management

- Secrets live in the platform secret store (Render environment variables,
  Kubernetes `Secret`, Fly secrets). `render.yaml` marks every secret
  `sync: false`, so the blueprint prompts instead of committing values.
- Never commit `backend-node/.env`; it is git-ignored and excluded from the
  Docker build context.
- The backend never logs configuration values. Structured logs use an
  allowlist and drop `prompt`, `resume`, `completion`, `text`, `message`,
  `email` and `phone` fields. Preflight prints check names, never values.
- Rotate by updating the platform secret and redeploying. Rotating
  `SUPABASE_JWT_SECRET` invalidates every existing session; schedule it with
  the same care as a password rotation.
- If a key leaks, rotate first, then revoke at the provider. Do not “hide” it by
  editing git history alone.

---

## 4. Production gates

Run the preflight with the deployment environment before every production
deploy:

```bash
cd backend-node
npm run preflight          # local (tsx)
node dist/cli/preflight.js # built artifact / CI / container
```

Exit code `0` means no hard failures; `1` means at least one failure. Warnings
are informational.

Hard checks (deployment is refused):

| Check                 | Failure                                                                          |
| :-------------------- | :------------------------------------------------------------------------------- |
| `config-load`         | Invalid numeric values, missing required keys, AI-SEC-1 violation.               |
| `environment`         | `ENVIRONMENT` is not `production`.                                               |
| `required-keys`       | `GEMINI_API_KEY`, `TAVILY_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. |
| `llm-data-use`        | Any value other than `zero_retention_verified`.                                  |
| `jwt-secret`          | Missing, shorter than 32 characters, or a placeholder.                           |
| `database-url`        | Missing, not `postgres://`/`postgresql://`, or a placeholder.                    |
| `local-auth`          | `USE_LOCAL_AUTH=true` present in the environment.                                |
| `cors-origins`        | Empty, loopback, or non-HTTP(S) origins.                                         |
| `secret-placeholders` | Sample values in provider/integration secrets.                                   |
| `smtp` / `razorpay`   | Partial configuration (some values set, not all).                                |

Warnings (deployment continues): LLM kill switch on, non-default JWT audience,
SMTP/Razorpay absent (simulation mode), Redis absent (single instance),
retention scheduler on, limiter off, debug logging, proxy trust on.

`main.ts` runs the same evaluation at startup in production, so a platform that
skips the preflight step still cannot serve traffic with a broken
configuration.

---

## 5. Request rate limiting

Phase 19 adds a dependency-free fixed-window limiter
(`src/middleware/rate-limit.ts`):

- Enabled by default when `ENVIRONMENT=production`, disabled otherwise.
- Keyed by `req.ip`. Behind Render/Fly/ingress set `TRUST_PROXY=true` so the
  proxy-provided address is used; never enable it on a directly reachable
  instance.
- Rejected requests receive `429` with
  `{"detail":"Too many requests. Please retry shortly."}` and `Retry-After`
  (seconds until the window resets). CORS runs first, so browsers can read the
  response.
- Memory is bounded: expired windows are pruned and the oldest window is
  evicted at 10,000 tracked keys.
- It is a per-process abuse guard, not a distributed quota. If the fleet needs
  a shared quota, Phase 22 moves it to Redis.

Defaults: 600 requests per 60 seconds per client IP. Adjust with the
`RATE_LIMIT_*` variables; a limiter threshold that is too low will surface as a
429 spike in the dashboard and in `recruitai_requests_total`.

---

## 6. Log export

- Every log line is one JSON object on **stdout** (info/debug) or **stderr**
  (warn/error). Point the platform log drain at both streams.
- Fields: `timestamp`, `level`, `logger`, `message`, plus allowlisted
  telemetry/audit fields and `request_id`, `user_id`, `tenant_id`, `session_id`.
- `LOG_LEVEL` controls verbosity at runtime; invalid values fail startup. Use
  `info` in production, `warn` for quieter operation, `debug` only during an
  investigation.
- Request correlation: every response carries `X-Request-ID`; the same id
  appears in every log line for that request, including auth failures and 5xx.
- No prompts, resumes, completions, email addresses or candidate names are
  logged. `maskException` reduces errors to type and status code.

---

## 7. Metrics export

`GET /api/metrics` is authenticated and keeps the Phase 7/17 contract:

- `Accept: text/plain` → Prometheus exposition format.
- Any other `Accept` → JSON summary (`red_metrics`, `use_metrics`,
  `token_accounting`, `slo_health`).

Stable metric names:

- `recruitai_requests_total{endpoint,status}`
- `recruitai_queue_depth`
- `recruitai_tokens_total{type}`
- `recruitai_llm_cost_usd`

Prometheus needs a bearer token because the route authenticates like every
other API route. Mint an HS256 service token with `aud=authenticated` and a
UUID `sub` for a monitoring identity, store it as a secret, and rotate it on the
same schedule as other credentials:

```yaml
scrape_configs:
  - job_name: recruitai-node
    metrics_path: /api/metrics
    scheme: https
    authorization:
      credentials_file: /etc/prometheus/recruitai-metrics-token
    static_configs:
      - targets: ["<backend-host>"]
```

Prometheus's default `Accept` header includes `text/plain`, so no extra header
configuration is required. Metrics are process-local: compare **rates** across
instances, not absolute counters, and keep the alert rules in `docs/slo.md`.

---

## 8. Deployment targets

### Render

`render.yaml` defines a Docker web service rooted at `backend-node` with a
`/health` health check. It sets the non-secret production values
(`ENVIRONMENT`, `LLM_DATA_USE_MODE`, rate limits, CORS origins, pool size) and
marks every credential `sync: false` so Render prompts for it.

If the service is managed in the dashboard instead of the blueprint, use the
env matrix above as the checklist. Render sets `PORT`; do not hard-code it.

### Generic container platform

- Build `backend-node/Dockerfile`; run `node dist/main.js` (the image already
  does).
- Inject the env matrix as platform variables/secrets.
- Point the liveness probe at `/health` and a post-deploy check at
  `/api/health/ready` with a service token.
- Set `TRUST_PROXY=true` only when the platform's proxy overwrites
  `X-Forwarded-For`.
- Keep at least one previous image tag for rollback (see `docs/cutover.md`).

---

## 9. Operational commands

| Command                                     | Use                                                                    |
| :------------------------------------------ | :--------------------------------------------------------------------- |
| `npm run preflight`                         | Validate the deployment environment (also runs at production startup). |
| `npm run retention:run -- --dry-run`        | Manual tenant-scoped retention preview.                                |
| `npm run retention:run -- --user-id <uuid>` | Manual sweep for one tenant.                                           |
| `npm run parity:check`                      | Read-only comparison against a running FastAPI backend.                |
| `npm start`                                 | Run the built server (`node dist/main.js`).                            |
| `npm test`                                  | Full unit/contract suite.                                              |

`backend/app/cli.py` is an interactive developer REPL, not an operational
command. It is intentionally not ported: the HTTP API plus the web/mobile
clients replace it, and the retention CLI covers the scheduled/ops surface.

---

## 10. Go-live checklist

Before switching traffic (full procedure in `docs/cutover.md`):

- [ ] Image builds from `backend-node/Dockerfile` and runs as the non-root
      `node` user.
- [ ] `npm run preflight` (or `node dist/cli/preflight.js`) passes against the
      real production environment.
- [ ] `/health` returns 200 and `/api/health/ready` reports
      `services.database.type = supabase_postgresql`.
- [ ] `ALLOWED_ORIGINS` contains only production origins; no loopback entries.
- [ ] `SUPABASE_JWT_SECRET` is a real 32+ character secret and token
      verification works for a normal user.
- [ ] `DATABASE_URL` is a direct PostgreSQL URL; the readiness check never
      reports `sqlite_fallback`.
- [ ] Logs arrive in the platform drain with `request_id`; metrics are scraped
      with the four stable names.
- [ ] Rate limiting is enabled with a threshold that matches expected traffic.
- [ ] SMTP and Razorpay are either fully configured or intentionally in
      simulation mode.
- [ ] The previous image tag and the Python backend are still available for
      rollback.
