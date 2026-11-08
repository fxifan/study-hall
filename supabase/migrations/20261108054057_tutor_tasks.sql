-- Next steps between lessons (docs/tutor-next-steps.md): the tutor sets one clear task at the end of
-- a lesson and, before the next one, sees where the student got to. Version 1 is tutor-only: the
-- tutor marks progress themselves; nothing reaches the student yet. The latest row per student is
-- the current next step; older rows are history.
-- Same ownership rules as the other tutor_* tables: tutor_id on every row, a composite (id,
-- tutor_id) foreign key to the student, and RLS limiting each tutor to their own rows.

create table public.tutor_tasks (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutors (id) on delete cascade,
  student_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 300),
  due_on date,
  status text not null default 'not_started' check (status in ('not_started', 'started', 'done', 'stuck')),
  -- Where the student got stuck, or anything else to start the next lesson with.
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tutor_id),
  foreign key (student_id, tutor_id) references public.tutor_students (id, tutor_id) on delete cascade
);
create index tutor_tasks_student_idx on public.tutor_tasks (tutor_id, student_id, created_at desc);

create trigger set_updated_at before update on public.tutor_tasks for each row execute function private.set_updated_at();

revoke all on public.tutor_tasks from anon;
grant select, insert, update, delete on public.tutor_tasks to authenticated;
grant all on public.tutor_tasks to service_role;
alter table public.tutor_tasks enable row level security;

create policy "tutors manage own tasks" on public.tutor_tasks
  for all to authenticated using (tutor_id = (select auth.uid())) with check (tutor_id = (select auth.uid()));
