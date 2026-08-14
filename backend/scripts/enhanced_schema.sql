-- ============================================================
-- RecruitAI — Fresh Clean Production Multi-Tenant Schema
-- Supabase (Postgres + pgvector + auth.users)
-- ============================================================

-- 1. Enable required extensions
create extension if not exists vector;
create extension if not exists pgcrypto;

-- 2. Drop all previous tables, triggers, and functions cleanly (Fresh Reset)
drop table if exists public.chat_messages cascade;
drop table if exists public.interviews cascade;
drop table if exists public.applications cascade;
drop table if exists public.resume_chunks cascade;
drop table if exists public.candidates cascade;
drop table if exists public.chat_sessions cascade;
drop table if exists public.jobs cascade;

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

-- ============================================================
-- 3. JOBS — normalized job postings
-- ============================================================
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
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
  scheduled_at timestamptz not null,
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
create index idx_chat_messages_created_at on public.chat_messages(created_at);

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
$$ language plpgsql;

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

-- ============================================================
-- 12. Row Level Security (RLS) — strict user isolation
-- ============================================================
alter table public.jobs enable row level security;
alter table public.candidates enable row level security;
alter table public.resume_chunks enable row level security;
alter table public.applications enable row level security;
alter table public.interviews enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

create policy "Users manage their own jobs" on public.jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own candidates" on public.candidates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own resume_chunks" on public.resume_chunks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own applications" on public.applications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own interviews" on public.interviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own chat_sessions" on public.chat_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own chat_messages" on public.chat_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Notify schema reload
NOTIFY pgrst, 'reload schema';
