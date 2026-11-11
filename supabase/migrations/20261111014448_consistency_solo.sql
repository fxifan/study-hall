-- Rewarding consistency, and solo mode (docs/consistency-and-solo.md, owner-approved 11 Nov 2026).
-- A study day counts when a student reaches their own daily goal in verified minutes, or finishes
-- one thing. Study days earn points (+5, and +15 for a 5-day week) inside the existing ranks.

-- Personal daily goal, in verified minutes.
alter table public.student_settings
  add column daily_goal_minutes smallint not null default 25 check (daily_goal_minutes between 10 and 180);

-- Consistency points. They're deduplicated per Melbourne day (study_day) or week (full_week) with
-- a deterministic lineage_id, and don't count towards the daily practice cap.
alter table public.points_ledger drop constraint points_ledger_kind_check;
alter table public.points_ledger
  add constraint points_ledger_kind_check check (kind in ('completion', 'score70', 'score90', 'marks', 'study_day', 'full_week'));

-- Solo mode: one task per solo session, a check-in at the end, and a line for tomorrow.
create table public.solo_tasks (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid references public.study_sessions (id) on delete set null,
  source text not null default 'own' check (source in ('own', 'tutor', 'practice', 'tomorrow')),
  body text not null check (char_length(btrim(body)) between 1 and 200),
  status text not null default 'open' check (status in ('open', 'done', 'partly', 'stuck')),
  tomorrow text check (char_length(tomorrow) <= 200),
  -- The Melbourne day the task was finished (for study days).
  day date,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index solo_tasks_profile_idx on public.solo_tasks (profile_id, created_at desc);
-- One open solo task at a time.
create unique index solo_tasks_one_open_idx on public.solo_tasks (profile_id) where status = 'open';

revoke all on public.solo_tasks from anon;
grant select on public.solo_tasks to authenticated;
grant all on public.solo_tasks to service_role;
alter table public.solo_tasks enable row level security;
create policy "students read own solo tasks" on public.solo_tasks
  for select to authenticated using (profile_id = (select auth.uid()));
