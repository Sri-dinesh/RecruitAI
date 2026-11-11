# RecruitAI Backend — Node.js / Express / TypeScript

Target backend for the FastAPI → Node.js migration. **Phases 1–4 complete**:
scaffold, tooling, boot, typed configuration with production gates, the
auth/request-identity foundation, and the Express app wiring with CORS and
global error handling. No feature routes live here yet. The Python backend in
`../backend/` remains the running service and is untouched until cutover.

## Status

| Area                                  | Status                                  |
| ------------------------------------- | --------------------------------------- |
| Phase 1 — scaffold, tooling, boot     | ✅ complete                             |
| Phase 2 — config + production gates   | ✅ complete                             |
| Phase 3 — auth + request identity     | ✅ complete                             |
| Phase 4 — app wiring + error handling | ✅ complete                             |
| Phases 5–24                           | pending (see `../Backend-Migration.md`) |

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
├── middleware/     # CORS, auth, errors, uploads   (Phase 3/4)
├── schemas/        # app/schemas/*                 (Phase 5)
├── db/             # Drizzle + pgvector/SQLite     (Phase 6)
├── telemetry/      # app/core/logging.py/telemetry (Phase 7)
├── agents/         # app/graph/*                   (Phase 13)
├── rag/            # app/rag/*                     (Phase 8+)
├── services/       # app/services/*                (Phases 9–16)
│                   #   + quota guard              (Phase 2 ✅)
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

## App wiring and error handling

`createApp({ config })` assembles the stack in the same order as `app/main.py`:

1. **CORS** (outermost): `ALLOWED_ORIGINS` plus the Vercel preview regex,
   `credentials=true`, fixed method list, reflected preflight headers, 600 s
   max-age, and Starlette's `200` preflight status.
2. **JSON body parsing** via `express.json()`.
3. **Public health routes**: `/`, `/health`, `/api/health` — mounted before the
   API router so they never inherit route-level auth.
4. **Feature routers under `/api`** — each router applies `requireAuth()`
   itself, matching FastAPI's per-route dependency.
5. **JSON 404** — `{ "detail": "Not Found" }` for unmatched paths.
6. **Terminal error handler** (last):
   - `HttpError` subclasses render their status, headers and `{ detail }`
     (401 Bearer challenge, 402 quota body, 403 denials).
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
observability phases (6/7/17). Body-parser/validation failures are normalized
to FastAPI's 422 shape in Phase 5.

## Contract rule

Public API shapes are frozen during the migration. Nothing in this scaffold
intentionally differs from the FastAPI contracts; changes require explicit review.

## Notes

- No commits are made automatically; branch: `feat/backend-express-migration`.
- Python backend stays runnable during the whole migration for parity checks.
- Scale architecture (Redis jobs/SSE, pooling, rate limits) is specified in
  Phases 21–24 of `../Backend-Migration.md`.
