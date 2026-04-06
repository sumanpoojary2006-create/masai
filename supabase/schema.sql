create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.lectures (
  id uuid primary key default gen_random_uuid(),
  batch_name text not null,
  module_name text not null,
  lecture_name text not null,
  lecture_date date not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lectures_unique_schedule unique (
    batch_name,
    module_name,
    lecture_name,
    lecture_date,
    start_time
  )
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  type text not null check (type in ('preread', 'notes', 'assignment')),
  deadline timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'missed')),
  completed_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_unique_type_per_lecture unique (lecture_id, type)
);

create table if not exists public.lms_tracking (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  resource_type text not null check (resource_type in ('preread', 'notes', 'assignment')),
  found boolean not null default false,
  uploaded_at timestamptz,
  checked_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint lms_tracking_unique_resource unique (lecture_id, resource_type)
);

create table if not exists public.alert_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  alert_type text not null check (alert_type in ('reminder_6h', 'reminder_2h', 'missed', 'completed')),
  sent_at timestamptz not null default now(),
  constraint alert_events_once unique (task_id, alert_type)
);

drop trigger if exists lectures_set_updated_at on public.lectures;
create trigger lectures_set_updated_at
before update on public.lectures
for each row
execute function public.set_updated_at();

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row
execute function public.set_updated_at();

create index if not exists lectures_batch_idx on public.lectures(batch_name);
create index if not exists lectures_date_idx on public.lectures(lecture_date desc);
create index if not exists tasks_status_idx on public.tasks(status);
create index if not exists tasks_deadline_idx on public.tasks(deadline);
create index if not exists lms_tracking_lecture_idx on public.lms_tracking(lecture_id);
