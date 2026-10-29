-- Tutoring plan and study profiles (owner request, 2026-10-30):
--   * plans.includes_tutoring: the tutoring plan (A$79/week per student) adds a dedicated tutor in the
--     same room; tutoring students' help requests are prioritised.
--   * sessions.tutor_id (and rooms.default_tutor_id): the tutor, under the same WWCC gate as proctors.
--     Tutors get the same session access as the supervising proctor.
--   * Study profiles: subjects (reference list), student_subjects (taking + wants help), and a short
--     students.study_note, entered by parents; read by the session's staff and admins.
--   * public.session_roster(): the roster with study profiles and tutoring flag, for staff.

-- ---------------------------------------------------------------------------
-- Plans
-- ---------------------------------------------------------------------------

alter table public.plans add column includes_tutoring boolean not null default false;
grant select (includes_tutoring) on public.plans to anon;

-- ---------------------------------------------------------------------------
-- Tutors on sessions
-- ---------------------------------------------------------------------------

alter table public.rooms add column default_tutor_id uuid references public.profiles (id) on delete set null;
alter table public.sessions add column tutor_id uuid references public.profiles (id) on delete set null;
create index sessions_tutor_idx on public.sessions (tutor_id, starts_at);

-- One WWCC check for both roles.
create function private.assert_cleared(person uuid, session_day date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if person is null then
    return;
  end if;
  if not exists (select 1 from public.profiles p where p.id = person and p.role in ('proctor', 'admin')) then
    raise exception 'sessions: assigned supervisor or tutor must be a proctor or admin' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.proctor_checks c
    where c.proctor_id = person and c.verified_at is not null and c.wwcc_expiry >= session_day
  ) then
    raise exception 'sessions: supervisor or tutor has no verified Working with Children Check valid on %', session_day
      using errcode = '23514';
  end if;
end;
$$;

create or replace function private.enforce_wwcc() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  session_day date := (new.starts_at at time zone 'Australia/Melbourne')::date;
begin
  perform private.assert_cleared(new.proctor_id, session_day);
  perform private.assert_cleared(new.tutor_id, session_day);
  return new;
end;
$$;

drop trigger enforce_wwcc on public.sessions;
create trigger enforce_wwcc before insert or update of proctor_id, tutor_id, starts_at on public.sessions
  for each row execute function private.enforce_wwcc();

-- Session staff = the supervising proctor or the tutor.
create or replace function private.is_session_proctor(target_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sessions s
    where s.id = target_session and (select auth.uid()) in (s.proctor_id, s.tutor_id)
  )
$$;

create or replace function private.is_rostered_for_me(target_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.enrolments e
    join public.sessions s on s.id = e.session_id
    where e.student_id = target_student and (select auth.uid()) in (s.proctor_id, s.tutor_id)
  )
$$;

create or replace function private.can_see_room(target_room uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rooms r
    where r.id = target_room and (select auth.uid()) in (r.default_proctor_id, r.default_tutor_id)
  ) or exists (
    select 1 from public.sessions s
    where s.room_id = target_room
      and ((select auth.uid()) in (s.proctor_id, s.tutor_id) or private.is_enrolled(s.id))
  )
$$;

drop policy "proctors read assigned sessions" on public.sessions;
create policy "staff read assigned sessions" on public.sessions
  for select to authenticated using ((select auth.uid()) in (proctor_id, tutor_id));

-- ---------------------------------------------------------------------------
-- Tutoring entitlement and help-request priority
-- ---------------------------------------------------------------------------

create function private.has_tutoring(target_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.parent_students ps
    join public.subscriptions s on s.parent_id = ps.parent_id
    join public.plans p on p.id = s.plan_id
    where ps.student_id = target_student
      and s.status in ('active', 'trialing', 'past_due')
      and p.includes_tutoring
  )
$$;

alter table public.help_requests add column priority boolean not null default false;
create index help_requests_queue_idx on public.help_requests (session_id, status, priority desc, created_at);

-- Set by the database, so a student can't mark their own request urgent.
create function private.set_help_priority() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.priority := private.has_tutoring(new.student_id);
  return new;
end;
$$;

create trigger set_help_priority before insert on public.help_requests
  for each row execute function private.set_help_priority();

-- For the signed-in student: is their family on a tutoring plan?
create function public.my_tutoring_plan() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select private.has_tutoring(s.id) from public.students s where s.profile_id = (select auth.uid())), false)
$$;

-- ---------------------------------------------------------------------------
-- Study profiles
-- ---------------------------------------------------------------------------

-- Curriculum reference list. stage: 'junior' (Years 7–10) or 'vce' (Years 10–12).
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  stage text not null check (stage in ('junior', 'vce')),
  sort smallint not null default 0,
  active boolean not null default true
);

