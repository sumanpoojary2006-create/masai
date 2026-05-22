-- CC Leave Coverage
-- Tracks which CC (covering_cc_id) is authorized to act on behalf of
-- another CC (on_leave_cc_id) for a specific date.
-- One coverage row per on-leave CC per day (unique constraint).

create table if not exists public.cc_leave_coverage (
  id              uuid primary key default gen_random_uuid(),
  on_leave_cc_id  uuid not null references auth.users(id) on delete cascade,
  covering_cc_id  uuid not null references auth.users(id) on delete cascade,
  coverage_date   date not null,
  assigned_by     uuid not null references auth.users(id),
  created_at      timestamptz not null default now(),
  constraint uq_leave_one_cover_per_day unique (on_leave_cc_id, coverage_date)
);

alter table public.cc_leave_coverage enable row level security;

-- Covering CC can read the rows where they are the designated cover
create policy "covering_cc_can_read_own_coverage" on public.cc_leave_coverage
  for select using (covering_cc_id = auth.uid());

-- Service role (admin APIs) bypasses RLS — no additional policy needed for writes
