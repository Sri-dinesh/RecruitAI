# Backend parity matrix (Phase 18)

The archived FastAPI test suite (`backend/tests/` on the
`archive/fastapi-backend` branch) is the authoritative behavioural checklist
for the Express backend. This matrix maps every Python test module to the Node
suite that owns the same behaviour, so a reviewer can see what is covered and
what is deliberately not.

Status legend:

| Status       | Meaning                                                                 |
| :----------- | :---------------------------------------------------------------------- |
| **Ported**   | Same behaviour, exercised through the TypeScript app/services.          |
| **Split**    | Python module's cases are covered by more than one focused suite.       |
| **Replaced** | Live/one-off script; replaced by the parity checker and unit fallbacks. |
| **Gap**      | No Node equivalent. Justified below, never silent.                      |

Run everything with:

```bash
cd backend
npm test                        # node:test suites
npm run typecheck               # app + test tsconfig
npm test -- tests/client-contract.test.ts
```

## Module mapping

| Archived Python module (`backend/tests/`)                | Behaviour pinned                                                                                                                                           | Node coverage                                                                                                                          | Status   |
| :------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------- | :------- |
| `test_advanced_rag.py`                                   | Query expansion, reranking, offline fallback                                                                                                               | `rag.test.ts`, `advanced-rag.test.ts`                                                                                                  | Ported   |
| `test_api_contracts.py`                                  | FastAPI status codes, 422 envelopes, request schemas across chat/ingest/evaluate/privacy                                                                   | `client-contract.test.ts`, `validate.test.ts`, `schemas.test.ts`, `app.test.ts`, `chat-routes.test.ts`                                 | Split    |
| `test_api.py`                                            | Root banner, chat routing, session wiring, health                                                                                                          | `app.test.ts`, `chat-routes.test.ts`, `session-routes.test.ts`, `observability.test.ts`                                                | Split    |
| `test_auth.py`                                           | Bearer parsing, HS256 verification, expired/wrong-audience/non-UUID tokens, local-dev fallback, production gating, tenant isolation, SEC-2 fallback gating | `auth.test.ts`, `session-routes.test.ts`, `evaluate-routes.test.ts`                                                                    | Split    |
| `test_candidate_qa.py`                                   | Candidate Q&A over workspace memory, no-candidate help                                                                                                     | `graph-rag-nodes.test.ts` (`candidateQaNode`), `graph-router.test.ts`, `graph-builder.test.ts`                                         | Split    |
| `test_circuit_breaker.py`                                | Per-model breaker open/half-open/close, cooldowns                                                                                                          | `llm-router.test.ts` (`ModelCircuitBreaker`)                                                                                           | Ported   |
| `test_document_parser.py`                                | PDF/DOCX/image/text extraction, contact info, empty/invalid input                                                                                          | `document-parser.test.ts`                                                                                                              | Ported   |
| `test_email.py`                                          | Dispatch simulation + SMTP, credit deduction, 402 on insufficient credits, recipient validation, history/stats isolation                                   | `email-tool.test.ts`, `email-routes.test.ts`, `quota.test.ts`                                                                          | Split    |
| `test_evaluate.py`                                       | Rubric persistence, DB as source of truth, status updates, tenant isolation, 401, ATS export                                                               | `evaluate-routes.test.ts`, `client-contract.test.ts`                                                                                   | Split    |
| `test_failover.py`                                       | Model order, provider failover, token/latency accounting                                                                                                   | `llm-router.test.ts` (`getNextModelOrder`, `callLlm`), `llm-gemini.test.ts`                                                            | Split    |
| `test_health.py`                                         | Liveness, readiness, metrics exposure                                                                                                                      | `observability.test.ts`, `app.test.ts`, `metrics-route.test.ts`                                                                        | Split    |
| `test_hitl.py`                                           | `finalize_shortlist` gate, confirm/edit/no flows                                                                                                           | `graph-nodes.test.ts` (`hitlConfirmNode`), `graph-builder.test.ts`                                                                     | Split    |
| `test_ingestion.py`                                      | Resume hash dedupe, chunk persistence, session binding                                                                                                     | `ingestion-service.test.ts`, `ingest-routes.test.ts`                                                                                   | Split    |
| `test_jd_parser.py`                                      | JD heuristics, filename titles, live-JD fallback                                                                                                           | `jd-parser.test.ts`, `job-desc-api.test.ts`                                                                                            | Split    |
| `test_logging_security.py`                               | Tenant-scoped telemetry, forbidden extra keys stripped, exception masking                                                                                  | `telemetry-logging.test.ts`                                                                                                            | Ported   |
| `test_matching_pipeline.py`                              | Skill normalisation, 5-pillar score, red-flag detection                                                                                                    | `matching.test.ts`                                                                                                                     | Ported   |
| `test_mismatch.py`                                       | Experience extraction, mismatch analysis, JD suggestions, red flags                                                                                        | `mismatch-analyzer.test.ts`                                                                                                            | Ported   |
| `test_multiturn_memory.py`                               | Pronoun/entity resolution across turns, "send mail" without re-asking                                                                                      | `graph-builder.test.ts`, `graph-router.test.ts`, `campaign-turn.test.ts`                                                               | Split    |
| `test_nodes.py`                                          | Count/salary/rewrite/interview nodes and empty-state messages                                                                                              | `graph-nodes.test.ts`, `graph-rag-nodes.test.ts`, `graph-runtime.test.ts`                                                              | Split    |
| `test_payments.py`                                       | Plans, orders, signature verification, subscriptions, credit consumption, webhooks, transactions                                                           | `payment-service.test.ts`, `payments-routes.test.ts`, `schemas.test.ts`                                                                | Split    |
| `test_phase10.py`                                        | Comparison table, email drafting, trend analysis, scheduling slots, red-flag node                                                                          | `graph-nodes.test.ts` (`compareNode`, `scheduleNode`, `redflagsNode`, `trendNode`), `graph-rag-nodes.test.ts`, `graph-builder.test.ts` | Split    |
| `test_privacy_retention.py`                              | Art. 15/17/20 exports and erasure, retention sweep, cascade                                                                                                | `privacy-routes.test.ts`, `retention-scheduler.test.ts`, `retention-cli.test.ts`                                                       | Split    |
| `test_redaction_security.py`                             | Prompt-injection detection, PII sanitisation, embedding redaction                                                                                          | `redaction.test.ts`                                                                                                                    | Ported   |
| `test_reports.py`                                        | Raw report generation, session report endpoint, executive dossier PDF                                                                                      | `report-routes.test.ts`                                                                                                                | Ported   |
| `test_resume_parser.py`                                  | Heuristic and LLM resume parsing, name/contact extraction                                                                                                  | `resume-parser.test.ts`                                                                                                                | Ported   |
| `test_schemas.py`                                        | Pydantic coercion and required-field semantics                                                                                                             | `schemas.test.ts`, `validate.test.ts`                                                                                                  | Ported   |
| `test_sessions.py`                                       | Session CRUD, reset isolation, candidate join/backfill                                                                                                     | `session-routes.test.ts`, `client-contract.test.ts`                                                                                    | Split    |
| `test_tavily_service.py`                                 | Singleton, TTL cache, search shaping, unavailable fallbacks, benchmarks/trends                                                                             | `tavily.test.ts`, `tavily-intel.test.ts`                                                                                               | Split    |
| `test_telemetry.py`                                      | RED/USE registry, span context, request metrics                                                                                                            | `telemetry-metrics.test.ts`, `observability.test.ts`                                                                                   | Split    |
| `test_upload.py`                                         | Multi-file uploads, unsupported types, images, 207 partial failure, dedupe                                                                                 | `ingest-routes.test.ts`, `ingestion-service.test.ts`                                                                                   | Split    |
| `test_users.py`                                          | Profile read/update, eight preference defaults, dev fallback                                                                                               | `user-routes.test.ts`, `client-contract.test.ts`                                                                                       | Split    |
| `test_real_api.py`                                       | Live Tavily/Gemini network smoke tests                                                                                                                     | `job-desc-api.test.ts`, `tavily.test.ts` (deterministic fallbacks) + `scripts/parity-check.mjs`                                        | Replaced |
| `verify_mvp.py`, `verify_phase11.py`, `verify_router.py` | Manual end-to-end scripts against a live stack                                                                                                             | `scripts/parity-check.mjs` (dual-run HTTP comparison)                                                                                  | Replaced |

