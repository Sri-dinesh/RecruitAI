-- ============================================================
-- RecruitAI — Fresh Clean Production Multi-Tenant Schema
-- Supabase (Postgres + pgvector + auth.users)
-- ============================================================

-- 1. Enable required extensions
create extension if not exists vector;
create extension if not exists pgcrypto;

-- 2. Drop all previous tables, triggers, and functions cleanly (Fresh Reset)
drop table if exists public.session_candidates cascade;
drop table if exists public.chat_messages cascade;
drop table if exists public.interviews cascade;
drop table if exists public.applications cascade;
drop table if exists public.resume_chunks cascade;
drop table if exists public.candidates cascade;
drop table if exists public.chat_sessions cascade;
drop table if exists public.jobs cascade;
drop table if exists public.users cascade;

-- Drop all overloaded versions of match_resume_chunks cleanly
drop function if exists public.match_resume_chunks(vector, double precision, integer, text, uuid) cascade;
drop function if exists public.match_resume_chunks(vector, double precision, integer, text) cascade;
drop function if exists public.match_resume_chunks(vector, double precision, integer, uuid, uuid) cascade;
drop function if exists public.match_resume_chunks(vector, double precision, integer) cascade;
drop function if exists public.match_resume_chunks(vector, float, int, text, uuid) cascade;
drop function if exists public.match_resume_chunks(vector, float, int, text) cascade;
drop function if exists public.match_resume_chunks(vector, float, int, uuid, uuid) cascade;
drop function if exists public.match_resume_chunks(vector, float, int) cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.handle_user_updated() cascade;

-- ============================================================
-- 3. USERS — synchronized recruiter profiles
-- ============================================================
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  avatar_url text,
  phone text,
  company_name text,
  company_website text,
  role text not null default 'recruiter'
    check (role in ('recruiter', 'employer')),
  preferences jsonb not null default '{
    "email_alerts": true,
    "theme": "system",
    "blind_mode_default": true,
    "auto_rubric": true
  }'::jsonb,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_users_email on public.users(email);
create index idx_users_role on public.users(role);
create index idx_users_created_at on public.users(created_at);

-- ============================================================
-- 4. JOBS — normalized job postings
-- ============================================================
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  raw_jd text,                     -- original raw/pasted job description text
  jd_structured jsonb,             -- parsed skills, requirements, experience, tone
  status text not null default 'active'
    check (status in ('draft', 'active', 'closed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_jobs_user_id on public.jobs(user_id);
create index idx_jobs_status on public.jobs(status);

-- ============================================================
-- 4. CANDIDATES — single source of truth for candidate records
-- ============================================================
create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  resume_file_url text,            -- Supabase Storage path / link
  raw_resume_text text,            -- full extracted resume text
  metadata jsonb default '{}'::jsonb, -- structured experience, skills, location, etc.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, email)          -- prevent duplicate uploads of same candidate per recruiter
);

create index idx_candidates_user_id on public.candidates(user_id);
create index idx_candidates_email on public.candidates(email);

-- ============================================================
-- 5. RESUME_CHUNKS — vector embeddings tied to candidates
-- ============================================================
create table public.resume_chunks (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  chunk_text text not null,
  chunk_index int not null default 0,   -- preserves sequence within a resume
  embedding vector(384),                -- 384-dimensions for sentence-transformers all-MiniLM-L6-v2
  created_at timestamptz not null default now()
);

create index idx_resume_chunks_candidate_id on public.resume_chunks(candidate_id);
create index idx_resume_chunks_user_id on public.resume_chunks(user_id);

-- Vector similarity index (IVFFlat)
create index idx_resume_chunks_embedding on public.resume_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ============================================================
-- 6. APPLICATIONS — links candidate <-> job, tracks evaluation/pipeline
-- ============================================================
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  match_score numeric(5,2),             -- match score 0 - 100
  match_reasoning jsonb,                -- matched skills, gap analysis, breakdown
  status text not null default 'new'
    check (status in ('new', 'shortlisted', 'interview_scheduled',
                       'interviewed', 'offered', 'rejected', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, candidate_id)
);

create index idx_applications_job_id on public.applications(job_id);
create index idx_applications_candidate_id on public.applications(candidate_id);
create index idx_applications_user_id on public.applications(user_id);
create index idx_applications_status on public.applications(status);

-- ============================================================
-- 7. INTERVIEWS — structured scheduled interviews
-- ============================================================
create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.applications(id) on delete cascade,
  candidate_id uuid references public.candidates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scheduled_at timestamptz,
  duration_minutes int default 30,
  mode text check (mode in ('phone', 'video', 'onsite')),
  meeting_link text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  feedback jsonb,                       -- notes / questions / agent summaries
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_interviews_application_id on public.interviews(application_id);
create index idx_interviews_candidate_id on public.interviews(candidate_id);
create index idx_interviews_user_id on public.interviews(user_id);
create index idx_interviews_scheduled_at on public.interviews(scheduled_at);

-- ============================================================
-- 8. CHAT_SESSIONS — sessions referencing active job context
-- ============================================================
create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  title text not null default 'New Hiring Campaign',
  last_intent text,
  pending_confirmation jsonb,           -- transient HITL state
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_chat_sessions_user_id on public.chat_sessions(user_id);
create index idx_chat_sessions_job_id on public.chat_sessions(job_id);

-- ============================================================
-- 9. CHAT_MESSAGES — normalized conversation messages
-- ============================================================
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb,                       -- router logs, tool calls, trace info
  created_at timestamptz not null default now()
);

create index idx_chat_messages_session_id on public.chat_messages(session_id);
create index idx_chat_messages_user_id on public.chat_messages(user_id);
create index idx_chat_messages_created_at on public.chat_messages(created_at);

