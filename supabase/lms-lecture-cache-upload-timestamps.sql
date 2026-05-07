-- ============================================================
-- Add upload timestamps to lms_lecture_cache
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE public.lms_lecture_cache
  ADD COLUMN IF NOT EXISTS preread_uploaded_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes_uploaded_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assignment_uploaded_at TIMESTAMPTZ;
