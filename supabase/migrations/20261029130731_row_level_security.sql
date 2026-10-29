-- Row-level security for every public table (docs/spec.md §5, "Row-level security").
--
--   Parents   read/write their own students; read those students' goals, attendance and reports.
--   Students  read/write their own goals and help requests; read their own attendance.
--   Proctors  read the roster for sessions they're assigned to; write attendance, flags, reports
--             and help-request status for those sessions only.
--   Admins    everything in their org (consents, messages and audit_log stay append-only).
--
-- Policies call SECURITY DEFINER helpers in the `private` schema. That avoids policy recursion
-- (students <-> parent_students) and keeps each policy readable. The `private` schema is not exposed
-- through the Data API. Writes that need the service role (Stripe webhook, cron, invites) bypass RLS.
-- Column-level limits that RLS can't express are enforced by the guard triggers at the bottom.

-- ---------------------------------------------------------------------------
-- Grants: anon gets nothing; authenticated gets table access filtered by RLS
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers (all read the caller from auth.uid())
-- ---------------------------------------------------------------------------

create function private.my_org_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.org_id from public.profiles p where p.id = (select auth.uid())
$$;

create function private.is_org_admin(target_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.org_id = target_org
  )
$$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
$$;

create function private.is_parent_of(target_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.parent_students ps
    where ps.parent_id = (select auth.uid()) and ps.student_id = target_student
  )
$$;

-- True when the caller is the student who logs in as target_student.
create function private.is_self_student(target_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.students s where s.id = target_student and s.profile_id = (select auth.uid())
  )
$$;

create function private.is_enrolment(target_session uuid, target_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.enrolments e where e.session_id = target_session and e.student_id = target_student
  )
$$;

-- True when the caller (a student) is enrolled in target_session.
create function private.is_enrolled(target_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.enrolments e
    join public.students s on s.id = e.student_id
    where e.session_id = target_session and s.profile_id = (select auth.uid())
  )
$$;

create function private.is_session_proctor(target_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sessions s where s.id = target_session and s.proctor_id = (select auth.uid())
  )
$$;

-- True when target_student is enrolled in any session the caller proctors.
create function private.is_rostered_for_me(target_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.enrolments e
    join public.sessions s on s.id = e.session_id
    where e.student_id = target_student and s.proctor_id = (select auth.uid())
  )
$$;

-- True when one of the caller's children is enrolled in target_session.
create function private.is_parent_in_session(target_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.enrolments e
    join public.parent_students ps on ps.student_id = e.student_id
    where e.session_id = target_session and ps.parent_id = (select auth.uid())
  )
$$;

-- Rooms carry the video link, so only the people in them see them: the room's default proctor,
-- the proctor of one of its sessions, or a student enrolled in one of its sessions.
create function private.can_see_room(target_room uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rooms r where r.id = target_room and r.default_proctor_id = (select auth.uid())
  ) or exists (
    select 1 from public.sessions s
    where s.room_id = target_room
      and (s.proctor_id = (select auth.uid()) or private.is_enrolled(s.id))
  )
$$;

-- The student who raised it, the proctor of its session, or an admin of its org.
create function private.can_access_help_request(target_request uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.help_requests h
    join public.students s on s.id = h.student_id
    where h.id = target_request
      and (
        s.profile_id = (select auth.uid())
        or private.is_session_proctor(h.session_id)
        or private.is_org_admin(s.org_id)
      )
  )
$$;