-- ============================================================
-- 9b. SESSION_CANDIDATES — indexed relational join table (BUG-3)
-- ============================================================
create table public.session_candidates (
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, candidate_id)
);

create index idx_session_candidates_session_id on public.session_candidates(session_id);
create index idx_session_candidates_candidate_id on public.session_candidates(candidate_id);

-- ============================================================
-- 10. RPC: Vector similarity search joining candidate details
-- ============================================================
create or replace function public.match_resume_chunks (
  query_embedding vector(384),
  match_threshold float,
  match_count int,
  filter_candidate_id uuid default null,
  filter_user_id uuid default null
) returns table (
  id uuid,
  candidate_id uuid,
  full_name text,
  chunk_text text,
  similarity float
)
language sql stable
set search_path = public, pg_temp
as $$
  select
    rc.id,
    rc.candidate_id,
    c.full_name,
    rc.chunk_text,
    1 - (rc.embedding <=> query_embedding) as similarity
  from public.resume_chunks rc
  join public.candidates c on c.id = rc.candidate_id
  where 1 - (rc.embedding <=> query_embedding) > match_threshold
    and (filter_candidate_id is null or rc.candidate_id = filter_candidate_id)
    and (filter_user_id is null or rc.user_id = filter_user_id)
  order by rc.embedding <=> query_embedding
  limit match_count;
$$;

-- ============================================================
-- 11. Auto-update updated_at triggers
-- ============================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql set search_path = public, pg_temp;

create trigger trg_users_updated_at before update on public.users
  for each row execute function public.set_updated_at();

create trigger trg_jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

create trigger trg_candidates_updated_at before update on public.candidates
  for each row execute function public.set_updated_at();

create trigger trg_applications_updated_at before update on public.applications
  for each row execute function public.set_updated_at();

create trigger trg_interviews_updated_at before update on public.interviews
  for each row execute function public.set_updated_at();

create trigger trg_chat_sessions_updated_at before update on public.chat_sessions
  for each row execute function public.set_updated_at();

-- User auto-creation trigger on auth.users
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (
    id,
    email,
    full_name,
    avatar_url,
    phone,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url',
    new.phone,
    new.last_sign_in_at,
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(public.users.full_name, excluded.full_name),
    avatar_url = coalesce(public.users.avatar_url, excluded.avatar_url),
    last_sign_in_at = excluded.last_sign_in_at,
    updated_at = now();

  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- User auto-update trigger on auth.users
create or replace function public.handle_user_updated()
returns trigger as $$
begin
  update public.users set
    email = coalesce(new.email, public.users.email),
    full_name = coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      public.users.full_name
    ),
    avatar_url = coalesce(new.raw_user_meta_data->>'avatar_url', public.users.avatar_url),
    phone = coalesce(new.phone, public.users.phone),
    last_sign_in_at = new.last_sign_in_at,
    updated_at = now()
  where id = new.id;

  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function public.handle_user_updated();

-- Backfill existing auth.users into public.users
insert into public.users (
  id,
  email,
  full_name,
  avatar_url,
  phone,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  id,
  coalesce(email, ''),
  coalesce(
    raw_user_meta_data->>'full_name',
    raw_user_meta_data->>'name',
    split_part(email, '@', 1)
  ),
  raw_user_meta_data->>'avatar_url',
  phone,
  last_sign_in_at,
  coalesce(created_at, now()),
  now()
from auth.users
on conflict (id) do update set
  email = excluded.email,
  full_name = coalesce(public.users.full_name, excluded.full_name),
  avatar_url = coalesce(public.users.avatar_url, excluded.avatar_url),
  last_sign_in_at = excluded.last_sign_in_at,
  updated_at = now();

-- ============================================================
-- 12. Row Level Security (RLS) — strict user isolation
-- ============================================================
alter table public.users enable row level security;
alter table public.jobs enable row level security;
alter table public.candidates enable row level security;
alter table public.resume_chunks enable row level security;
alter table public.applications enable row level security;
alter table public.interviews enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.session_candidates enable row level security;

-- Tenant Isolation Policies hardened with (SELECT auth.uid()) for InitPlan optimization
create policy "users_tenant_isolation" on public.users
  for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "jobs_tenant_isolation" on public.jobs
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "candidates_tenant_isolation" on public.candidates
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "resume_chunks_tenant_isolation" on public.resume_chunks
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "applications_tenant_isolation" on public.applications
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "interviews_tenant_isolation" on public.interviews
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "chat_sessions_tenant_isolation" on public.chat_sessions
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "chat_messages_tenant_isolation" on public.chat_messages
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "session_candidates_tenant_isolation" on public.session_candidates
  for all to authenticated
  using (
    exists (
      select 1 from public.chat_sessions s
      where s.id = session_candidates.session_id
      and (s.user_id = (select auth.uid()))
    )
  )
  with check (
    exists (
      select 1 from public.chat_sessions s
      where s.id = session_candidates.session_id
      and (s.user_id = (select auth.uid()))
    )
  );

-- ============================================================
-- 13. ANALYTICS — Read-only RPC functions for the Dashboard
-- ============================================================

-- (a) KPI summary: totals across all tables for a user
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

-- (b) Pipeline funnel: per-stage counts
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

-- (c) Candidates ingested per day over the last N days
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

-- (d) Match score distribution in quality buckets
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

-- (e) Top demanded skills across all parsed JDs
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

-- (f) Hiring velocity — avg time (days) between candidate creation and key milestones
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

-- (g) Per-job summary statistics for the jobs table view
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

-- (h) Recent activity feed (last 20 events across candidates, applications, interviews)
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

-- ============================================================
-- 14. Transactional Atomic Workspace Reset RPC (SEC-3)
-- ============================================================
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

-- Notify schema reload
NOTIFY pgrst, 'reload schema';
