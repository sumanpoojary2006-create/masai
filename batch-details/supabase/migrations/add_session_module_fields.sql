-- Migration: add module_number, module_name, week_number, session_number to sessions
-- Run this in Supabase SQL Editor if you already ran the initial schema.sql

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS module_number  INTEGER,
  ADD COLUMN IF NOT EXISTS module_name    TEXT,
  ADD COLUMN IF NOT EXISTS week_number    INTEGER,
  ADD COLUMN IF NOT EXISTS session_number NUMERIC(5,1);
