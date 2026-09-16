# Master Code Review & Production Hardening Checklist — RecruitAI

**Document Status:** Master Consolidated Review Document  
**Consolidates:** `fix-code.md`, `pending.md`, `production-code-changes.md`, `production-level.md`, `ai-security.md`, and the Thermo-Nuclear Code Quality Review  
**Overall Verdict:** 🛑 **CHANGES REQUESTED (NOT PRODUCTION READY)**  
**Target Codebase:** RecruitAI Multi-Tenant Recruitment Platform (Backend + Frontend)

---

## Executive Summary & Review Verdict

RecruitAI possesses a sophisticated conceptual foundation: a LangGraph supervisor orchestrating domain nodes, pgvector semantic candidate search, 5-pillar rubric scoring, and multi-tenant PostgreSQL schemas.

However, across multiple comprehensive audits, **the codebase exhibits critical production blockers**:
1. **Security & Tenancy**: Unverified JWT header algorithm sniffing, silent permanent fallback to single-tenant SQLite, and absence of database Row-Level Security (RLS).
2. **Correctness & Data Integrity**: Swallowed `NameError` in resume ingestion, unbounded cross-worker in-memory caching, $N \times 2$ synchronous database write mutations on HTTP `GET` requests, and deceptive skill-match fallback logic.
3. **Architecture & Sprawl**: Monolithic God-modules violating file-size standards ([copilot/page.tsx](file:///home/dracarys/Projects/personal-stuff/RecruitAI/frontend/src/app/dashboard/copilot/page.tsx) at **1,152 lines** and [routes_chat.py](file:///home/dracarys/Projects/personal-stuff/RecruitAI/backend/app/api/routes_chat.py) at **826 lines**), synchronous 60s+ graph execution on HTTP paths, and duplicated chat implementations.
4. **AI Privacy & Compliance**: Unredacted candidate PII transmitted to third-party LLMs, lack of candidate consent tracking, missing right-to-erasure workflows (GDPR Art. 17 / NYC LL144), and shared cross-tenant telemetry logs.

This document serves as the **single source of truth** for all remediation items across security, correctness, architecture, privacy, hygiene, and testing.

---

## Phased Execution Roadmap

```
Phase 0: Production Blockers (Security & Correctness) ───► Days 1–3
Phase 1: Architecture, Decomposition & Async Engine   ───► Weeks 1–2
Phase 2: AI Privacy, PII Redaction & Compliance       ───► Weeks 3–4
Phase 3: LLM Reliability, Testing & Observability     ───► Weeks 5–6
```

---

## Master Consolidated Action Checklist

### Section 1: 🔴 P0 — Security & Multi-Tenant Isolation Blockers

- [x] **SEC-1: Harden JWT signature verification** (`backend/app/core/auth.py`)
  - [x] Pin `algorithms=["HS256"]` — delete unverified-header algorithm sniffing (`token_alg = header.get("alg")`) and remove `HS384`, `HS512`, `RS256`, `ES256` to eliminate algorithm confusion attack vectors.
  - [x] Enable mandatory audience verification (`verify_aud: True`) and expiration verification (`verify_exp: True`).
  - [x] Reorder auth execution: make local cryptographic JWT decoding primary; demote the per-request Supabase network call (`client.auth.get_user(token)`) to fallback to remove +100–300 ms latency tax and network failure dependency on every API request.
  - [x] Reject non-UUID user IDs in `_ensure_valid_uuid` with HTTP 401 instead of deterministically hashing arbitrary strings via `uuid5(NAMESPACE_DNS, uid)`, which creates invisible tenant data partitioning.

- [x] **SEC-2: Gate the SQLite fallback to dev-only & eliminate silent degradation** (`backend/app/rag/vector_store.py`, `backend/app/rag/fallback_db.py`, `backend/app/api/routes_users.py`)
  - [x] Block `FallbackSupabaseClient` when `IS_PRODUCTION == True` — return HTTP 503 Service Unavailable instead of silently degrading multi-tenant data into SQLite.
  - [x] Eliminate module-global `_use_local_sqlite = True` permanent flip: transient network/DNS blips must not permanently degrade worker state until process restart.
  - [x] Fix `MockAuth.get_user()` accepting arbitrary tokens in fallback mode, eliminating cross-tenant impersonation risks.
  - [x] Remove silent fallback-to-SQLite paths in `routes_users.py` GET and PATCH handlers.
  - [x] Harden `fallback_db.py` for local dev: eliminate per-instantiation `CREATE TABLE` runs, enable connection pooling, WAL mode, and thread-safety settings to prevent `database is locked` under concurrency.

- [x] **SEC-3: Make `sessions/reset-all` safe, scoped, and transactional** (`backend/app/api/routes_chat.py:461`)
  - [x] Wrap the 7 sequential destructive delete statements into a single atomic transaction (Postgres stored procedure/RPC or explicit `BEGIN/COMMIT`).
  - [x] Convert irreversible hard deletes into soft deletes (`status='archived'`) paired with an asynchronous purge job.
  - [x] Add strict per-user rate limiting and audit logging to the reset endpoint.
  - [x] Validate foreign key cascade order to prevent partial wipes caused by `ON DELETE RESTRICT` constraints aborting mid-sequence.

- [x] **SEC-4: Enforce Row-Level Security (RLS) across all Supabase tables** (`supabase/migrations/`)
  - [x] Enable RLS on `candidates`, `jobs`, `applications`, `interviews`, `chat_sessions`, `chat_messages`, and `resume_chunks`.
  - [x] Create PostgreSQL RLS policies enforcing `auth.uid() = user_id` for `SELECT`, `INSERT`, `UPDATE`, and `DELETE`.
  - [x] Remove reliance on application-level `.eq("user_id", user_id)` query filters as the primary defense against cross-tenant data leaks.

---

### Section 2: 🔴 P0 — Correctness, Data Loss & Bug Blockers

- [x] **BUG-1: Fix missing `import json` in `ingestion_service.py` & prevent silent exceptions** (`backend/app/services/ingestion_service.py`)
  - [x] Add `import json` to [ingestion_service.py](file:///home/dracarys/Projects/personal-stuff/RecruitAI/backend/app/services/ingestion_service.py).
  - [x] Fix lines 57, 130, 204, 232 where `json.loads` triggered a `NameError` that was swallowed by blanket `except Exception` blocks, causing candidate metadata to be silently dropped.
  - [x] Scan the entire backend codebase for other missing imports or unhandled `NameError` risks.

- [x] **BUG-2: Eliminate the in-memory candidate evaluation cache** (`backend/app/api/routes_evaluate.py:20`)
  - [x] Delete module-global `CANDIDATE_EVALUATIONS: Dict[str, Dict[str, Any]] = {}`.
  - [x] Make PostgreSQL the single source of truth for all rubric scores, statuses, and notes.
  - [x] Eliminate stale cache reads shadowing DB writes in `get_candidate_evaluation` and divergent exports in `export_ats_data` across multi-worker Uvicorn instances.
  - [x] Fix arbitrary job association in `save_candidate_evaluation` (`client.table("jobs").select("id").limit(1)`), which linked evaluations to random jobs; require explicit `job_id` or session context.

- [x] **BUG-3: Replace O(N²) candidate-session JSON scanning with a relational join table** (`backend/app/api/routes_chat.py`, `backend/app/services/ingestion_service.py`)
  - [x] Create `session_candidates(session_id UUID, candidate_id UUID, created_at TIMESTAMPTZ)` table with primary key `(session_id, candidate_id)` and foreign key indexes.
  - [x] Migrate candidate filtering away from scanning JSON metadata blobs (`metadata.session_id` and `metadata.session_ids`) in Python.
  - [x] Implement an expand/contract migration backfilling existing candidate relationships without downtime.
  - [x] Resolve candidate disappearance bug where candidates created prior to JSON schema changes vanished from session counts.

- [x] **BUG-4: Stop persisting fabricated interview and scheduling data** (`backend/app/api/routes_chat.py:278`)
  - [x] Remove hardcoded past fallback slot `"2026-08-15T10:00:00Z"`; store `NULL` when slot is unknown or unextracted.
  - [x] Propagate real `mode` and `duration_minutes` from the interview object instead of hardcoding `"video"` and `45`.
  - [x] Match interview candidates by unique UUID `candidate_id` rather than fuzzy exact `full_name` strings.

- [x] **BUG-5: Implement partial-failure semantics & deterministic dedup on multi-resume upload** (`backend/app/api/routes_ingest.py`)
  - [x] Return per-file aggregate response payload (`List[{filename, status, candidate_id?, error?}]`) with HTTP 207 Multi-Status instead of aborting the whole request on the first invalid file.
  - [x] Make candidate deduplication deterministic: use SHA-256 hash of normalized resume text as the primary deduplication key, falling back to verified email as secondary.

- [x] **BUG-6: Persist candidate status changes via backend API** (`frontend/src/context/RecruitmentContext.tsx:396`)
  - [x] Wire `handleSetStatus` to dispatch `POST /candidates/evaluate` (or dedicated `/candidates/{id}/status` endpoint) instead of writing only to React state and `localStorage`.
  - [x] Remove unused `candidateName` dead argument from `handleSetStatus` function signature.
  - [x] Add optimistic UI updates with rollback on network failure; treat `localStorage` as temporary cache only and expire stale keys.

- [x] **BUG-7: Fix optimistic profile updates reporting false success on database error** (`frontend/src/context/AuthContext.tsx:174`)
  - [x] Check `dbError` immediately after Supabase call and early-return `{ error: dbError }` before calling `setProfile`.
  - [x] Surface backend synchronization failures to the user via toast notifications rather than silently swallowing errors.

- [x] **BUG-8: Remove deceptive skill matching fallback shortcut** (`backend/app/services/matching_service.py:186`)
  - [x] Delete lines 186–191 where candidate skills are arbitrarily injected into `matched_skills` when zero actual matches exist against the Job Description.
  - [x] Return an empty `matched_skills` list and accurate zero/low score when candidate competencies do not match JD criteria.

---

### Section 3: 🟠 P1 — Architecture, Structural Simplification & Code Judo

- [x] **ARCH-1: Decompose monolithic `copilot/page.tsx` (1,152 lines down to <250 lines)** (`frontend/src/app/dashboard/copilot/page.tsx`)
  - [x] Extract headless chat orchestration into a custom hook: `useCopilotChat({ activeSessionId })` managing message history, streaming state, send handling, and payload construction.
  - [x] Externalize static prompt configuration: move `PRESET_CATEGORIES` into a dedicated configuration file (`frontend/src/config/copilotPresets.ts`).
  - [x] Eliminate 4-way prompt copy duplication: dynamically derive the 4 hero welcome action cards and quick-action chips directly from `PRESET_CATEGORIES`.
  - [x] Fix hardcoded counter in Presets Deck footer (`"17 one-click workflow presets"`): bind dynamically to `totalPresetsCount`.
  - [x] Extract subcomponents into dedicated modules:
    - [x] `CopilotCanvas.tsx` (message bubbles, markdown rendering, thinking trace accordion, empty state)
    - [x] `PresetsDeckDrawer.tsx` (slide-over preset categories, search filter, prompt selection cards)
    - [x] `CopilotDock.tsx` (capsule textarea, keyboard submit, quick action chips)
    - [x] `CandidateMentionPopover.tsx` (`@` candidate selection popup and action injector)
    - [x] `ChatMessageBubble.tsx` (individual message rendering, copy-to-clipboard, timestamp)

- [x] **ARCH-2: Decompose `routes_chat.py` God-module (826 lines down to <150 lines)** (`backend/app/api/routes_chat.py`)
  - [x] Split into dedicated controllers:
    - [x] `backend/app/api/routes_chat.py` (lean chat request validation, idempotency check, job dispatch)
    - [x] `backend/app/api/routes_sessions.py` (session CRUD: list, detail, title update, deletion)
    - [x] `backend/app/api/routes_email.py` (candidate outreach dispatch and SMTP transport)
  - [x] Extract domain services into `backend/app/services/`:
    - [x] `campaign_service.py` (campaign context hydration, multi-table persistence of agent turn outputs)
    - [x] `persistence_service.py` (atomic writers for jobs, applications, and interview slots)

- [x] **ARCH-3: Eliminate database write mutations inside HTTP GET endpoint** (`backend/app/api/routes_chat.py:595-652`)
  - [x] Remove synchronous `applications.upsert()` and `candidates.update()` mutations from `GET /sessions/{session_id}`.
  - [x] Maintain HTTP `GET` idempotency and read-only purity: candidate evaluations must be computed at ingestion time or triggered via explicit `POST /candidates/evaluate` or async background task.

- [x] **ARCH-4: Transition agent graph from synchronous HTTP request to asynchronous job model** (`backend/app/api/routes_chat.py`)
  - [x] Replace synchronous `graph.invoke(initial_state)` (p99 > 60s) with background task execution.
  - [x] Adopt async request lifecycle:
    - `POST /api/chat` validates, saves user message with client idempotency key, enqueues agent job, and returns `HTTP 202 Accepted` with `{job_id}`.
    - `GET /api/chat/jobs/{job_id}` returns status and partial results.
    - `GET /api/chat/jobs/{job_id}/stream` delivers Server-Sent Events (SSE) for agent steps, reasoning tokens, and final response.
  - [x] Add client-side timeout and abort controller handling to `fetchWithAuth`.

- [x] **ARCH-5: Unify duplicated frontend chat engines & eliminate type divergence** (`frontend/src/app/dashboard/page.tsx`, `frontend/src/app/dashboard/copilot/page.tsx`)
  - [x] Replace divergent `/api/chat` implementations across `dashboard/page.tsx` and `copilot/page.tsx` with unified `useCopilotChat()`.
  - [x] Reconcile conversation history window divergence (standardize on consistent window size; eliminate 6 vs 8 inconsistency).
  - [x] Replace `payload: any` and `catch (err: any)` with strict TypeScript interfaces mirroring backend Pydantic models (`ChatRequest` and `ChatResponse`).
  - [x] Eliminate redundant `Message` type definitions across `copilot/page.tsx`, `dashboard/page.tsx`, and `RecruitmentContext.tsx`.

- [x] **ARCH-6: Remove or make real simulated agent telemetry** (`frontend/src/app/dashboard/copilot/page.tsx:280-320`)
  - [x] Remove hardcoded fake progress array (`simulatedSteps = ['Supervisor: Query categorized...', ...]`) and fake `setTimeout` step advancement.
  - [x] Consume real SSE telemetry events emitted by LangGraph nodes, or remove the step trace UI if backend telemetry is unavailable.
  - [x] Eliminate brittle heuristic substring checks (`lowerResp.includes('rank')`) for followup question generation; generate suggestions dynamically from LLM output or static schema.

- [x] **ARCH-7: Implement atomic session state loading in frontend** (`frontend/src/context/RecruitmentContext.tsx:178`)
  - [x] Stop clearing candidate, JD, interview, and status state before response validation in `loadSession`.
  - [x] Batch state updates in a single render pass after the network response is validated, preventing empty workspace flashes if fetch fails mid-flight.
  - [x] Create a typed `sessionStorage.ts` utility consolidating scattered string keys (`recruitai_cand_statuses_${id}`, `recruitai_active_session`, `recruitai_eval_notes`).

- [x] **ARCH-8: Decompose monolithic `ProfileModal.tsx` (875 lines)** (`frontend/src/components/ProfileModal.tsx`)
  - [x] Extract the 4 configuration views into dedicated tab components: `ProfileTab.tsx`, `PreferencesTab.tsx`, `NotificationsTab.tsx`, and `SecurityTab.tsx`.
  - [x] Centralize profile form state management and validation logic.

---

### Section 4: 🟠 P1 — AI Security, PII Minimization & Data Privacy

- [x] **AI-SEC-1: Provider terms verification & production gate** (`backend/app/core/config.py`)
  - [x] Verify paid Gemini API tier with training opt-out and execute a formal Data Processing Agreement (DPA) guaranteeing zero data retention.
  - [x] Add `LLM_DATA_USE_MODE = os.getenv("LLM_DATA_USE_MODE", "unverified")` startup check: raise error on server boot in production if mode is not set to `zero_retention_verified`.
  - [x] Implement automatic kill-switch / graceful degradation to rule-based 5-pillar matching if provider connectivity or terms fail.

- [x] **AI-SEC-2: Build canonical PII minimization and redaction choke point** (`backend/app/services/redaction.py`)
  - [x] Create `redaction.py` service supporting email, phone, address, and URL sanitization.
  - [x] Apply redaction before LLM exposure in `screen_node`, `candidate_qa_node`, comparison node, and interview generator: replace candidate names in prompt tags with opaque `candidate_id` tokens.
  - [x] Redact chunk text before generating embeddings in `embeddings.py` to prevent vector inversion attacks.
  - [x] Redact chat conversation history sent to the model while maintaining an in-memory reversible mapping server-side for recruiter UI rendering.
  - [x] Resolve inverted privacy flaw where blind-hiring mode masked names in the browser while sending unredacted PII to external LLMs.

- [ ] **AI-SEC-3: Implement tiered data retention & cascade erasure** (`backend/app/services/retention.py`, `backend/app/api/routes_privacy.py`)
  - [ ] Enforce automated retention schedules:
    - Raw resume text (`candidates.raw_resume_text`): purge after 90 days.
    - Vector embeddings (`resume_chunks`): cascade delete with candidate record.
    - Chat messages (`chat_messages`): retain for 12 months.
    - Candidate evaluations: configurable per-tenant employment law retention (1–2 years).
  - [ ] Create transactional cascading delete helper `purge_candidate(candidate_id, user_id)`: candidate → chunks → embeddings → applications → interviews → messages.
  - [ ] Implement GDPR compliance endpoints:
    - `GET /api/privacy/export/{candidate_id}` (GDPR Art. 15/20 data subject export).
    - `DELETE /api/privacy/candidates/{candidate_id}` (GDPR Art. 17 right-to-erasure).

- [x] **AI-SEC-4: Defend against indirect prompt injection in resume files** (`backend/app/graph/screen_node.py`)
  - [x] Maintain XML `<candidate_resume>` tag isolation with explicit delimiter instructions.
  - [x] Implement semantic output validation: reject evaluations with `match_score > 100`, unmapped candidate IDs, or instruction-following text artifacts.
  - [x] Add anomaly detection: flag score swings > 40 points or evaluations quoting prompt-injection keywords ("ignore previous instructions").
  - [x] Maintain strict human-in-the-loop requirement (`pending_confirmation`) before allowing the agent to dispatch emails or modify candidate statuses.

- [ ] **AI-SEC-5: Redesign logging to prevent cross-tenant telemetry leaks** (`backend/app/core/logging.py`)
  - [ ] Eliminate module-global `_current_turn` and shared `logs/trace.jsonl` file.
  - [ ] Remove `router_logs` returning global server traces to clients in `ChatResponse`.
  - [ ] Scope telemetry logs by `request_id`, `session_id`, and `user_id`.
  - [ ] Whitelist allowed keys in `log_event(extra=...)`; strictly prohibit raw prompts, resume text, and completions in log lines.
  - [ ] Mask exception strings: log `type(e)` and provider status code instead of `str(e)` which may echo prompt fragments.

- [ ] **AI-SEC-6: Candidate consent capture & GDPR Art. 22 human-in-the-loop guard**
  - [ ] Add candidate consent metadata fields (`consent_at`, `consent_version`, `source`) to `candidates` schema.
  - [ ] Enforce GDPR Art. 22 legal requirement: implement code-level guard preventing automated agents from setting `status='rejected'`; adverse hiring decisions must require an authenticated human recruiter action.
  - [ ] Generate automated bias-audit artifacts (statistical score distribution across demographic proxies) for NYC Local Law 144 compliance.

---

### Section 5: 🟡 P2 — Engineering Standards, Infrastructure & Testing

- [ ] **ENG-1: Replace hand-rolled regex markdown compiler with audited parser** (`frontend/src/components/MarkdownText.tsx`)
  - [ ] Replace custom 174-line regex-to-HTML parser and `dangerouslySetInnerHTML` with `react-markdown` + `rehype-sanitize`.
  - [ ] Fix attribute injection XSS vulnerabilities (missing quote escaping on markdown links).
  - [ ] Collapse confusing duplicate props (`text` vs `content`) into a single `content` prop.

- [ ] **ENG-2: Fix un-mocked external network calls in automated tests** (`backend/tests/test_real_api.py`)
  - [ ] Mock IndianAPI and SerpApi HTTP responses in [test_real_api.py](file:///home/dracarys/Projects/personal-stuff/RecruitAI/backend/tests/test_real_api.py).
  - [ ] Ensure `pytest backend/tests/` runs 100% offline, deterministically, and never hangs in socket polling state (`poll_schedule_timeout`).

- [ ] **ENG-3: Add API-surface contract tests** (`backend/tests/`)
  - [ ] Add contract tests for `routes_chat.py` (previously 826 lines with zero direct test coverage).
  - [ ] Add integration tests for multi-file upload partial failure semantics (`routes_ingest.py`).
  - [ ] Add test coverage for candidate status persistence and ATS exports (`routes_evaluate.py`).
  - [ ] Add regression tests for metadata JSON serialization in `ingestion_service.py` to prevent recurrence of BUG-1.

- [ ] **ENG-4: LLM reliability engineering: circuit breakers & cost accounting** (`backend/app/core/llm_router.py`)
  - [ ] Replace pure round-robin rotation with a circuit breaker tracking consecutive model failures with cooldown periods.
  - [ ] Enforce upstream JSON schema mode on LLM requests; delete `ast.literal_eval` fallback.
  - [ ] Implement token and cost accounting: log `{model, tokens_in, tokens_out, latency, tenant_id}` per turn.

- [ ] **ENG-5: Operational hardening & configuration cleanliness**
  - [ ] Fix [backend/app/core/config.py](file:///home/dracarys/Projects/personal-stuff/RecruitAI/backend/app/core/config.py): prevent import-time crash on invalid `SMTP_PORT`; decouple `IS_PRODUCTION` from platform-specific `bool(os.getenv("RENDER"))`.
  - [ ] Fix [backend/app/main.py](file:///home/dracarys/Projects/personal-stuff/RecruitAI/backend/app/main.py): remove hardcoded `reload=True`, `host="0.0.0.0"`, and `port=8000` from production invocation; drive from environment variables.
  - [ ] Redact health probe: split `/api/health` into a shallow public liveness probe and an authenticated deep readiness check (`/api/health/ready`), eliminating public database error string leaks.
  - [ ] Replace raw `detail=str(exc)` in route exception handlers with opaque error messages and server-side request tracking IDs (`ref={request_id}`).

- [ ] **ENG-6: Establish CI code quality gates** (`.github/workflows/ci.yml`)
  - [ ] Add `ruff check .` with rules:
    - `E722` (no bare `except`)
    - `F821` (no undefined names)
    - `BLE001` (no blind exception catching)
    - `S` (bandit security checks)
  - [ ] Add `mypy app/ --strict` starting with services and infrastructure layers.
  - [ ] Add frontend CI checks: `npm run build`, `tsc --noEmit`, `eslint .`, and `vitest run`.
  - [ ] Enforce test coverage threshold: 70% overall, 90% on business logic services.

---

### Section 6: 🟢 P3 — Observability, Operations & Frontend Polish

- [ ] **OPS-1: Distributed tracing and metrics**
  - [ ] Instrument OpenTelemetry spans across HTTP controllers, services, LangGraph nodes, and LLM calls.
  - [ ] Instrument RED/USE metrics: request rates, error rates, p95/p99 latencies, queue depths, and token usage per tenant.
  - [ ] Define explicit Service Level Objectives (SLOs) in `docs/slo.md` (e.g., 99% chat acknowledgment < 2s; 95% screening < 30s) with automated alerting.
  - [ ] Create operational runbooks for production alerts (symptoms, queries, mitigations, escalation paths).

- [ ] **UI-1: Frontend accessibility, caching & dialog polish**
  - [ ] Replace `window.confirm` dialogs in `AppSidebar.tsx` and Copilot with accessible modal confirmation components.
  - [ ] Adopt TanStack Query for server state caching, background invalidation, and retry handling instead of hand-rolled `useEffect` chains in `RecruitmentContext.tsx`.
  - [ ] Conduct accessibility audit ensuring WCAG 2.2 AA compliance: focus traps in `CandidateDrawer` and `ProfileModal`, keyboard navigation, and color contrast.
  - [ ] Remove decorative dead code in `dashboard/page.tsx`: delete unused `getSessionUrl` and `ingestEndpoint` functions.
  - [ ] Debounce `onAuthStateChange` in `AuthContext.tsx`: only trigger `fetchProfile` on `SIGNED_IN` or `USER_UPDATED`, preventing redundant database queries on `TOKEN_REFRESHED`.

---

## Verification & Definition of "Production-Ready"

The pull request and codebase will be certified production-ready only when:
1. **Zero High-Severity Security Findings**: JWT pinned to HS256, SQLite mock dev-only, RLS enforced on all tables, and PII redacted before external AI calls.
2. **Zero Known Correctness Bugs**: `import json` verified, in-memory cache deleted, candidate status persisted via API, and multi-file upload partial-failure safe.
3. **No File Exceeds 500 Lines**: `copilot/page.tsx`, `routes_chat.py`, and `ProfileModal.tsx` fully decomposed into modular, testable components.
4. **Clean Static Analysis**: Zero linter errors under `ruff` (`F821`, `E722`, `BLE001`), clean `mypy` type check, and zero TypeScript compilation errors under `tsc --noEmit`.
5. **Hermetic Test Suite**: 100% of tests pass offline with zero un-mocked external network calls or socket timeouts.
6. **No Data Bleed**: Multi-tenant isolation verified by automated cross-tenant security tests.