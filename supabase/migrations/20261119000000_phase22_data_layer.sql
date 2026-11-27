-- ==============================================================================
-- RecruitAI — Phase 22: data layer at scale
-- Target: Supabase (PostgreSQL + pgvector)
--
-- Adds the composite indexes backing the hot, tenant-scoped list/sweep paths,
-- an HNSW index for `match_resume_chunks`, and the payment idempotency ledger.
-- Idempotent: every statement is `IF NOT EXISTS`, so re-running is safe.
--
-- Index build note: plain CREATE INDEX takes a SHARE lock that blocks writes to
-- the table while it builds. On a large production table, run the same
-- statement manually with CONCURRENTLY during a quiet window, then re-run this
-- migration (the IF NOT EXISTS guard makes it a no-op).
-- ==============================================================================

-- ── Hot tenant-scoped list paths ─────────────────────────────────────────────

-- `GET /api/sessions`: ORDER BY updated_at DESC per tenant.
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_updated
    ON public.chat_sessions (user_id, updated_at DESC);

-- Session detail / campaign hydration: messages by session, newest first.
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_session_created
    ON public.chat_messages (user_id, session_id, created_at);

-- Candidate list + retention scans (created_at ordered per tenant).
CREATE INDEX IF NOT EXISTS idx_candidates_user_created
    ON public.candidates (user_id, created_at);

-- Analytics status counts and pipeline funnel per tenant.
CREATE INDEX IF NOT EXISTS idx_applications_user_status
    ON public.applications (user_id, status);
CREATE INDEX IF NOT EXISTS idx_applications_user_created
    ON public.applications (user_id, created_at);

-- Upcoming-interview filtering per tenant.
CREATE INDEX IF NOT EXISTS idx_interviews_user_scheduled
    ON public.interviews (user_id, scheduled_at);

-- Active-job counts and job lists per tenant.
CREATE INDEX IF NOT EXISTS idx_jobs_user_status
    ON public.jobs (user_id, status);

-- Credit ledger reads (newest first per tenant) and outreach history.
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_created
    ON public.credit_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_logs_user_created
    ON public.outreach_logs (user_id, created_at DESC);

-- Vector chunk deletion / count per candidate.
CREATE INDEX IF NOT EXISTS idx_resume_chunks_user_candidate
    ON public.resume_chunks (user_id, candidate_id);

-- ── pgvector ANN index for match_resume_chunks ───────────────────────────────
-- HNSW gives better recall than IVFFlat at comparable latency and needs no
-- training pass, so it is safe to build before the table has data. Keep any
-- existing IVFFlat index until the HNSW build is validated in staging.
CREATE INDEX IF NOT EXISTS idx_resume_chunks_embedding_hnsw
    ON public.resume_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ── Payment idempotency ──────────────────────────────────────────────────────
-- One row per processed verify/webhook key. The primary-key insert is the
-- fence: the request that wins inserts the row and may credit; a replay hits
-- the conflict and returns the original outcome without touching the ledger.
CREATE TABLE IF NOT EXISTS public.processed_events (
    id          TEXT PRIMARY KEY,
    kind        TEXT NOT NULL CHECK (kind IN ('verify', 'webhook')),
    user_id     UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_processed_events_expires_at
    ON public.processed_events (expires_at);
CREATE INDEX IF NOT EXISTS idx_processed_events_user_id
    ON public.processed_events (user_id);

-- Backend access is through the direct Postgres connection (owner role), which
-- bypasses RLS. Enabling RLS with no policy blocks accidental PostgREST/anon
-- access to the idempotency ledger.
ALTER TABLE public.processed_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.processed_events IS
    'Phase 22 payment idempotency ledger; rows expire after PAYMENT_IDEMPOTENCY_TTL_SECONDS.';
