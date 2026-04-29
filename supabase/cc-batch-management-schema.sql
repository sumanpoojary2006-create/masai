-- ============================================================
-- CC–Batch Management Schema
-- Run in Supabase SQL Editor after the base schema.sql
-- ============================================================

-- ── 1. lms_batch_cache ──────────────────────────────────────
-- Batches synced from LMS MySQL. Admin syncs this periodically.
CREATE TABLE IF NOT EXISTS public.lms_batch_cache (
  batch_id   INT PRIMARY KEY,
  name       TEXT NOT NULL,
  program    TEXT,
  starting   DATE,
  ending     DATE,
  active     BOOLEAN DEFAULT TRUE,
  synced_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. cc_batch_assignments ─────────────────────────────────
-- Admin-managed: one CC per batch.
CREATE TABLE IF NOT EXISTS public.cc_batch_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cc_user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id      INT  NOT NULL UNIQUE,
  batch_name    TEXT NOT NULL,
  batch_program TEXT,
  assigned_by   UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cc_batch_assignments_cc_user_idx ON public.cc_batch_assignments (cc_user_id);

-- ── 3. lms_lecture_cache ────────────────────────────────────
-- Per-batch lecture compliance, populated by sync from LMS MySQL.
CREATE TABLE IF NOT EXISTS public.lms_lecture_cache (
  id                  BIGSERIAL PRIMARY KEY,
  batch_id            INT  NOT NULL,
  lecture_id          INT  NOT NULL,
  section_id          INT,
  title               TEXT NOT NULL,
  category            TEXT,
  module              TEXT,
  schedule            TIMESTAMPTZ,
  concludes           TIMESTAMPTZ,
  preread_uploaded    BOOLEAN DEFAULT FALSE,
  notes_uploaded      BOOLEAN DEFAULT FALSE,
  assignment_uploaded BOOLEAN DEFAULT FALSE,
  synced_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (batch_id, lecture_id)
);

CREATE INDEX IF NOT EXISTS lms_lecture_cache_batch_idx ON public.lms_lecture_cache (batch_id);

-- ── 4. batch_curriculums: allow admin-global entries ────────
-- Make user_id nullable so Admin can upload curriculum without
-- tying it to a specific user. A NULL user_id means global/admin.
ALTER TABLE public.batch_curriculums
  ALTER COLUMN user_id DROP NOT NULL;

-- Drop old unique constraint (it required user_id)
ALTER TABLE public.batch_curriculums
  DROP CONSTRAINT IF EXISTS batch_curriculums_unique_lecture;

-- New constraint: per-user-per-batch unique, OR global per-batch
-- We achieve this with a partial unique index:
CREATE UNIQUE INDEX IF NOT EXISTS batch_curriculums_user_unique
  ON public.batch_curriculums (user_id, batch_name, lecture_name)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS batch_curriculums_global_unique
  ON public.batch_curriculums (batch_name, lecture_name)
  WHERE user_id IS NULL;

-- ── 5. Row-Level Security ───────────────────────────────────

ALTER TABLE public.lms_batch_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_batch_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_lecture_cache ENABLE ROW LEVEL SECURITY;

-- lms_batch_cache: readable by all authenticated users (CC needs to see batch names)
DROP POLICY IF EXISTS "Authenticated users can read batch cache" ON public.lms_batch_cache;
CREATE POLICY "Authenticated users can read batch cache"
  ON public.lms_batch_cache FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- cc_batch_assignments: CC sees only their own rows
DROP POLICY IF EXISTS "CC sees own assignments" ON public.cc_batch_assignments;
CREATE POLICY "CC sees own assignments"
  ON public.cc_batch_assignments FOR SELECT
  USING (cc_user_id = auth.uid());

-- lms_lecture_cache: CC sees only batches assigned to them
DROP POLICY IF EXISTS "CC sees own batch lectures" ON public.lms_lecture_cache;
CREATE POLICY "CC sees own batch lectures"
  ON public.lms_lecture_cache FOR SELECT
  USING (
    batch_id IN (
      SELECT batch_id FROM public.cc_batch_assignments
      WHERE cc_user_id = auth.uid()
    )
  );

-- ── 6. updated_at trigger for cc_batch_assignments ──────────
DROP TRIGGER IF EXISTS cc_batch_assignments_set_updated_at ON public.cc_batch_assignments;
CREATE TRIGGER cc_batch_assignments_set_updated_at
  BEFORE UPDATE ON public.cc_batch_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
