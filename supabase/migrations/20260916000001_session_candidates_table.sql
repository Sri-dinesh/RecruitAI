-- ==============================================================================
-- RecruitAI Migration: 20260916000001_session_candidates_table.sql
-- Description: Relational join table for candidate-session association (BUG-3).
--              Replaces O(N^2) JSON scanning with indexed relational lookups.
-- ==============================================================================

-- 1. Create session_candidates relational table
CREATE TABLE IF NOT EXISTS public.session_candidates (
    session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (session_id, candidate_id)
);

-- 2. Indexes for fast bidirectional join queries
CREATE INDEX IF NOT EXISTS idx_session_candidates_session_id ON public.session_candidates(session_id);
CREATE INDEX IF NOT EXISTS idx_session_candidates_candidate_id ON public.session_candidates(candidate_id);

-- 3. Row-Level Security
ALTER TABLE public.session_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "session_candidates_tenant_isolation" ON public.session_candidates;

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

-- 4. Expand/Contract Migration: Backfill existing relationships from metadata
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
        -- Ignore invalid UUID strings in legacy synthetic mock data
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
END;
$$;
