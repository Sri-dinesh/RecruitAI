# RecruitAI Backend — Node.js / Express / TypeScript

Target backend for the FastAPI → Node.js migration. **Phase 1 scaffold only**:
no business logic lives here yet. The Python backend in `../backend/` remains the
running service and is untouched until cutover.

## Status

| Area                                | Status                                  |
| ----------------------------------- | --------------------------------------- |
| Phase 1 — scaffold, tooling, boot   | ✅ complete                             |
| Phase 2 — config + production gates | pending                                 |
| Phases 3–24                         | pending (see `../Backend-Migration.md`) |

## Commands

```bash
npm install          # install dependencies
npm run dev          # tsx watch src/main.ts (development)
npm run build        # tsc → dist/
npm start            # node dist/main.js (production)
npm run typecheck    # tsc --noEmit
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
├── config/         # app/core/config.py            (Phase 2)
├── auth/           # app/core/auth.py              (Phase 3)
├── middleware/     # request lifecycle + errors    (Phase 3/4)
├── schemas/        # app/schemas/*                 (Phase 5)
├── db/             # Drizzle + pgvector/SQLite     (Phase 6)
├── telemetry/      # app/core/logging.py/telemetry (Phase 7)
├── agents/         # app/graph/*                   (Phase 13)
├── rag/            # app/rag/*                     (Phase 8+)
├── services/       # app/services/*                (Phases 9–16)
├── tools/          # app/tools/*                   (Phase 11/13)
└── jobs/           # app/services/job_queue.py     (Phase 14/21)
tests/              # ported pytest suite          (Phase 18)
```

## Environment

Copy `.env.example` to `.env` and fill in values. The template inventories all
current Python env vars plus the planned Redis/pool settings; **nothing is
loaded yet** — Phase 2 adds the typed config module. `.env` is git-ignored.

## Contract rule

Public API shapes are frozen during the migration. Nothing in this scaffold
intentionally differs from the FastAPI contracts; changes require explicit review.

## Notes

- No commits are made automatically; branch: `feat/backend-express-migration`.
- Python backend stays runnable during the whole migration for parity checks.
- Scale architecture (Redis jobs/SSE, pooling, rate limits) is specified in
  Phases 21–24 of `../Backend-Migration.md`.
