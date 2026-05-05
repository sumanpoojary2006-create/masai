-- ============================================================
-- Educators Master — Supabase Schema
-- Run in Supabase SQL Editor: Project → SQL Editor → New Query
-- ============================================================

CREATE TABLE IF NOT EXISTS public.educators (
  id                          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  email                       TEXT UNIQUE NOT NULL,
  name                        TEXT NOT NULL,
  phone                       TEXT,
  linkedin_url                TEXT,
  tier                        TEXT CHECK (tier IN ('Tier 1', 'Tier 2', 'Tier 3', 'Tier 4') OR tier IS NULL),
  instructor_type             TEXT CHECK (instructor_type IN ('Teaching Assistant', 'Industry Mentor', 'Academic Professor') OR instructor_type IS NULL),
  primary_domain              TEXT,
  secondary_domain            TEXT,
  company                     TEXT,
  yoe                         NUMERIC(4,1),
  languages                   TEXT,
  masai_history               BOOLEAN DEFAULT FALSE,
  mou_status                  TEXT,
  curriculum_approval_rating  TEXT,
  blacklisted                 BOOLEAN DEFAULT FALSE,
  remarks                     TEXT,
  -- General weekly availability: true = available, false = unavailable
  availability                JSONB NOT NULL DEFAULT '{"mon":true,"tue":true,"wed":true,"thu":true,"fri":true,"sat":true,"sun":true}'::jsonb,
  created_at                  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at                  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Updated-at trigger
CREATE OR REPLACE FUNCTION update_educators_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS educators_updated_at ON public.educators;
CREATE TRIGGER educators_updated_at
  BEFORE UPDATE ON public.educators
  FOR EACH ROW EXECUTE PROCEDURE update_educators_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_educators_email         ON public.educators(email);
CREATE INDEX IF NOT EXISTS idx_educators_tier          ON public.educators(tier);
CREATE INDEX IF NOT EXISTS idx_educators_instructor_type ON public.educators(instructor_type);
CREATE INDEX IF NOT EXISTS idx_educators_primary_domain ON public.educators(primary_domain);
CREATE INDEX IF NOT EXISTS idx_educators_mou_status    ON public.educators(mou_status);
CREATE INDEX IF NOT EXISTS idx_educators_blacklisted   ON public.educators(blacklisted);

-- Row Level Security
ALTER TABLE public.educators ENABLE ROW LEVEL SECURITY;

-- Admins (via user_roles) can do everything
CREATE POLICY "Admins can read educators"
  ON public.educators FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can insert educators"
  ON public.educators FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update educators"
  ON public.educators FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Service-role key (used server-side) bypasses RLS automatically.
-- The policies above apply only to anon/authenticated client requests.
