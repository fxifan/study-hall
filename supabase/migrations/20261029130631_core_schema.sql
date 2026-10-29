-- Study Hall core schema (docs/spec.md §5).
--
-- Conventions
-- * Every timestamp is timestamptz, stored in UTC. Display in Australia/Melbourne via src/lib/time.ts.
-- * org_id sits on the core tables (orgs, profiles, students, plans, rooms, audit_log) so B2B
--   multi-tenancy can be added later. Child tables reach their org through a parent row.
-- * Row-level security is in the next migration. Nothing here is readable through the API until then.

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('parent', 'student', 'proctor', 'admin');
create type public.student_status as enum ('invited', 'active', 'paused', 'cancelled');
create type public.consent_document as enum ('house_rules', 'privacy_child_safety');
create type public.plan_interval as enum ('week');
create type public.session_status as enum ('scheduled', 'live', 'ended', 'cancelled');
create type public.attendance_status as enum ('present', 'late', 'left_early', 'absent', 'unknown');
create type public.goal_outcome as enum ('done', 'partial', 'not_done');
create type public.focus_flag_type as enum ('off_camera', 'phone_visible', 'chatting', 'great_focus');
create type public.help_request_status as enum ('open', 'helping', 'resolved');
create type public.report_status as enum ('draft', 'approved', 'sent', 'failed');
create type public.report_channel as enum ('email');

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- One row per auth user, created by the trigger at the bottom of this file.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references public.orgs (id),
  role public.user_role not null default 'parent',
  full_name text,
  email text not null,
  created_at timestamptz not null default now()
);
create index profiles_org_role_idx on public.profiles (org_id, role);

-- Data minimisation (spec §8.5): first name, last initial, year level, optional school. Nothing else.
create table public.students (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  profile_id uuid unique references public.profiles (id) on delete set null, -- null until the invite is accepted
  first_name text not null check (char_length(btrim(first_name)) between 1 and 50),
  last_initial text not null check (char_length(last_initial) = 1),
  year_level smallint not null check (year_level between 7 and 12),
  school text check (char_length(school) <= 100),
  status public.student_status not null default 'invited',
  created_at timestamptz not null default now()
);
create index students_org_idx on public.students (org_id);

create table public.parent_students (
  parent_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  primary key (parent_id, student_id)
);
create index parent_students_student_idx on public.parent_students (student_id);

-- Immutable consent records, one per student per document version (spec §4.1 step 4).
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  parent_id uuid not null references public.profiles (id) on delete cascade,
  document public.consent_document not null,
  document_version text not null,
  accepted_at timestamptz not null default now(),
  ip_hash text
);
create index consents_student_document_idx on public.consents (student_id, document);
create index consents_parent_idx on public.consents (parent_id);

-- ---------------------------------------------------------------------------
-- Billing
-- ---------------------------------------------------------------------------

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'AUD' check (currency ~ '^[A-Z]{3}$'),
  "interval" public.plan_interval not null default 'week',
  days_per_week smallint check (days_per_week between 1 and 7), -- null = unlimited
  stripe_price_id text unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index plans_org_idx on public.plans (org_id);

-- Written only by the Stripe webhook (service role). status mirrors Stripe's subscription.status.
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  stripe_customer_id text,
  stripe_subscription_id text unique,
  status text not null,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);
create index subscriptions_parent_idx on public.subscriptions (parent_id);

-- ---------------------------------------------------------------------------
-- Rooms and sessions
-- ---------------------------------------------------------------------------

-- video_url is an external Zoom/Meet link. This app never hosts, records or analyses video (spec §8.1).
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  name text not null,
  video_url text not null check (video_url ~ '^https://'),
  capacity integer not null default 40 check (capacity > 0),
  default_proctor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index rooms_org_idx on public.rooms (org_id);

