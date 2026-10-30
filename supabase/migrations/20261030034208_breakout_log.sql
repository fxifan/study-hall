-- Breakout log (docs/in-site-video-plan.md, "Launch option: one Zoom meeting with breakouts"):
--   * breakouts / breakout_students: who was in each Zoom breakout, when, and which adults ran it.
--     A child-safety record, so it's append-only: written only through start_breakout and
--     end_breakout, never updated or deleted through the Data API.
--   * Rule (spec §4.3): an adult is never alone on video with one student. A breakout needs at least
--     two students, or a second adult. Every adult needs a verified WWCC valid on the session day.
--   * public.session_breakouts() and public.breakout_adults(): what the proctor session page shows.
--   * Staff of the session (proctor or tutor) and org admins can log and read; nobody else.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.breakouts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  adult_id uuid not null references public.profiles (id) on delete restrict, -- runs it, usually the tutor
  second_adult_id uuid references public.profiles (id) on delete restrict,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  logged_by uuid not null references public.profiles (id) on delete restrict,
  check (second_adult_id is null or second_adult_id <> adult_id),
  check (ended_at is null or ended_at >= started_at)
);
create index breakouts_session_idx on public.breakouts (session_id, started_at);
create index breakouts_open_idx on public.breakouts (session_id) where ended_at is null;

create table public.breakout_students (
  breakout_id uuid not null references public.breakouts (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  primary key (breakout_id, student_id)
);
create index breakout_students_student_idx on public.breakout_students (student_id);

-- ---------------------------------------------------------------------------
-- Access: read-only through the Data API
-- ---------------------------------------------------------------------------

create function private.session_org(target_session uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select r.org_id from public.sessions s join public.rooms r on r.id = s.room_id where s.id = target_session
$$;

-- The session's proctor or tutor, or an admin of its org.
create function private.can_manage_breakouts(target_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_session_proctor(target_session) or private.is_org_admin(private.session_org(target_session))
$$;

alter table public.breakouts enable row level security;
alter table public.breakout_students enable row level security;
revoke all on public.breakouts, public.breakout_students from anon, authenticated;
grant select on public.breakouts, public.breakout_students to authenticated;
grant all on public.breakouts, public.breakout_students to service_role;

create policy "session staff and admins read breakouts" on public.breakouts
  for select to authenticated using (private.can_manage_breakouts(session_id));

create policy "session staff and admins read breakout students" on public.breakout_students
  for select to authenticated using (
    private.can_manage_breakouts((select b.session_id from public.breakouts b where b.id = breakout_id))
  );

-- ---------------------------------------------------------------------------
-- Logging a breakout
-- ---------------------------------------------------------------------------

-- Starts now. Open from 10 minutes before the session until its end, like check-in.
create function public.start_breakout(
  p_session uuid,
  p_adult uuid,
  p_students uuid[],
  p_second_adult uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_starts timestamptz;
  v_ends timestamptz;
  v_status public.session_status;
  v_org uuid;
  v_day date;
  v_students uuid[];
  v_id uuid;
  v_now timestamptz := now();
begin
  if not private.can_manage_breakouts(p_session) then
    raise exception 'breakouts: only this session''s staff or an admin can log breakouts' using errcode = '42501';
  end if;

  -- Locks the session so two breakouts can't be started for the same people at once.
  select se.starts_at, se.ends_at, se.status, r.org_id into v_starts, v_ends, v_status, v_org
  from public.sessions se join public.rooms r on r.id = se.room_id
  where se.id = p_session
  for update of se;
  if v_status = 'cancelled' or v_now < v_starts - interval '10 minutes' or v_now >= v_ends then
    raise exception 'breakouts: session is not open' using errcode = '22023';
  end if;

  if p_adult is null then
    raise exception 'breakouts: an adult must run the breakout' using errcode = '22023';
  end if;
  if p_second_adult = p_adult then
    raise exception 'breakouts: the second adult must be someone else' using errcode = '22023';
  end if;
  if private.profile_org(p_adult) is distinct from v_org
     or (p_second_adult is not null and private.profile_org(p_second_adult) is distinct from v_org) then
    raise exception 'breakouts: adults must belong to this organisation' using errcode = '42501';
  end if;
  v_day := (v_starts at time zone 'Australia/Melbourne')::date;
  perform private.assert_cleared(p_adult, v_day);
  perform private.assert_cleared(p_second_adult, v_day);

  select coalesce(array_agg(distinct x), '{}') into v_students from unnest(p_students) x where x is not null;
  if cardinality(v_students) = 0 then
    raise exception 'breakouts: choose the students in the breakout' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_students) x where not private.is_enrolment(p_session, x)) then
    raise exception 'breakouts: every student must be enrolled in this session' using errcode = '22023';
  end if;
  if cardinality(v_students) < 2 and p_second_adult is null then
    raise exception 'breakouts: one adult alone with one student is not allowed; add a second student or a second adult'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from public.breakouts b join public.breakout_students bs on bs.breakout_id = b.id
    where b.session_id = p_session and b.ended_at is null and bs.student_id = any (v_students)
  ) then
    raise exception 'breakouts: a student is already in an open breakout' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.breakouts b join public.sessions se on se.id = b.session_id
    where b.ended_at is null and se.ends_at > v_now
      and (b.adult_id in (p_adult, p_second_adult) or b.second_adult_id in (p_adult, p_second_adult))
  ) then
    raise exception 'breakouts: an adult is already in an open breakout' using errcode = '23514';
  end if;

  insert into public.breakouts (session_id, adult_id, second_adult_id, started_at, logged_by)
  values (p_session, p_adult, p_second_adult, v_now, (select auth.uid()))
  returning id into v_id;
  insert into public.breakout_students (breakout_id, student_id)
  select v_id, x from unnest(v_students) x;
  return v_id;