create function private.student_org(target_student uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.org_id from public.students s where s.id = target_student
$$;

create function private.profile_org(target_profile uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select p.org_id from public.profiles p where p.id = target_profile
$$;

create function private.room_org(target_room uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select r.org_id from public.rooms r where r.id = target_room
$$;

revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

alter table public.orgs enable row level security;
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.parent_students enable row level security;
alter table public.consents enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.rooms enable row level security;
alter table public.schedules enable row level security;
alter table public.sessions enable row level security;
alter table public.enrolments enable row level security;
alter table public.attendance enable row level security;
alter table public.goals enable row level security;
alter table public.focus_flags enable row level security;
alter table public.help_requests enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;
alter table public.proctor_checks enable row level security;
alter table public.audit_log enable row level security;

-- ---------------------------------------------------------------------------
-- orgs
-- ---------------------------------------------------------------------------

create policy "members read their org" on public.orgs
  for select to authenticated using (id = private.my_org_id());

create policy "admins update their org" on public.orgs
  for update to authenticated using (private.is_org_admin(id)) with check (private.is_org_admin(id));

-- ---------------------------------------------------------------------------
-- profiles (inserted by the auth trigger; deleted with the auth user)
-- ---------------------------------------------------------------------------

create policy "users read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy "users update own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "admins read org profiles" on public.profiles
  for select to authenticated using (private.is_org_admin(org_id));

create policy "admins update org profiles" on public.profiles
  for update to authenticated using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));

-- ---------------------------------------------------------------------------
-- students
-- ---------------------------------------------------------------------------

create policy "parents read own students" on public.students
  for select to authenticated using (private.is_parent_of(id));

create policy "parents update own students" on public.students
  for update to authenticated using (private.is_parent_of(id)) with check (private.is_parent_of(id));

create policy "students read own record" on public.students
  for select to authenticated using (profile_id = (select auth.uid()));

create policy "proctors read rostered students" on public.students
  for select to authenticated using (private.is_rostered_for_me(id));

create policy "admins manage org students" on public.students
  for all to authenticated using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));

-- ---------------------------------------------------------------------------
-- parent_students
-- ---------------------------------------------------------------------------

create policy "parents read own links" on public.parent_students
  for select to authenticated using (parent_id = (select auth.uid()));

create policy "admins manage org links" on public.parent_students
  for all to authenticated
  using (private.is_org_admin(private.student_org(student_id)))
  with check (
    private.is_org_admin(private.student_org(student_id))
    and private.is_org_admin(private.profile_org(parent_id))
  );

-- ---------------------------------------------------------------------------
-- consents (append-only)
-- ---------------------------------------------------------------------------

create policy "parents read their students' consents" on public.consents
  for select to authenticated using (private.is_parent_of(student_id));

create policy "parents record consent" on public.consents
  for insert to authenticated
  with check (parent_id = (select auth.uid()) and private.is_parent_of(student_id));

create policy "admins read org consents" on public.consents
  for select to authenticated using (private.is_org_admin(private.student_org(student_id)));

-- ---------------------------------------------------------------------------
-- plans
-- ---------------------------------------------------------------------------

create policy "members read org plans" on public.plans
  for select to authenticated using (org_id = private.my_org_id());

create policy "admins manage org plans" on public.plans
  for all to authenticated using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));

-- ---------------------------------------------------------------------------
-- subscriptions (written by the Stripe webhook with the service role)
-- ---------------------------------------------------------------------------

create policy "parents read own subscriptions" on public.subscriptions
  for select to authenticated using (parent_id = (select auth.uid()));

create policy "admins read org subscriptions" on public.subscriptions
  for select to authenticated using (private.is_org_admin(private.profile_org(parent_id)));

-- ---------------------------------------------------------------------------
-- rooms and schedules
-- ---------------------------------------------------------------------------

create policy "participants read their rooms" on public.rooms
  for select to authenticated using (private.can_see_room(id));

create policy "admins manage org rooms" on public.rooms
  for all to authenticated using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));

create policy "participants read their schedules" on public.schedules
  for select to authenticated using (private.can_see_room(room_id));

create policy "admins manage org schedules" on public.schedules
  for all to authenticated
  using (private.is_org_admin(private.room_org(room_id)))
  with check (private.is_org_admin(private.room_org(room_id)));

-- ---------------------------------------------------------------------------
-- sessions and enrolments
-- ---------------------------------------------------------------------------

create policy "proctors read assigned sessions" on public.sessions
  for select to authenticated using (proctor_id = (select auth.uid()));

create policy "students read enrolled sessions" on public.sessions
  for select to authenticated using (private.is_enrolled(id));

create policy "parents read their students' sessions" on public.sessions
  for select to authenticated using (private.is_parent_in_session(id));

create policy "admins manage org sessions" on public.sessions
  for all to authenticated
  using (private.is_org_admin(private.room_org(room_id)))
  with check (private.is_org_admin(private.room_org(room_id)));

