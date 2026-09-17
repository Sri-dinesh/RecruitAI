-- ==============================================================================
-- RecruitAI — Consolidated Production Schema Migration (2026)
-- Target: Supabase (PostgreSQL + pgvector)
-- Purpose: Apply all schema enhancements, relational join tables, nullable slot
--          constraints, covering indexes, hardened Row-Level Security (RLS),
--          analytics RPC functions, and atomic reset RPC.
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

-- Covering index for chat_messages foreign key to user_id
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON public.chat_messages(user_id);

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
-- Hardened with (SELECT auth.uid()) for InitPlan query planner optimization.
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

-- Drop legacy / duplicate policies
DROP POLICY IF EXISTS "Users manage their own jobs" ON public.jobs;
DROP POLICY IF EXISTS "Users manage their own candidates" ON public.candidates;
DROP POLICY IF EXISTS "Users manage their own resume_chunks" ON public.resume_chunks;
DROP POLICY IF EXISTS "Users manage their own applications" ON public.applications;
DROP POLICY IF EXISTS "Users manage their own interviews" ON public.interviews;
DROP POLICY IF EXISTS "Users manage their own chat_sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users manage their own chat_messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Users manage their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Service role full access on users" ON public.users;

DROP POLICY IF EXISTS "users_tenant_isolation" ON public.users;
DROP POLICY IF EXISTS "jobs_tenant_isolation" ON public.jobs;
DROP POLICY IF EXISTS "candidates_tenant_isolation" ON public.candidates;
DROP POLICY IF EXISTS "resume_chunks_tenant_isolation" ON public.resume_chunks;
DROP POLICY IF EXISTS "applications_tenant_isolation" ON public.applications;
DROP POLICY IF EXISTS "interviews_tenant_isolation" ON public.interviews;
DROP POLICY IF EXISTS "chat_sessions_tenant_isolation" ON public.chat_sessions;
DROP POLICY IF EXISTS "chat_messages_tenant_isolation" ON public.chat_messages;
DROP POLICY IF EXISTS "session_candidates_tenant_isolation" ON public.session_candidates;

-- Create hardened Tenant Isolation Policies
CREATE POLICY "users_tenant_isolation" ON public.users
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY "jobs_tenant_isolation" ON public.jobs
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "candidates_tenant_isolation" ON public.candidates
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "resume_chunks_tenant_isolation" ON public.resume_chunks
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "applications_tenant_isolation" ON public.applications
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "interviews_tenant_isolation" ON public.interviews
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "chat_sessions_tenant_isolation" ON public.chat_sessions
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "chat_messages_tenant_isolation" ON public.chat_messages
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "session_candidates_tenant_isolation" ON public.session_candidates
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_sessions s
      WHERE s.id = session_candidates.session_id
      AND (s.user_id = (SELECT auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_sessions s
      WHERE s.id = session_candidates.session_id
      AND (s.user_id = (SELECT auth.uid()))
    )
  );

