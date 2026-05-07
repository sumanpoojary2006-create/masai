-- Fix: add user_id to lectures_unique_schedule constraint
-- Run this in Supabase SQL Editor if you see:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- when syncing lectures from the LO Tracker.

alter table public.lectures
drop constraint if exists lectures_unique_schedule;

alter table public.lectures
add constraint lectures_unique_schedule unique (
  user_id,
  batch_name,
  module_name,
  lecture_name,
  lecture_date,
  start_time
);
