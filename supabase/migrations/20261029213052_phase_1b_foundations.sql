-- Phase 1B foundations (docs/product-changes-plan.md):
--   * versioned legal documents (spec §7: house rules are a versioned record; consents cite a version)
--   * optional acquisition source on parent profiles (product brief §9)
--   * WWCC gate: a session can't be assigned a proctor without a verified, unexpired check (spec §4.6)
--   * room capacity enforced on enrolment (product brief §8)
--   * check_in / check_out for students (spec §4.2), the only way students write attendance

-- ---------------------------------------------------------------------------
-- Legal documents
-- ---------------------------------------------------------------------------

create table public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  document public.consent_document not null,
  version text not null,
  title text not null,
  body text not null, -- light markdown: "## heading", "- item", blank-line paragraphs
  is_draft boolean not null default true, -- drafts must be replaced by reviewed text before launch
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (org_id, document, version)
);
create index legal_documents_current_idx on public.legal_documents (org_id, document, published_at desc);

alter table public.legal_documents enable row level security;
grant select on public.legal_documents to anon;
grant select, insert, update, delete on public.legal_documents to authenticated;
grant all on public.legal_documents to service_role;

create policy "anyone reads legal documents" on public.legal_documents
  for select to anon, authenticated using (true);

create policy "admins manage org legal documents" on public.legal_documents
  for all to authenticated using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));

-- ---------------------------------------------------------------------------
-- Acquisition source (optional; a short fixed list, no social handles)
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column acquisition_source text
  check (acquisition_source in ('wechat_referral', 'parent_referral', 'social_media', 'search', 'other'));

-- ---------------------------------------------------------------------------
-- Subscriptions: remember a pending cancellation so the parent page can say when access ends
-- ---------------------------------------------------------------------------

alter table public.subscriptions add column cancel_at_period_end boolean not null default false;
alter table public.subscriptions add column quantity integer not null default 1 check (quantity > 0);

-- ---------------------------------------------------------------------------
-- WWCC gate on sessions.proctor_id
-- ---------------------------------------------------------------------------

create function private.enforce_wwcc() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  session_day date := (new.starts_at at time zone 'Australia/Melbourne')::date;
begin
  if new.proctor_id is null then
    return new;
  end if;
  if not exists (
    select 1 from public.profiles p where p.id = new.proctor_id and p.role in ('proctor', 'admin')
  ) then
    raise exception 'sessions: assigned supervisor must be a proctor or admin' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.proctor_checks c
    where c.proctor_id = new.proctor_id and c.verified_at is not null and c.wwcc_expiry >= session_day
  ) then
    raise exception 'sessions: supervisor has no verified Working with Children Check valid on %', session_day
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger enforce_wwcc before insert or update of proctor_id, starts_at on public.sessions
  for each row execute function private.enforce_wwcc();

-- ---------------------------------------------------------------------------
-- Room capacity on enrolment. Locks the session row so concurrent enrolments can't overshoot.
-- ---------------------------------------------------------------------------

create function private.enforce_room_capacity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  room_capacity integer;
  taken integer;
begin
  select r.capacity into room_capacity
  from public.sessions s join public.rooms r on r.id = s.room_id
  where s.id = new.session_id
  for update of s;

  select count(*) into taken from public.enrolments e where e.session_id = new.session_id;
  if taken >= room_capacity then
    raise exception 'enrolments: session is full (capacity %)', room_capacity using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger enforce_room_capacity before insert on public.enrolments
  for each row execute function private.enforce_room_capacity();

-- ---------------------------------------------------------------------------
-- Student check-in / check-out (spec §4.2). Doors open 10 minutes before the start; at least one
-- goal is required; arriving more than 10 minutes after the start pre-fills "late" for the proctor
-- to confirm. Returns the room's external video link.
-- ---------------------------------------------------------------------------

create function public.check_in(p_session uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_student uuid;
  v_starts timestamptz;
  v_ends timestamptz;
  v_status public.session_status;
  v_video text;
  v_now timestamptz := now();
begin
  select s.id into v_student
  from public.students s
  where s.profile_id = (select auth.uid()) and s.status = 'active';
  if v_student is null then
    raise exception 'check_in: not an active student' using errcode = '42501';
  end if;
  if not private.is_enrolment(p_session, v_student) then
    raise exception 'check_in: not enrolled in this session' using errcode = '42501';
  end if;

  select se.starts_at, se.ends_at, se.status, r.video_url into v_starts, v_ends, v_status, v_video
  from public.sessions se join public.rooms r on r.id = se.room_id
  where se.id = p_session;
  if v_status = 'cancelled' then
    raise exception 'check_in: session cancelled' using errcode = '22023';
  end if;
  if v_now < v_starts - interval '10 minutes' or v_now >= v_ends then
    raise exception 'check_in: session is not open' using errcode = '22023';
  end if;
  if not exists (select 1 from public.goals g where g.session_id = p_session and g.student_id = v_student) then
    raise exception 'check_in: set at least one goal first' using errcode = '22023';
  end if;

  insert into public.attendance (session_id, student_id, check_in_at, status)
  values (
    p_session, v_student, v_now,
    case when v_now > v_starts + interval '10 minutes' then 'late' else 'present' end::public.attendance_status
  )
  on conflict (session_id, student_id) do update
    set check_in_at = coalesce(public.attendance.check_in_at, excluded.check_in_at),
        check_out_at = null; -- rejoining after Leave
  return v_video;
end;
$$;

create function public.check_out(p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_student uuid;
begin
  select s.id into v_student from public.students s where s.profile_id = (select auth.uid());
  if v_student is null then
    raise exception 'check_out: not a student' using errcode = '42501';
  end if;
  update public.attendance a
  set check_out_at = now()
  where a.session_id = p_session and a.student_id = v_student
    and a.check_in_at is not null and a.check_out_at is null;
end;
$$;

revoke execute on function public.check_in(uuid) from public, anon;
revoke execute on function public.check_out(uuid) from public, anon;
grant execute on function public.check_in(uuid) to authenticated;
grant execute on function public.check_out(uuid) to authenticated;
