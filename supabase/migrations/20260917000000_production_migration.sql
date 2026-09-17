-- ==============================================================================
-- RecruitAI — Consolidated Production Schema Migration (2026)
-- Target: Supabase (PostgreSQL + pgvector)
-- Purpose: Apply all schema enhancements, relational join tables, nullable slot
--          constraints, Row-Level Security (RLS), and atomic reset RPC.
-- Idempotent: Safe to run multiple times without data loss or duplicate errors.
-- ==============================================================================

-- 1. Ensure extensions are enabled
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==============================================================================
-- 2. Create session_candidates relational join table (BUG-3)
-- Replaces O(N^2) JSON scanning with indexed relational lookups.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.session_candidates (
    session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (session_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_session_candidates_session_id ON public.session_candidates(session_id);
CREATE INDEX IF NOT EXISTS idx_session_candidates_candidate_id ON public.session_candidates(candidate_id);

-- ==============================================================================
-- 3. Update interviews table constraints (BUG-4)
-- Allow NULL scheduled_at when interview slot is unknown or unextracted.
-- Prevents persistence of fabricated timestamps.
-- ==============================================================================
DO $$
BEGIN
    ALTER TABLE public.interviews ALTER COLUMN scheduled_at DROP NOT NULL;
    ALTER TABLE public.interviews ALTER COLUMN duration_minutes SET DEFAULT 30;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- ==============================================================================
-- 4. Backfill existing relationships from candidate metadata into session_candidates
-- ==============================================================================
DO $$
DECLARE
  c RECORD;
  sid TEXT;
BEGIN
  FOR c IN SELECT id, metadata FROM public.candidates WHERE metadata IS NOT NULL LOOP
    -- Backfill single legacy session_id
    IF c.metadata ? 'session_id' AND (c.metadata->>'session_id') IS NOT NULL AND (c.metadata->>'session_id') <> '' THEN
      BEGIN
        INSERT INTO public.session_candidates(session_id, candidate_id)
        VALUES ((c.metadata->>'session_id')::UUID, c.id)
        ON CONFLICT (session_id, candidate_id) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    -- Backfill array legacy session_ids
    IF c.metadata ? 'session_ids' AND jsonb_typeof(c.metadata->'session_ids') = 'array' THEN
      FOR sid IN SELECT jsonb_array_elements_text(c.metadata->'session_ids') LOOP
        IF sid IS NOT NULL AND sid <> '' THEN
          BEGIN
            INSERT INTO public.session_candidates(session_id, candidate_id)
            VALUES (sid::UUID, c.id)
            ON CONFLICT (session_id, candidate_id) DO NOTHING;
          EXCEPTION WHEN OTHERS THEN
            NULL;
          END;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- ==============================================================================
-- 5. Enforce Row-Level Security (RLS) across all multi-tenant tables (SEC-4)
-- ==============================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_candidates ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to allow clean recreation
DROP POLICY IF EXISTS "users_tenant_isolation" ON public.users;
DROP POLICY IF EXISTS "jobs_tenant_isolation" ON public.jobs;
DROP POLICY IF EXISTS "candidates_tenant_isolation" ON public.candidates;
DROP POLICY IF EXISTS "resume_chunks_tenant_isolation" ON public.resume_chunks;
DROP POLICY IF EXISTS "applications_tenant_isolation" ON public.applications;
DROP POLICY IF EXISTS "interviews_tenant_isolation" ON public.interviews;
DROP POLICY IF EXISTS "chat_sessions_tenant_isolation" ON public.chat_sessions;
DROP POLICY IF EXISTS "chat_messages_tenant_isolation" ON public.chat_messages;
DROP POLICY IF EXISTS "session_candidates_tenant_isolation" ON public.session_candidates;

-- Create Tenant Isolation Policies
CREATE POLICY "users_tenant_isolation" ON public.users
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "jobs_tenant_isolation" ON public.jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "candidates_tenant_isolation" ON public.candidates
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "resume_chunks_tenant_isolation" ON public.resume_chunks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "applications_tenant_isolation" ON public.applications
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "interviews_tenant_isolation" ON public.interviews
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "chat_sessions_tenant_isolation" ON public.chat_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "chat_messages_tenant_isolation" ON public.chat_messages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "session_candidates_tenant_isolation" ON public.session_candidates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_sessions s
      WHERE s.id = session_candidates.session_id
      AND (auth.uid() IS NULL OR s.user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_sessions s
      WHERE s.id = session_candidates.session_id
      AND (auth.uid() IS NULL OR s.user_id = auth.uid())
    )
  );

-- ==============================================================================
-- 6. Transactional Atomic Workspace Reset RPC (SEC-3)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.reset_user_workspace(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Security: verify caller only resets their own data when called from client context
  IF auth.uid() IS NOT NULL AND auth.uid() != target_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot reset data for another tenant';
  END IF;

  -- Delete in strict topological cascade order to prevent FK restrict violations
  DELETE FROM public.session_candidates WHERE session_id IN (SELECT id FROM public.chat_sessions WHERE user_id = target_user_id);
  DELETE FROM public.chat_messages WHERE user_id = target_user_id;
  DELETE FROM public.interviews WHERE user_id = target_user_id;
  DELETE FROM public.applications WHERE user_id = target_user_id;
  DELETE FROM public.resume_chunks WHERE user_id = target_user_id;
  DELETE FROM public.candidates WHERE user_id = target_user_id;
  DELETE FROM public.chat_sessions WHERE user_id = target_user_id;
  DELETE FROM public.jobs WHERE user_id = target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'reset_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_user_workspace(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_user_workspace(UUID) TO service_role;

-- ==============================================================================
-- 7. Notify PostgREST to reload schema cache
-- ==============================================================================
NOTIFY pgrst, 'reload schema';