end;
$$;

-- Ends now, or at the session's end if it's closed after that. Ending twice changes nothing.
create function public.end_breakout(p_breakout uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_session uuid;
  v_ends timestamptz;
begin
  select b.session_id, se.ends_at into v_session, v_ends
  from public.breakouts b join public.sessions se on se.id = b.session_id
  where b.id = p_breakout
  for update of b;
  if v_session is null or not private.can_manage_breakouts(v_session) then
    raise exception 'breakouts: only this session''s staff or an admin can end breakouts' using errcode = '42501';
  end if;
  update public.breakouts
  set ended_at = greatest(started_at, least(now(), v_ends))
  where id = p_breakout and ended_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- What the proctor session page shows
-- ---------------------------------------------------------------------------

create function public.session_breakouts(p_session uuid)
returns table (
  id uuid,
  started_at timestamptz,
  ended_at timestamptz,
  adult_name text,
  second_adult_name text,
  students jsonb
)
language sql stable security definer set search_path = '' as $$
  select
    b.id,
    b.started_at,
    b.ended_at,
    coalesce(a.full_name, a.email),
    coalesce(sa.full_name, sa.email),
    coalesce(
      (select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.first_name || ' ' || s.last_initial || '.') order by s.first_name)
       from public.breakout_students bs join public.students s on s.id = bs.student_id
       where bs.breakout_id = b.id),
      '[]'::jsonb
    )
  from public.breakouts b
  join public.profiles a on a.id = b.adult_id
  left join public.profiles sa on sa.id = b.second_adult_id
  where b.session_id = p_session and private.can_manage_breakouts(p_session)
  order by b.started_at desc
$$;

-- Adults who can run or join a breakout in this session: proctors and admins in the org with a
-- verified WWCC valid on the session day. The session's tutor first, then its supervisor.
create function public.breakout_adults(p_session uuid)
returns table (id uuid, name text, session_role text)
language sql stable security definer set search_path = '' as $$
  select
    p.id,
    coalesce(p.full_name, p.email),
    case when p.id = se.tutor_id then 'tutor' when p.id = se.proctor_id then 'supervisor' end
  from public.sessions se
  join public.rooms r on r.id = se.room_id
  join public.profiles p on p.org_id = r.org_id and p.role in ('proctor', 'admin')
  where se.id = p_session
    and private.can_manage_breakouts(p_session)
    and exists (
      select 1 from public.proctor_checks c
      where c.proctor_id = p.id and c.verified_at is not null
        and c.wwcc_expiry >= (se.starts_at at time zone 'Australia/Melbourne')::date
    )
  order by
    case when p.id = se.tutor_id then 0 when p.id = se.proctor_id then 1 else 2 end,
    coalesce(p.full_name, p.email)
$$;

revoke execute on function public.start_breakout(uuid, uuid, uuid[], uuid) from public, anon;
revoke execute on function public.end_breakout(uuid) from public, anon;
revoke execute on function public.session_breakouts(uuid) from public, anon;
revoke execute on function public.breakout_adults(uuid) from public, anon;
grant execute on function public.start_breakout(uuid, uuid, uuid[], uuid) to authenticated;
grant execute on function public.end_breakout(uuid) to authenticated;
grant execute on function public.session_breakouts(uuid) to authenticated;
grant execute on function public.breakout_adults(uuid) to authenticated;
revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;
