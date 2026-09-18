-- ============================================================
-- RecruitAI — Production Users Table & Authentication Lifecycle
-- Migration: 01_users_schema.sql
-- ============================================================

-- 1. Create public.users table (synchronized with auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  full_name text,
  avatar_url text,
  phone text,
  company_name text,
  company_website text,
  role text NOT NULL DEFAULT 'recruiter'
    CHECK (role IN ('recruiter', 'employer')),
  preferences jsonb NOT NULL DEFAULT '{
    "email_alerts": true,
    "theme": "system",
    "blind_mode_default": false,
    "auto_rubric": true
  }'::jsonb,
  last_sign_in_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON public.users(created_at);

-- 3. Trigger for updated_at
CREATE OR REPLACE FUNCTION public.set_users_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_users_updated_at();

-- 4. Automatic User Creation Trigger from auth.users
-- When a new user signs up in Supabase Auth, automatically create their public profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (
    id,
    email,
    full_name,
    avatar_url,
    phone,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.phone,
    NEW.last_sign_in_at,
    COALESCE(NEW.created_at, now()),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(public.users.full_name, EXCLUDED.full_name),
    avatar_url = COALESCE(public.users.avatar_url, EXCLUDED.avatar_url),
    last_sign_in_at = EXCLUDED.last_sign_in_at,
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Attach trigger to auth.users (insert)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Automatic User Update Trigger from auth.users
-- Synchronizes email changes, last login, and metadata
CREATE OR REPLACE FUNCTION public.handle_user_updated()
RETURNS trigger AS $$
BEGIN
  UPDATE public.users SET
    email = COALESCE(NEW.email, public.users.email),
    full_name = COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      public.users.full_name
    ),
    avatar_url = COALESCE(NEW.raw_user_meta_data->>'avatar_url', public.users.avatar_url),
    phone = COALESCE(NEW.phone, public.users.phone),
    last_sign_in_at = NEW.last_sign_in_at,
    updated_at = now()
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Attach trigger to auth.users (update)
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_updated();

-- 6. Backfill existing users from auth.users into public.users
INSERT INTO public.users (
  id,
  email,
  full_name,
  avatar_url,
  phone,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  id,
  COALESCE(email, ''),
  COALESCE(
    raw_user_meta_data->>'full_name',
    raw_user_meta_data->>'name',
    split_part(email, '@', 1)
  ),
  raw_user_meta_data->>'avatar_url',
  phone,
  last_sign_in_at,
  COALESCE(created_at, now()),
  now()
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = COALESCE(public.users.full_name, EXCLUDED.full_name),
  avatar_url = COALESCE(public.users.avatar_url, EXCLUDED.avatar_url),
  last_sign_in_at = EXCLUDED.last_sign_in_at,
  updated_at = now();

-- 7. Row Level Security (RLS) on public.users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Recruiters can view their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT
  USING (auth.uid() = id);

-- Recruiters can update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Allow triggers and service_role to insert/manage profiles
DROP POLICY IF EXISTS "Service role full access on users" ON public.users;
CREATE POLICY "Service role full access on users" ON public.users
  FOR ALL
  USING (
    auth.jwt()->>'role' = 'service_role' OR
    auth.uid() = id
  )
  WITH CHECK (
    auth.jwt()->>'role' = 'service_role' OR
    auth.uid() = id
  );

-- 8. Add foreign key relationships from child tables to public.users (if not already existing)
-- This enables PostgREST relational joins like: supabase.from('jobs').select('*, user:users(*)')
DO $$
BEGIN
  -- jobs
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'jobs_user_id_public_users_fkey'
    ) THEN
      BEGIN
        ALTER TABLE public.jobs
          ADD CONSTRAINT jobs_user_id_public_users_fkey
          FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
      EXCEPTION WHEN OTHERS THEN
        NULL; -- Ignore if constraint or relation already configured
      END;
    END IF;
  END IF;

  -- candidates
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'candidates') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'candidates_user_id_public_users_fkey'
    ) THEN
      BEGIN
        ALTER TABLE public.candidates
          ADD CONSTRAINT candidates_user_id_public_users_fkey
          FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END IF;

  -- chat_sessions
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chat_sessions') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'chat_sessions_user_id_public_users_fkey'
    ) THEN
      BEGIN
        ALTER TABLE public.chat_sessions
          ADD CONSTRAINT chat_sessions_user_id_public_users_fkey
          FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END IF;
END $$;

-- 9. Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
