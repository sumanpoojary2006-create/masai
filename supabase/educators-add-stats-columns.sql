-- Migration: add rating cache + current blocked days columns to educators
-- Run in Supabase SQL Editor after educators-schema.sql

ALTER TABLE public.educators
  ADD COLUMN IF NOT EXISTS total_sessions          INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overall_avg_rating      NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS last5_avg_rating        NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS sessions_rated_4_5_plus INTEGER DEFAULT 0,
  -- Days of the week currently blocked by batch assignments
  -- e.g. {"mon":false,"tue":false,"wed":false,"thu":true,"fri":false,"sat":true,"sun":false}
  ADD COLUMN IF NOT EXISTS current_blocked_days    JSONB NOT NULL DEFAULT '{"mon":false,"tue":false,"wed":false,"thu":false,"fri":false,"sat":false,"sun":false}'::jsonb;