## Phase 18 focus areas

| Focus area                             | Primary suites                                                                                                                                                            |
| :------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth extraction and failures           | `auth.test.ts` (401/403, non-UUID, expired, wrong audience, local-dev fallback, production gating)                                                                        |
| Credit consumption and 402             | `payment-service.test.ts`, `payments-routes.test.ts`, `quota.test.ts`, `email-routes.test.ts`                                                                             |
| Outreach log persistence and isolation | `email-routes.test.ts`, `email-tool.test.ts`                                                                                                                              |
| Session CRUD                           | `session-routes.test.ts`, `client-contract.test.ts`                                                                                                                       |
| Ingest parsing outcomes                | `ingest-routes.test.ts`, `ingestion-service.test.ts`, `document-parser.test.ts`                                                                                           |
| Job/SSE lifecycle                      | `chat-job-manager.test.ts`, `redis-job-manager.test.ts`, `chat-routes.test.ts`                                                                                            |
| Privacy cascade                        | `privacy-routes.test.ts`, `retention-scheduler.test.ts`, `retention-cli.test.ts`                                                                                          |
| Webhook signatures                     | `payment-service.test.ts` (`payment signatures`, `processWebhookEvent`), `payments-routes.test.ts` (`POST /api/payments/webhook`)                                         |
| Multi-tenant isolation                 | `auth.test.ts`, `session-routes.test.ts`, `evaluate-routes.test.ts`, `email-routes.test.ts`, `privacy-routes.test.ts`, `ingestion-service.test.ts`, `chat-routes.test.ts` |
| Client response shapes                 | `client-contract.test.ts` (web + mobile consumed fields)                                                                                                                  |

