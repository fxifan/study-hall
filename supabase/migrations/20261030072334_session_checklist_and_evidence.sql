-- Session checklist and work evidence (owner brief, 30 Oct 2026).
--   * goals become a short study plan: subject, the task, what the student expects to show for it,
--     an optional time estimate, and at the end a result (e.g. "12/15 correct"). goals.note stays
--     the student's short reflection.
--   * goal_evidence: optional photos or PDFs of the work, in the private "work-evidence" bucket.
--     Nobody reads the bucket directly: the app checks access through this table's RLS, then hands
--     out a short-lived signed link. Uploaded work is the student's own; Study Hall doesn't mark it.
--   * session_checkins: the supervisor's short check-in notes, from a report template (both
--     languages copied in) or typed. Append-only, like the other session logs.

alter table public.goals
  add column subject varchar(60),
  add column expected_output varchar(140),
  add column est_minutes smallint check (est_minutes between 5 and 240),
  add column result varchar(60);

create table public.goal_evidence (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  storage_path text not null unique,
  file_name varchar(120) not null check (char_length(btrim(file_name)) > 0),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now()
);
create index goal_evidence_goal_idx on public.goal_evidence (goal_id);
create index goal_evidence_student_idx on public.goal_evidence (student_id);

-- At most three files per task.
create function private.limit_goal_evidence() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.goal_evidence e where e.goal_id = new.goal_id) >= 3 then
    raise exception 'goal_evidence: at most three files per goal' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger limit_goal_evidence before insert on public.goal_evidence
  for each row execute function private.limit_goal_evidence();

alter table public.goal_evidence enable row level security;
grant select, insert, delete on public.goal_evidence to authenticated;
grant all on public.goal_evidence to service_role;

create policy "students add evidence to their own goals" on public.goal_evidence
  for insert to authenticated with check (
    private.is_self_student(student_id)
    and exists (select 1 from public.goals g where g.id = goal_id and g.student_id = goal_evidence.student_id)
  );
create policy "students read and remove their own evidence" on public.goal_evidence
  for select to authenticated using (private.is_self_student(student_id));
create policy "students remove their own evidence" on public.goal_evidence
  for delete to authenticated using (private.is_self_student(student_id));
create policy "parents read their students' evidence" on public.goal_evidence
  for select to authenticated using (private.is_parent_of(student_id));
create policy "session staff read evidence" on public.goal_evidence
  for select to authenticated using (
    exists (select 1 from public.goals g where g.id = goal_id and private.is_session_proctor(g.session_id))
  );
create policy "admins read org evidence" on public.goal_evidence
  for select to authenticated using (private.is_org_admin(private.student_org(student_id)));

-- Private bucket; no storage.objects policies for signed-in users, so only the server (service role)
-- can read or write, after checking goal_evidence.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('work-evidence', 'work-evidence', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create table public.session_checkins (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  template_id uuid references public.report_templates (id) on delete set null,
  template_en varchar(200),
  template_zh varchar(200),
  note varchar(200),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (template_en is not null or char_length(btrim(coalesce(note, ''))) > 0),
  check ((template_en is null) = (template_zh is null))
);
create index session_checkins_session_student_idx on public.session_checkins (session_id, student_id);

alter table public.session_checkins enable row level security;
grant select, insert on public.session_checkins to authenticated;
grant all on public.session_checkins to service_role;

create policy "session staff add check-ins" on public.session_checkins
  for insert to authenticated with check (
    private.is_session_proctor(session_id) and private.is_enrolment(session_id, student_id)
    and created_by = (select auth.uid())
  );
create policy "session staff read check-ins" on public.session_checkins
  for select to authenticated using (private.is_session_proctor(session_id));
create policy "parents read their students' check-ins" on public.session_checkins
  for select to authenticated using (private.is_parent_of(student_id));
create policy "admins read org check-ins" on public.session_checkins
  for select to authenticated using (private.is_org_admin(private.student_org(student_id)));