-- ==============================================================================
-- 6. Analytics RPC Functions
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_analytics_summary(p_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'total_candidates',       (SELECT COUNT(*) FROM public.candidates   WHERE user_id = p_user_id),
    'total_jobs',             (SELECT COUNT(*) FROM public.jobs          WHERE user_id = p_user_id),
    'active_jobs',            (SELECT COUNT(*) FROM public.jobs          WHERE user_id = p_user_id AND status = 'active'),
    'total_applications',     (SELECT COUNT(*) FROM public.applications  WHERE user_id = p_user_id),
    'total_shortlisted',      (SELECT COUNT(*) FROM public.applications  WHERE user_id = p_user_id AND status = 'shortlisted'),
    'total_interviews',       (SELECT COUNT(*) FROM public.interviews    WHERE user_id = p_user_id),
    'upcoming_interviews',    (SELECT COUNT(*) FROM public.interviews    WHERE user_id = p_user_id AND status = 'scheduled' AND scheduled_at >= NOW()),
    'total_offered',          (SELECT COUNT(*) FROM public.applications  WHERE user_id = p_user_id AND status = 'offered'),
    'total_rejected',         (SELECT COUNT(*) FROM public.applications  WHERE user_id = p_user_id AND status = 'rejected'),
    'avg_match_score',        (SELECT ROUND(AVG(match_score)::numeric, 1) FROM public.applications WHERE user_id = p_user_id AND match_score IS NOT NULL),
    'total_chat_sessions',    (SELECT COUNT(*) FROM public.chat_sessions WHERE user_id = p_user_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_pipeline_funnel(p_user_id uuid)
RETURNS TABLE(stage text, count bigint, percentage numeric) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH totals AS (
    SELECT
      COUNT(*) FILTER (WHERE status = 'new')                  AS cnt_new,
      COUNT(*) FILTER (WHERE status = 'shortlisted')          AS cnt_shortlisted,
      COUNT(*) FILTER (WHERE status = 'interview_scheduled')  AS cnt_interview,
      COUNT(*) FILTER (WHERE status = 'interviewed')          AS cnt_interviewed,
      COUNT(*) FILTER (WHERE status = 'offered')              AS cnt_offered,
      COUNT(*) FILTER (WHERE status = 'rejected')             AS cnt_rejected,
      COUNT(*)                                                AS cnt_total
    FROM public.applications
    WHERE user_id = p_user_id
  )
  SELECT stage, count,
    CASE WHEN cnt_total > 0 THEN ROUND((count::numeric / cnt_total * 100), 1) ELSE 0.0 END AS percentage
  FROM (
    VALUES
      ('New',                  (SELECT cnt_new          FROM totals), (SELECT cnt_total FROM totals)),
      ('Shortlisted',          (SELECT cnt_shortlisted  FROM totals), (SELECT cnt_total FROM totals)),
      ('Interview Scheduled',  (SELECT cnt_interview    FROM totals), (SELECT cnt_total FROM totals)),
      ('Interviewed',          (SELECT cnt_interviewed  FROM totals), (SELECT cnt_total FROM totals)),
      ('Offered',              (SELECT cnt_offered      FROM totals), (SELECT cnt_total FROM totals)),
      ('Rejected',             (SELECT cnt_rejected     FROM totals), (SELECT cnt_total FROM totals))
  ) AS t(stage, count, cnt_total);
$$;

DROP FUNCTION IF EXISTS public.get_candidates_over_time(uuid, integer);
CREATE OR REPLACE FUNCTION public.get_candidates_over_time(p_user_id uuid, days int DEFAULT 30)
RETURNS TABLE(day text, count bigint) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH date_series AS (
    SELECT generate_series(
      CURRENT_DATE - (days || ' days')::interval,
      CURRENT_DATE::timestamp,
      '1 day'::interval
    )::date AS d
  )
  SELECT
    TO_CHAR(ds.d, 'YYYY-MM-DD') AS day,
    COUNT(c.id) AS count
  FROM date_series ds
  LEFT JOIN public.candidates c
    ON c.user_id = p_user_id AND c.created_at::date = ds.d
  GROUP BY ds.d
  ORDER BY ds.d ASC;
$$;

DROP FUNCTION IF EXISTS public.get_match_score_distribution(uuid);
CREATE OR REPLACE FUNCTION public.get_match_score_distribution(p_user_id uuid)
RETURNS TABLE(bucket text, count bigint, min_score int, max_score int) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    CASE
      WHEN match_score >= 90 THEN 'Top Tier (90-100%)'
      WHEN match_score >= 75 THEN 'Strong Fit (75-89%)'
      WHEN match_score >= 60 THEN 'Good Fit (60-74%)'
      WHEN match_score >= 40 THEN 'Fair Fit (40-59%)'
      ELSE 'Low Fit (<40%)'
    END AS bucket,
    COUNT(*) AS count,
    CASE WHEN match_score >= 90 THEN 90 WHEN match_score >= 75 THEN 75 WHEN match_score >= 60 THEN 60 WHEN match_score >= 40 THEN 40 ELSE 0 END AS min_score,
    CASE WHEN match_score >= 90 THEN 100 WHEN match_score >= 75 THEN 89 WHEN match_score >= 60 THEN 74 WHEN match_score >= 40 THEN 59 ELSE 39 END AS max_score
  FROM public.applications
  WHERE user_id = p_user_id AND match_score IS NOT NULL
  GROUP BY bucket, min_score, max_score
  ORDER BY min_score DESC;
$$;

DROP FUNCTION IF EXISTS public.get_top_skills(uuid, integer);
CREATE OR REPLACE FUNCTION public.get_top_skills(p_user_id uuid, top_n int DEFAULT 12)
RETURNS TABLE(skill text, demand_count bigint) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    LOWER(TRIM(skill_elem)) AS skill,
    COUNT(*) AS demand_count
  FROM public.candidates c,
  LATERAL jsonb_array_elements_text(
    CASE
      WHEN jsonb_typeof(c.metadata->'skills') = 'array' THEN c.metadata->'skills'
      ELSE '[]'::jsonb
    END
  ) AS skill_elem
  WHERE c.user_id = p_user_id
    AND TRIM(skill_elem) <> ''
  GROUP BY LOWER(TRIM(skill_elem))
  ORDER BY demand_count DESC
  LIMIT top_n;
$$;

CREATE OR REPLACE FUNCTION public.get_hiring_velocity(p_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'avg_days_to_shortlist',
      COALESCE(ROUND(AVG(
        EXTRACT(EPOCH FROM (a.updated_at - c.created_at)) / 86400.0
      ) FILTER (WHERE a.status IN ('shortlisted','interview_scheduled','interviewed','offered'))::numeric, 1), 0),
    'avg_days_to_interview',
      COALESCE(ROUND(AVG(
        EXTRACT(EPOCH FROM (i.scheduled_at - c.created_at)) / 86400.0
      )::numeric, 1), 0),
    'avg_days_to_offer',
      COALESCE(ROUND(AVG(
        EXTRACT(EPOCH FROM (a.updated_at - c.created_at)) / 86400.0
      ) FILTER (WHERE a.status = 'offered')::numeric, 1), 0),
    'total_time_tracked', COALESCE(COUNT(DISTINCT a.candidate_id), 0)
  )
  FROM public.applications a
  JOIN public.candidates c ON c.id = a.candidate_id AND c.user_id = p_user_id
  LEFT JOIN public.interviews i ON i.candidate_id = c.id AND i.user_id = p_user_id
  WHERE a.user_id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.get_jobs_summary(p_user_id uuid)
RETURNS TABLE(
  job_id uuid, title text, status text, created_at timestamptz,
  total_applied bigint, total_shortlisted bigint, total_interviewed bigint,
  total_offered bigint, avg_match_score numeric
) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    j.id AS job_id,
    j.title,
    j.status,
    j.created_at,
    COUNT(a.id) AS total_applied,
    COUNT(a.id) FILTER (WHERE a.status IN ('shortlisted','interview_scheduled','interviewed','offered')) AS total_shortlisted,
    COUNT(a.id) FILTER (WHERE a.status IN ('interview_scheduled','interviewed')) AS total_interviewed,
    COUNT(a.id) FILTER (WHERE a.status = 'offered') AS total_offered,
    ROUND(AVG(a.match_score)::numeric, 1) AS avg_match_score
  FROM public.jobs j
  LEFT JOIN public.applications a ON a.job_id = j.id AND a.user_id = p_user_id
  WHERE j.user_id = p_user_id
  GROUP BY j.id, j.title, j.status, j.created_at
  ORDER BY j.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_recent_activity(p_user_id uuid, limit_n int DEFAULT 20)
RETURNS TABLE(event_type text, description text, entity_id uuid, occurred_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  (
    SELECT 'candidate_added'::text AS event_type, ('New resume: ' || full_name) AS description, id AS entity_id, created_at AS occurred_at
    FROM public.candidates WHERE user_id = p_user_id
  )
  UNION ALL
  (
    SELECT 'application_updated'::text,
      ('Application status → ' || a.status || ' for ' || c.full_name),
      a.id, a.updated_at
    FROM public.applications a
    JOIN public.candidates c ON c.id = a.candidate_id
    WHERE a.user_id = p_user_id AND a.status != 'new'
  )
  UNION ALL
  (
    SELECT 'interview_scheduled'::text,
      ('Interview scheduled: ' || COALESCE(c.full_name, 'Candidate') || ' at ' || TO_CHAR(i.scheduled_at, 'Mon DD, HH24:MI')),
      i.id, i.created_at
    FROM public.interviews i
    LEFT JOIN public.candidates c ON c.id = i.candidate_id
    WHERE i.user_id = p_user_id
  )
  ORDER BY occurred_at DESC
  LIMIT limit_n;
$$;

-- Revoke anon execution on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.get_analytics_summary(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_pipeline_funnel(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_candidates_over_time(uuid, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_match_score_distribution(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_top_skills(uuid, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_hiring_velocity(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_jobs_summary(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_recent_activity(uuid, integer) FROM anon, public;

-- Grant execution to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.get_analytics_summary(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pipeline_funnel(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_candidates_over_time(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_match_score_distribution(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_top_skills(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_hiring_velocity(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_jobs_summary(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_recent_activity(uuid, integer) TO authenticated, service_role;

-- ==============================================================================
-- 7. Transactional Atomic Workspace Reset RPC (SEC-3)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.reset_user_workspace(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

REVOKE EXECUTE ON FUNCTION public.reset_user_workspace(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.reset_user_workspace(UUID) TO authenticated, service_role;

-- Revoke execute on trigger functions from all client roles
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_user_updated() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated, public;

-- ==============================================================================
-- 8. Notify PostgREST to reload schema cache
-- ==============================================================================
NOTIFY pgrst, 'reload schema';
