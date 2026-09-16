-- ==============================================================================
-- RecruitAI Migration: 20260916000002_interview_nullable_slot.sql
-- Description: Allow NULL scheduled_at when interview slot is unknown or unextracted (BUG-4).
--              Prevents persistence of fabricated timestamps.
-- ==============================================================================

ALTER TABLE public.interviews ALTER COLUMN scheduled_at DROP NOT NULL;
ALTER TABLE public.interviews ALTER COLUMN duration_minutes SET DEFAULT 30;