create policy "proctors read their rosters" on public.enrolments
  for select to authenticated using (private.is_session_proctor(session_id));

create policy "students read own enrolments" on public.enrolments
  for select to authenticated using (private.is_self_student(student_id));

create policy "parents read their students' enrolments" on public.enrolments
  for select to authenticated using (private.is_parent_of(student_id));

create policy "admins manage org enrolments" on public.enrolments
  for all to authenticated
  using (private.is_org_admin(private.student_org(student_id)))
  with check (private.is_org_admin(private.student_org(student_id)));

-- ---------------------------------------------------------------------------
-- attendance (student check-in/out goes through a server action, not these policies)
-- ---------------------------------------------------------------------------

create policy "proctors read attendance for their sessions" on public.attendance
  for select to authenticated using (private.is_session_proctor(session_id));

create policy "proctors record attendance for their sessions" on public.attendance
  for insert to authenticated
  with check (private.is_session_proctor(session_id) and private.is_enrolment(session_id, student_id));

create policy "proctors update attendance for their sessions" on public.attendance
  for update to authenticated
  using (private.is_session_proctor(session_id))
  with check (private.is_session_proctor(session_id) and private.is_enrolment(session_id, student_id));

create policy "students read own attendance" on public.attendance
  for select to authenticated using (private.is_self_student(student_id));

create policy "parents read their students' attendance" on public.attendance
  for select to authenticated using (private.is_parent_of(student_id));

create policy "admins manage org attendance" on public.attendance
  for all to authenticated
  using (private.is_org_admin(private.student_org(student_id)))
  with check (private.is_org_admin(private.student_org(student_id)));

-- ---------------------------------------------------------------------------
-- goals
-- ---------------------------------------------------------------------------

create policy "students manage own goals" on public.goals
  for all to authenticated
  using (private.is_self_student(student_id))
  with check (private.is_self_student(student_id) and private.is_enrolment(session_id, student_id));

create policy "proctors read goals for their sessions" on public.goals
  for select to authenticated using (private.is_session_proctor(session_id));

create policy "parents read their students' goals" on public.goals
  for select to authenticated using (private.is_parent_of(student_id));

create policy "admins manage org goals" on public.goals
  for all to authenticated
  using (private.is_org_admin(private.student_org(student_id)))
  with check (private.is_org_admin(private.student_org(student_id)));

-- ---------------------------------------------------------------------------
-- focus_flags
-- ---------------------------------------------------------------------------

create policy "proctors read flags for their sessions" on public.focus_flags
  for select to authenticated using (private.is_session_proctor(session_id));

create policy "proctors add flags for their sessions" on public.focus_flags
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.is_session_proctor(session_id)
    and private.is_enrolment(session_id, student_id)
  );

create policy "proctors remove own flags" on public.focus_flags
  for delete to authenticated
  using (created_by = (select auth.uid()) and private.is_session_proctor(session_id));

create policy "admins manage org flags" on public.focus_flags
  for all to authenticated
  using (private.is_org_admin(private.student_org(student_id)))
  with check (private.is_org_admin(private.student_org(student_id)));

-- ---------------------------------------------------------------------------
-- help_requests
-- ---------------------------------------------------------------------------

create policy "students read own help requests" on public.help_requests
  for select to authenticated using (private.is_self_student(student_id));

create policy "students raise help requests" on public.help_requests
  for insert to authenticated
  with check (
    private.is_self_student(student_id)
    and private.is_enrolment(session_id, student_id)
    and status = 'open'
    and claimed_by is null
    and resolved_at is null
  );

create policy "proctors read help requests for their sessions" on public.help_requests
  for select to authenticated using (private.is_session_proctor(session_id));

create policy "proctors update help requests for their sessions" on public.help_requests
  for update to authenticated
  using (private.is_session_proctor(session_id))
  with check (private.is_session_proctor(session_id));

create policy "admins manage org help requests" on public.help_requests
  for all to authenticated
  using (private.is_org_admin(private.student_org(student_id)))
  with check (private.is_org_admin(private.student_org(student_id)));

-- ---------------------------------------------------------------------------
-- messages (append-only log; no update or delete policies for anyone)
-- ---------------------------------------------------------------------------