insert into public.subjects (code, name, stage, sort) values
  ('jr-english', 'English', 'junior', 1),
  ('jr-maths', 'Mathematics', 'junior', 2),
  ('jr-science', 'Science', 'junior', 3),
  ('jr-history', 'History', 'junior', 4),
  ('jr-geography', 'Geography', 'junior', 5),
  ('jr-economics', 'Economics and Business', 'junior', 6),
  ('jr-civics', 'Civics and Citizenship', 'junior', 7),
  ('jr-digital', 'Digital Technologies', 'junior', 8),
  ('jr-design', 'Design and Technologies', 'junior', 9),
  ('jr-arts', 'The Arts', 'junior', 10),
  ('jr-hpe', 'Health and Physical Education', 'junior', 11),
  ('jr-chinese', 'Chinese', 'junior', 12),
  ('jr-french', 'French', 'junior', 13),
  ('jr-japanese', 'Japanese', 'junior', 14),
  ('jr-language-other', 'Another language', 'junior', 15),
  ('vce-english', 'English', 'vce', 1),
  ('vce-eal', 'English as an Additional Language', 'vce', 2),
  ('vce-english-language', 'English Language', 'vce', 3),
  ('vce-literature', 'Literature', 'vce', 4),
  ('vce-foundation-maths', 'Foundation Mathematics', 'vce', 5),
  ('vce-general-maths', 'General Mathematics', 'vce', 6),
  ('vce-methods', 'Mathematical Methods', 'vce', 7),
  ('vce-specialist', 'Specialist Mathematics', 'vce', 8),
  ('vce-biology', 'Biology', 'vce', 9),
  ('vce-chemistry', 'Chemistry', 'vce', 10),
  ('vce-physics', 'Physics', 'vce', 11),
  ('vce-psychology', 'Psychology', 'vce', 12),
  ('vce-environmental', 'Environmental Science', 'vce', 13),
  ('vce-accounting', 'Accounting', 'vce', 14),
  ('vce-business', 'Business Management', 'vce', 15),
  ('vce-economics', 'Economics', 'vce', 16),
  ('vce-legal', 'Legal Studies', 'vce', 17),
  ('vce-politics', 'Australian and Global Politics', 'vce', 18),
  ('vce-history', 'History', 'vce', 19),
  ('vce-geography', 'Geography', 'vce', 20),
  ('vce-hhd', 'Health and Human Development', 'vce', 21),
  ('vce-pe', 'Physical Education', 'vce', 22),
  ('vce-chinese-fl', 'Chinese First Language', 'vce', 23),
  ('vce-chinese-sl', 'Chinese Second Language', 'vce', 24),
  ('vce-chinese-lcs', 'Chinese Language, Culture and Society', 'vce', 25),
  ('vce-french', 'French', 'vce', 26),
  ('vce-japanese-sl', 'Japanese Second Language', 'vce', 27),
  ('vce-algorithmics', 'Algorithmics (HESS)', 'vce', 28),
  ('vce-applied-computing', 'Applied Computing', 'vce', 29),
  ('vce-vcd', 'Visual Communication Design', 'vce', 30),
  ('vce-art', 'Art Making and Exhibiting', 'vce', 31),
  ('vce-media', 'Media', 'vce', 32),
  ('vce-pdt', 'Product Design and Technologies', 'vce', 33),
  ('vce-philosophy', 'Philosophy', 'vce', 34),
  ('vce-sociology', 'Sociology', 'vce', 35),
  ('vce-other', 'Another VCE subject', 'vce', 36);

create table public.student_subjects (
  student_id uuid not null references public.students (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete restrict,
  wants_help boolean not null default false,
  primary key (student_id, subject_id)
);
create index student_subjects_subject_idx on public.student_subjects (subject_id);

-- One or two lines on current work, e.g. "Methods: chain rule". Not for health or personal details.
alter table public.students add column study_note varchar(200);

alter table public.subjects enable row level security;
alter table public.student_subjects enable row level security;
revoke all on public.subjects, public.student_subjects from anon;
grant select on public.subjects to authenticated;
grant select, insert, update, delete on public.student_subjects to authenticated;
grant all on public.subjects, public.student_subjects to service_role;

create policy "signed-in users read subjects" on public.subjects
  for select to authenticated using (true);

create policy "parents manage their students' subjects" on public.student_subjects
  for all to authenticated using (private.is_parent_of(student_id)) with check (private.is_parent_of(student_id));

create policy "students read own subjects" on public.student_subjects
  for select to authenticated using (private.is_self_student(student_id));

create policy "staff read rostered students' subjects" on public.student_subjects
  for select to authenticated using (private.is_rostered_for_me(student_id));

create policy "admins manage org student subjects" on public.student_subjects
  for all to authenticated
  using (private.is_org_admin(private.student_org(student_id)))
  with check (private.is_org_admin(private.student_org(student_id)));

-- ---------------------------------------------------------------------------
-- Staff roster with study profiles
-- ---------------------------------------------------------------------------

create function public.session_roster(p_session uuid)
returns table (
  student_id uuid,
  first_name text,
  last_initial text,
  year_level smallint,
  study_note text,
  tutoring boolean,
  subjects jsonb
)
language sql stable security definer set search_path = '' as $$
  select
    s.id,
    s.first_name,
    s.last_initial,
    s.year_level,
    s.study_note,
    private.has_tutoring(s.id),
    coalesce(
      (select jsonb_agg(jsonb_build_object('name', sub.name, 'help', ss.wants_help) order by ss.wants_help desc, sub.sort)
       from public.student_subjects ss join public.subjects sub on sub.id = ss.subject_id
       where ss.student_id = s.id),
      '[]'::jsonb
    )
  from public.enrolments e
  join public.students s on s.id = e.student_id
  where e.session_id = p_session
    and (
      private.is_session_proctor(p_session)
      or private.is_org_admin(
        (select r.org_id from public.sessions se join public.rooms r on r.id = se.room_id where se.id = p_session)
      )
    )
  order by private.has_tutoring(s.id) desc, s.first_name
$$;

revoke execute on function public.session_roster(uuid) from public, anon;
revoke execute on function public.my_tutoring_plan() from public, anon;
grant execute on function public.session_roster(uuid) to authenticated;
grant execute on function public.my_tutoring_plan() to authenticated;
revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;
