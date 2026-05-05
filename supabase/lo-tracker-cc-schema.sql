-- ============================================================
-- LO Tracker — CC Support Migration
-- Run in Supabase SQL Editor after cc-batch-management-schema.sql
-- ============================================================

-- ── 1. Allow lo_reports to be written by service role for any user ───────────
-- lo_reports uses the service role key server-side so no RLS changes needed,
-- but ensure RLS is enabled (idempotent).
ALTER TABLE public.lo_reports ENABLE ROW LEVEL SECURITY;

-- Allow users to read/write their own lo_reports
DROP POLICY IF EXISTS "Users manage own lo_reports" ON public.lo_reports;
CREATE POLICY "Users manage own lo_reports"
  ON public.lo_reports
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 2. batch_curriculums — allow users to read global (admin) entries ────────
-- Admin uploads curriculum with user_id = NULL (global).
-- CC users need to read those rows to perform LO matching.
ALTER TABLE public.batch_curriculums ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own and global curriculum" ON public.batch_curriculums;
CREATE POLICY "Users read own and global curriculum"
  ON public.batch_curriculums FOR SELECT
  USING (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "Users manage own curriculum" ON public.batch_curriculums;
CREATE POLICY "Users manage own curriculum"
  ON public.batch_curriculums FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own curriculum" ON public.batch_curriculums;
CREATE POLICY "Users update own curriculum"
  ON public.batch_curriculums FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users delete own curriculum" ON public.batch_curriculums;
CREATE POLICY "Users delete own curriculum"
  ON public.batch_curriculums FOR DELETE
  USING (user_id = auth.uid());

-- ── 3. lectures — ensure admin-assigned CCs can write their synced rows ──────
-- The service role key is used server-side so this is belt-and-suspenders,
-- but set a user-level policy so client-side calls (if any) also work.
ALTER TABLE public.lectures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own lectures" ON public.lectures;
CREATE POLICY "Users manage own lectures"
  ON public.lectures
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 4. Ensure batch_curriculums.user_id is nullable ─────────────────────────
-- (already handled in cc-batch-management-schema.sql but repeated here for
--  idempotency in case this migration is applied in isolation)
ALTER TABLE public.batch_curriculums
  ALTER COLUMN user_id DROP NOT NULL;