-- days_of_week uses ISO numbering: 1 = Monday … 7 = Sunday. Times are wall-clock in `timezone`.
create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  days_of_week integer[] not null
    check (cardinality(days_of_week) > 0 and days_of_week <@ array[1, 2, 3, 4, 5, 6, 7]),
  start_time time not null,
  end_time time not null,
  timezone text not null default 'Australia/Melbourne',
  block_minutes integer not null default 50 check (block_minutes > 0),
  break_minutes integer not null default 10 check (break_minutes >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index schedules_room_idx on public.schedules (room_id);

-- proctor_id stays null until a proctor with a verified, unexpired WWCC is assigned (spec §4.6).
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete restrict,
  schedule_id uuid references public.schedules (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  proctor_id uuid references public.profiles (id) on delete set null,
  status public.session_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (room_id, starts_at)
);
create index sessions_starts_at_idx on public.sessions (starts_at);
create index sessions_proctor_idx on public.sessions (proctor_id, starts_at);

create table public.enrolments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (session_id, student_id)
);
create index enrolments_student_idx on public.enrolments (student_id);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  check_in_at timestamptz,
  check_out_at timestamptz,
  status public.attendance_status not null default 'unknown',
  confirmed_by uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz,
  unique (session_id, student_id),
  check (check_in_at is null or check_out_at is null or check_out_at >= check_in_at)
);
create index attendance_student_idx on public.attendance (student_id);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  position smallint not null check (position between 1 and 3),
  text varchar(140) not null check (char_length(btrim(text)) > 0),
  outcome public.goal_outcome, -- null until the student marks it
  note varchar(140),
  created_at timestamptz not null default now(),
  unique (session_id, student_id, position)
);
create index goals_student_idx on public.goals (student_id);

create table public.focus_flags (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  type public.focus_flag_type not null,
  note varchar(200),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index focus_flags_session_student_idx on public.focus_flags (session_id, student_id);

create table public.help_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  subject text not null check (char_length(btrim(subject)) between 1 and 60),
  description varchar(500) not null,
  status public.help_request_status not null default 'open',
  claimed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index help_requests_session_status_idx on public.help_requests (session_id, status);
create index help_requests_student_idx on public.help_requests (student_id);

-- Every adult–student message is kept and admin-visible (spec §8.4). RLS grants no update or delete,
-- and a sender's profile can't be deleted while their messages exist.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  help_request_id uuid not null references public.help_requests (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete restrict,
  body varchar(1000) not null check (char_length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);
create index messages_help_request_idx on public.messages (help_request_id, created_at);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  body_text text not null,
  proctor_comment varchar(200),
  status public.report_status not null default 'draft',
  sent_at timestamptz,
  channel public.report_channel not null default 'email',
  created_at timestamptz not null default now(),
  unique (session_id, student_id)
);
create index reports_student_idx on public.reports (student_id, created_at desc);
create index reports_status_idx on public.reports (status);

-- ---------------------------------------------------------------------------
-- Compliance
-- ---------------------------------------------------------------------------

create table public.proctor_checks (
  id uuid primary key default gen_random_uuid(),
  proctor_id uuid not null references public.profiles (id) on delete cascade,
  wwcc_number text not null,
  wwcc_expiry date not null,
  verified_at timestamptz,
  verified_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index proctor_checks_proctor_idx on public.proctor_checks (proctor_id);

-- org_id is an addition to spec §5 so admins can see system events (actor_id null) for their org.
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  created_at timestamptz not null default now()
);
create index audit_log_org_created_idx on public.audit_log (org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Keep profiles in step with auth.users
-- ---------------------------------------------------------------------------

-- Role and org come from app_metadata, which only the service role can set. user_metadata is
-- client-writable (signInWithOtp options.data), so it is never trusted for role. A new user with
-- no app_metadata role is a parent signing up, placed in the oldest org (single-org MVP).
create function private.sync_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta_role text := new.raw_app_meta_data ->> 'role';
  meta_org uuid := nullif(new.raw_app_meta_data ->> 'org_id', '')::uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.profiles (id, org_id, role, full_name, email)
    values (
      new.id,
      coalesce(meta_org, (select o.id from public.orgs o order by o.created_at, o.id limit 1)),
      coalesce(meta_role::public.user_role, 'parent'),
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      new.email
    );
  else
    update public.profiles p
    set email = new.email
    where p.id = new.id and p.email is distinct from new.email;

    if meta_role is not null and meta_role is distinct from (old.raw_app_meta_data ->> 'role') then
      update public.profiles p set role = meta_role::public.user_role where p.id = new.id;
    end if;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.sync_profile_from_auth_user();

create trigger on_auth_user_updated
  after update of email, raw_app_meta_data on auth.users
  for each row execute function private.sync_profile_from_auth_user();
