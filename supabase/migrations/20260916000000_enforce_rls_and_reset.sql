-- ==============================================================================
-- RecruitAI Migration: 20260916000000_enforce_rls_and_reset.sql
-- Description: Enforce strict Row-Level Security (RLS) across all multi-tenant tables
--              and provide atomic transactional reset RPC (SEC-3, SEC-4).
-- ==============================================================================

-- 1. Enable Row-Level Security (RLS) on all application tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies if any to avoid duplication
DROP POLICY IF EXISTS "Users manage their own profile" ON public.users;
DROP POLICY IF EXISTS "Users manage their own jobs" ON public.jobs;
DROP POLICY IF EXISTS "Users manage their own candidates" ON public.candidates;
DROP POLICY IF EXISTS "Users manage their own resume_chunks" ON public.resume_chunks;
DROP POLICY IF EXISTS "Users manage their own applications" ON public.applications;
DROP POLICY IF EXISTS "Users manage their own interviews" ON public.interviews;
DROP POLICY IF EXISTS "Users manage their own chat_sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users manage their own chat_messages" ON public.chat_messages;

-- 3. Comprehensive CRUD RLS Policies: users
CREATE POLICY "users_tenant_isolation" ON public.users
  FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 4. Comprehensive CRUD RLS Policies: jobs
CREATE POLICY "jobs_tenant_isolation" ON public.jobs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. Comprehensive CRUD RLS Policies: candidates
CREATE POLICY "candidates_tenant_isolation" ON public.candidates
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 6. Comprehensive CRUD RLS Policies: resume_chunks
CREATE POLICY "resume_chunks_tenant_isolation" ON public.resume_chunks
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7. Comprehensive CRUD RLS Policies: applications
CREATE POLICY "applications_tenant_isolation" ON public.applications
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 8. Comprehensive CRUD RLS Policies: interviews
CREATE POLICY "interviews_tenant_isolation" ON public.interviews
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 9. Comprehensive CRUD RLS Policies: chat_sessions
CREATE POLICY "chat_sessions_tenant_isolation" ON public.chat_sessions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 10. Comprehensive CRUD RLS Policies: chat_messages
CREATE POLICY "chat_messages_tenant_isolation" ON public.chat_messages
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 11. Transactional Atomic Workspace Reset RPC (SEC-3)
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
