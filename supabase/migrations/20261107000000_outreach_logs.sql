-- Supabase migration: Outreach email logs and delivery audit table
-- Creates public.outreach_logs to track recruiter communications with candidates

CREATE TABLE IF NOT EXISTS public.outreach_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    candidate_id UUID REFERENCES public.candidates(id) ON DELETE SET NULL,
    recipient_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    template_id TEXT,
    status TEXT NOT NULL DEFAULT 'sent', -- 'sent', 'simulated', 'failed'
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_outreach_logs_user_id ON public.outreach_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_outreach_logs_candidate_id ON public.outreach_logs(candidate_id);
CREATE INDEX IF NOT EXISTS idx_outreach_logs_created_at ON public.outreach_logs(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.outreach_logs ENABLE ROW LEVEL SECURITY;

-- Recruiters can read their own outreach logs
CREATE POLICY "Recruiters can select own outreach logs"
    ON public.outreach_logs
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Recruiters can insert their own outreach logs
CREATE POLICY "Recruiters can insert own outreach logs"
    ON public.outreach_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);
