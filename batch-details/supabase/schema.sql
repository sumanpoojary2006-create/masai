-- ============================================================
-- Batch Wise — Supabase Schema
-- Run this in Supabase SQL Editor (Project → SQL Editor → New Query)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE public.batches (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  batch_name          TEXT,
  program_name        TEXT,
  institute_name      TEXT,
  model_number        INTEGER,
  start_date          DATE,
  end_date_scheduled  DATE,
  actual_end_date     DATE,
  status              TEXT CHECK (status IN ('about-to-start', 'in-order', 'completed/last-leg') OR status IS NULL),
  domain              TEXT,
  language            TEXT,
  website_link        TEXT,
  team_members        JSONB DEFAULT '{}'::jsonb,
  grading_policy      JSONB DEFAULT '[]'::jsonb,
  created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE public.sessions (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  batch_id            UUID REFERENCES public.batches(id) ON DELETE CASCADE,
  date                DATE,
  day                 TEXT CHECK (day IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') OR day IS NULL),
  start_time          TIME,
  end_time            TIME,
  module_number       INTEGER,
  module_name         TEXT,
  week_number         INTEGER,
  session_number      NUMERIC(5,1),
  session_title       TEXT,
  learning_objectives TEXT,
  to_be_taken_by      TEXT CHECK (to_be_taken_by IN ('professor','industry-mentor','teaching-assistant','program-coordinator','curriculum-coordinator','guest-lecturer') OR to_be_taken_by IS NULL),
  instructor_name     TEXT,
  rating              NUMERIC(4,2),
  zoom_link           TEXT,
  is_end_of_schedule  BOOLEAN,
  created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE public.user_roles (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')) DEFAULT 'viewer',
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id)
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_sessions_batch_id ON public.sessions(batch_id);
CREATE INDEX idx_sessions_date ON public.sessions(date);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);

-- ============================================================
-- Updated-at trigger
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

CREATE TRIGGER update_batches_updated_at
  BEFORE UPDATE ON public.batches
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.batches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles  ENABLE ROW LEVEL SECURITY;

-- Helper: check caller's role
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- batches: all authenticated users can read
CREATE POLICY "batches_select" ON public.batches
  FOR SELECT USING (auth.role() = 'authenticated');

-- batches: admins and editors can insert
CREATE POLICY "batches_insert" ON public.batches
  FOR INSERT WITH CHECK (get_my_role() IN ('admin', 'editor'));

-- batches: admins and editors can update
CREATE POLICY "batches_update" ON public.batches
  FOR UPDATE USING (get_my_role() IN ('admin', 'editor'));

-- batches: only admins can delete
CREATE POLICY "batches_delete" ON public.batches
  FOR DELETE USING (get_my_role() = 'admin');

-- sessions: all authenticated users can read
CREATE POLICY "sessions_select" ON public.sessions
  FOR SELECT USING (auth.role() = 'authenticated');

-- sessions: admins and editors can insert
CREATE POLICY "sessions_insert" ON public.sessions
  FOR INSERT WITH CHECK (get_my_role() IN ('admin', 'editor'));

-- sessions: admins and editors can update
CREATE POLICY "sessions_update" ON public.sessions
  FOR UPDATE USING (get_my_role() IN ('admin', 'editor'));

-- sessions: only admins can delete
CREATE POLICY "sessions_delete" ON public.sessions
  FOR DELETE USING (get_my_role() = 'admin');

-- user_roles: users can see their own role
CREATE POLICY "user_roles_self_select" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- user_roles: admins can see and manage all roles
CREATE POLICY "user_roles_admin_all" ON public.user_roles
  FOR ALL USING (get_my_role() = 'admin');

-- ============================================================
-- Auto-create viewer role on first sign-up
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'viewer')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- ============================================================
-- IMPORTANT: Set your first admin user manually after sign-up
-- Replace <your-user-uuid> with the UUID from auth.users table:
--
--   UPDATE public.user_roles
--   SET role = 'admin'
--   WHERE user_id = '<your-user-uuid>';
--
-- ============================================================