create policy "participants read help messages" on public.messages
  for select to authenticated using (private.can_access_help_request(help_request_id));

create policy "participants send help messages" on public.messages
  for insert to authenticated
  with check (sender_id = (select auth.uid()) and private.can_access_help_request(help_request_id));

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------

create policy "proctors read reports for their sessions" on public.reports
  for select to authenticated using (private.is_session_proctor(session_id));

create policy "proctors write reports for their sessions" on public.reports
  for insert to authenticated
  with check (private.is_session_proctor(session_id) and private.is_enrolment(session_id, student_id));

create policy "proctors update reports for their sessions" on public.reports
  for update to authenticated
  using (private.is_session_proctor(session_id))
  with check (private.is_session_proctor(session_id));

-- Parents never see drafts.
create policy "parents read their students' reports" on public.reports
  for select to authenticated using (private.is_parent_of(student_id) and status <> 'draft');

create policy "admins manage org reports" on public.reports
  for all to authenticated
  using (private.is_org_admin(private.student_org(student_id)))
  with check (private.is_org_admin(private.student_org(student_id)));

-- ---------------------------------------------------------------------------
-- proctor_checks and audit_log
-- ---------------------------------------------------------------------------

create policy "proctors read own checks" on public.proctor_checks
  for select to authenticated using (proctor_id = (select auth.uid()));

create policy "admins manage org checks" on public.proctor_checks
  for all to authenticated
  using (private.is_org_admin(private.profile_org(proctor_id)))
  with check (private.is_org_admin(private.profile_org(proctor_id)));

create policy "admins read org audit log" on public.audit_log
  for select to authenticated using (private.is_org_admin(org_id));

-- ---------------------------------------------------------------------------
-- Column guards. These only bind API callers (role `authenticated`); the service role and
-- SECURITY DEFINER functions run as other roles and pass straight through.
-- ---------------------------------------------------------------------------

-- Users may change their own full_name. Admins may also change role. Nobody moves org or email here.
create function private.guard_profile_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' then
    if new.id <> old.id or new.org_id <> old.org_id or new.email <> old.email
       or new.created_at <> old.created_at then
      raise exception 'profiles: only full_name and role can be changed' using errcode = '42501';
    end if;
    if new.role <> old.role and not private.is_admin() then
      raise exception 'profiles: only admins can change roles' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_profile_update before update on public.profiles
  for each row execute function private.guard_profile_update();

-- Parents may edit name, initial, year level and school. Status changes come from Stripe or an admin.
create function private.guard_student_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' then
    if new.id <> old.id or new.org_id <> old.org_id or new.created_at <> old.created_at then
      raise exception 'students: id, org and created_at are fixed' using errcode = '42501';
    end if;
    if not private.is_admin()
       and (new.status <> old.status or new.profile_id is distinct from old.profile_id) then
      raise exception 'students: only admins can change status or login' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_student_update before update on public.students
  for each row execute function private.guard_student_update();

-- Proctors change only status, claimed_by and resolved_at.
create function private.guard_help_request_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and not private.is_admin()
     and (new.id <> old.id or new.session_id <> old.session_id or new.student_id <> old.student_id
          or new.subject <> old.subject or new.description <> old.description
          or new.created_at <> old.created_at) then
    raise exception 'help_requests: only status, claimed_by and resolved_at can be changed'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_help_request_update before update on public.help_requests
  for each row execute function private.guard_help_request_update();

-- Proctors add a comment and approve (draft -> approved). Sending is the server's job.
create function private.guard_report_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and not private.is_admin() then
    if new.id <> old.id or new.session_id <> old.session_id or new.student_id <> old.student_id
       or new.body_text <> old.body_text or new.channel <> old.channel
       or new.sent_at is distinct from old.sent_at or new.created_at <> old.created_at then
      raise exception 'reports: only proctor_comment and status can be changed' using errcode = '42501';
    end if;
    if new.status <> old.status and not (old.status = 'draft' and new.status = 'approved') then
      raise exception 'reports: proctors can only approve drafts' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_report_update before update on public.reports
  for each row execute function private.guard_report_update();