## Intentional gaps

1. **`app/core/tracing.py` span tracing.** Python emits `trace_span`
   context-manager records for chat acknowledgement timings. The Node port
   keeps the same latency data in the RED metrics registry
   (`telemetry-metrics.test.ts`) and structured logs, but has no separate span
   tree. `/api/metrics` and `docs/slo.md` read from the metrics registry, so the
   SLO data is still available. No client or test depends on the Python span
   object.
2. **Live network smoke tests (`test_real_api.py`, `verify_*.py`).** These call
   Tavily/Gemini and a live stack. They are not unit tests and are not portable
   to CI. Their deterministic fallback behaviour is covered by `tavily.test.ts`,
   `job-desc-api.test.ts` and `llm-router.test.ts`; their live role is replaced
   by `npm run parity:check` against two running backends.
3. **Supabase REST transport.** Python talks to Supabase over PostgREST; Node
   talks to the same PostgreSQL database through Drizzle. `db-rpc.test.ts`,
   `db-query-store`/`workspace-query-store.test.ts` and `db-fallback.test.ts`
   pin the row shapes and RPC contracts. Transport differences are invisible to
   API clients.

## Parity checks

`scripts/parity-check.mjs` (also `npm run parity:check`) compares a running
FastAPI backend with a running Express backend read-only:

```bash
PARITY_BEARER_TOKEN=<token> npm run parity:check
```

- Default mode compares status codes, content types and JSON key/type shapes.
- `PARITY_STRICT_DATA=true` additionally compares scalar values and array
  lengths. Use it only when both backends share the same database and tenant.
- Process-local metrics maps (`latencies_ms`, `status_breakdown`) and volatile
  timestamps are always ignored.
- Open maps (`preferences`, `evaluations`) report key differences as warnings,
  because their keys are data, not schema.

See `docs/cutover.md` for the operating procedure that uses this script.
