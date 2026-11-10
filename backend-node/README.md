# RecruitAI Backend — Node.js / Express / TypeScript

Target backend for the FastAPI → Node.js migration. **Phases 1–2 complete**:
scaffold, tooling, boot, and the typed configuration layer with production
gates. No feature logic lives here yet. The Python backend in `../backend/`
remains the running service and is untouched until cutover.

## Status

| Area                                | Status                                  |
| ----------------------------------- | --------------------------------------- |
| Phase 1 — scaffold, tooling, boot   | ✅ complete                             |
| Phase 2 — config + production gates | ✅ complete                             |
| Phases 3–24                         | pending (see `../Backend-Migration.md`) |

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
├── types/          # shared contracts, e.g. HTTP 402 (Phase 2 ✅)
├── auth/           # app/core/auth.py              (Phase 3)
├── middleware/     # request lifecycle + errors    (Phase 3/4)
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

## Contract rule

Public API shapes are frozen during the migration. Nothing in this scaffold
intentionally differs from the FastAPI contracts; changes require explicit review.

## Notes

- No commits are made automatically; branch: `feat/backend-express-migration`.
- Python backend stays runnable during the whole migration for parity checks.
- Scale architecture (Redis jobs/SSE, pooling, rate limits) is specified in
  Phases 21–24 of `../Backend-Migration.md`.
