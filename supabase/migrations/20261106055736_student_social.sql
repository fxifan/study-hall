-- Edumi student social core (docs/student-social-spec.md): study groups with a shared daily goal,
-- a verified study timer, group chat, peer help, friends, AI study resources with points and tiers,
-- and one-off Study Hall group bookings paid by a parent.
--
-- Principles:
-- * Students 13+ can sign up themselves; under-13s only through a parent (students.social_enabled).
-- * Server-authoritative: study credit, points, recaps and bookings are written by the service role
--   only (server actions, cron, webhook). Students read their own rows; group members read their
--   group's rows. Admins read everything for moderation.
-- * Quiz answer keys live in student_resource_keys, which no client role can read.
-- * Chat messages are logged, reportable and visible to admins (as all Edumi messages are).

-- Students: who may use the social features
alter table public.students
  add column social_enabled boolean not null default false,
  add column self_signed boolean not null default false,
  add column birth_year smallint check (birth_year between 1990 and 2030),
  add column birth_month smallint check (birth_month between 1 and 12),
  add column chat_suspended_until timestamptz;

create table public.student_settings (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  friends_board_opt_in boolean not null default true,
  presence_opt_in boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Groups
create table public.study_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  timezone text not null default 'Australia/Melbourne',
  daily_target_minutes integer not null default 360 check (daily_target_minutes between 15 and 1440),
  -- An edit applies from the next group day; today's target is snapshotted in group_day_targets.
  next_target_minutes integer check (next_target_minutes between 15 and 1440),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.study_group_members (
  group_id uuid not null references public.study_groups (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  share_status boolean not null default true,
  board_opt_in boolean not null default true,
  spotlight_opt_in boolean not null default true,
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);
create index study_group_members_profile_idx on public.study_group_members (profile_id);

create table public.study_group_invites (
  code text primary key check (code ~ '^[A-Za-z0-9]{8,16}$'),
  group_id uuid not null references public.study_groups (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  max_uses integer not null default 20 check (max_uses between 1 and 50),
  uses integer not null default 0,
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.group_day_targets (
  group_id uuid not null references public.study_groups (id) on delete cascade,
  day date not null,
  target_minutes integer not null check (target_minutes between 15 and 1440),
  primary key (group_id, day)
);

-- Chat
create table public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null, -- null: a system event
  kind text not null default 'text' check (kind in ('text', 'system', 'help', 'recap')),
  body varchar(1000) not null check (char_length(btrim(body)) > 0),
  meta jsonb not null default '{}'::jsonb,
  hidden_at timestamptz,
  hidden_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index group_messages_group_time_idx on public.group_messages (group_id, created_at desc);

create table public.message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.group_messages (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason varchar(300) not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  outcome text check (outcome in ('hidden', 'no_action', 'suspended')),
  unique (message_id, reporter_id)
);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- Studying: sessions and credited intervals (server-written only)
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid references public.study_groups (id) on delete set null,
  state text not null check (state in ('running', 'paused', 'stopped')),
  started_at timestamptz not null default now(),
  last_beat_at timestamptz not null default now(),
  stopped_at timestamptz,
  stop_reason text check (stop_reason in ('manual', 'idle', 'timeout', 'left_group', 'replaced')),
  credited_seconds integer not null default 0 check (credited_seconds >= 0),
  announced boolean not null default false
);
-- One live timer per student, across devices.
create unique index study_sessions_one_live_idx on public.study_sessions (profile_id) where state <> 'stopped';
create index study_sessions_group_idx on public.study_sessions (group_id, started_at);

create table public.study_intervals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.study_sessions (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid references public.study_groups (id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  check (ended_at is null or ended_at >= started_at)
);
create index study_intervals_group_time_idx on public.study_intervals (group_id, started_at);
create index study_intervals_profile_time_idx on public.study_intervals (profile_id, started_at);
-- At most one open interval per session.
create unique index study_intervals_one_open_idx on public.study_intervals (session_id) where ended_at is null;

create table public.group_recaps (
  group_id uuid not null references public.study_groups (id) on delete cascade,
  day date not null,
  message_id uuid references public.group_messages (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, day)
);

-- Peer help
create table public.group_help_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid references public.profiles (id) on delete cascade, -- null: the whole group
  kind text not null check (kind in ('question', 'buddy', 'checkin')),
  body varchar(300),
  state text not null default 'open' check (state in ('open', 'accepted', 'resolved', 'closed')),
  accepted_by uuid references public.profiles (id) on delete set null,
  message_id uuid references public.group_messages (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index group_help_requests_group_idx on public.group_help_requests (group_id, created_at desc);

-- Friends (pairs stored once, smaller id first)
create table public.friendships (
  a uuid not null references public.profiles (id) on delete cascade,
  b uuid not null references public.profiles (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (a, b),
  check (a < b)
);
create index friendships_b_idx on public.friendships (b);

-- AI study resources, attempts and points
create table public.student_resources (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  lineage_id uuid not null default gen_random_uuid(), -- versions of one resource share a lineage
  version integer not null default 1,
  kind text not null check (kind in ('notes', 'flashcards', 'quiz')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  topic text check (char_length(topic) <= 200),
  content jsonb not null, -- for quizzes: questions and options only; keys are server-side
  -- Scored (ranked) points only for vetted quiz versions; AI-generated quizzes earn completion only.
  scored_eligible boolean not null default false,
  completed_at timestamptz,
  flagged_at timestamptz,
  flag_reason varchar(300),
  created_at timestamptz not null default now()
);
create index student_resources_profile_idx on public.student_resources (profile_id, created_at desc);

create table public.student_resource_keys (
  resource_id uuid primary key references public.student_resources (id) on delete cascade,
  answer_key jsonb not null
);

create table public.resource_attempts (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.student_resources (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  answers jsonb not null,
  correct integer not null,
  total integer not null check (total > 0),
  score_pct numeric(5, 2) not null,
  submitted_at timestamptz not null default now()
);
create index resource_attempts_profile_idx on public.resource_attempts (profile_id, submitted_at desc);

create table public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  lineage_id uuid not null,
  kind text not null check (kind in ('completion', 'score70', 'score90')),
  points integer not null check (points > 0),
  day date not null,
  created_at timestamptz not null default now(),
  unique (profile_id, lineage_id, kind)
);
create index points_ledger_profile_day_idx on public.points_ledger (profile_id, day);

-- One-off Study Hall group bookings
create table public.studyhall_bookings (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  proposed_by uuid references public.profiles (id) on delete set null,
  topic varchar(120) not null,
  price_cents integer not null check (price_cents > 0),
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.studyhall_seats (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.studyhall_bookings (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{20,64}$'),
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  parent_email text check (char_length(parent_email) <= 254),
  stripe_session_id text,
  paid_at timestamptz,
  consent_house_rules_version text,
  consent_privacy_version text,
  consent_ip_hash text,
  created_at timestamptz not null default now(),
  unique (booking_id, student_id)
);


-- Student plan (owner decision, 7 Nov 2026): A$11.99/month after a 7-day free trial; nothing is
-- free after the trial. Paid by the student or by a parent through a shared link. Students with an
-- active Edumi Study Hall subscription (parent-paid) are covered without it.
create table public.student_plans (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  trial_ends_at timestamptz not null default now() + interval '7 days',
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  payer text check (payer in ('student', 'parent')),
  stripe_customer_id text,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  -- For "ask a parent to pay": a link the student shares; the parent checks out without an account.
  parent_link_token text unique check (parent_link_token ~ '^[A-Za-z0-9_-]{20,64}$'),
  parent_email text check (char_length(parent_email) <= 254),
  updated_at timestamptz not null default now()
);

-- AI practice generation log, for the daily limit (2 sets of 8 questions a day).
create table public.student_ai_usage (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('generate', 'regenerate')),
  tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index student_ai_usage_profile_day_idx on public.student_ai_usage (profile_id, day);

-- Membership helper (security definer: avoids RLS recursion)
create function private.is_group_member(target_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.study_group_members m
    where m.group_id = target_group and m.profile_id = (select auth.uid())
  )
$$;

create function private.is_org_admin_any() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
$$;

-- Grants and RLS
revoke all on public.student_settings, public.study_groups, public.study_group_members, public.study_group_invites,
  public.group_day_targets, public.group_messages, public.message_reports, public.user_blocks, public.study_sessions,
  public.study_intervals, public.group_recaps, public.group_help_requests, public.friendships, public.student_resources,
  public.student_resource_keys, public.resource_attempts, public.points_ledger, public.studyhall_bookings,
  public.studyhall_seats, public.student_plans, public.student_ai_usage from anon, authenticated;

grant select on public.student_plans, public.student_ai_usage to authenticated;
grant all on public.student_plans, public.student_ai_usage to service_role;
alter table public.student_plans enable row level security;
alter table public.student_ai_usage enable row level security;
create policy "own plan" on public.student_plans for select to authenticated using (profile_id = (select auth.uid()));
create policy "own ai usage" on public.student_ai_usage for select to authenticated using (profile_id = (select auth.uid()));

grant select on public.student_settings, public.study_groups, public.study_group_members, public.group_day_targets,
  public.group_messages, public.user_blocks, public.study_sessions, public.study_intervals, public.group_help_requests,
  public.friendships, public.student_resources, public.resource_attempts, public.points_ledger, public.studyhall_bookings,
  public.studyhall_seats, public.message_reports to authenticated;
grant insert on public.group_messages to authenticated;

grant all on public.student_settings, public.study_groups, public.study_group_members, public.study_group_invites,
  public.group_day_targets, public.group_messages, public.message_reports, public.user_blocks, public.study_sessions,
  public.study_intervals, public.group_recaps, public.group_help_requests, public.friendships, public.student_resources,
  public.student_resource_keys, public.resource_attempts, public.points_ledger, public.studyhall_bookings,
  public.studyhall_seats to service_role;

alter table public.student_settings enable row level security;
alter table public.study_groups enable row level security;
alter table public.study_group_members enable row level security;
alter table public.study_group_invites enable row level security;
alter table public.group_day_targets enable row level security;
alter table public.group_messages enable row level security;
alter table public.message_reports enable row level security;
alter table public.user_blocks enable row level security;
alter table public.study_sessions enable row level security;
alter table public.study_intervals enable row level security;
alter table public.group_recaps enable row level security;
alter table public.group_help_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.student_resources enable row level security;
alter table public.student_resource_keys enable row level security;
alter table public.resource_attempts enable row level security;
alter table public.points_ledger enable row level security;
alter table public.studyhall_bookings enable row level security;
alter table public.studyhall_seats enable row level security;

create policy "own settings" on public.student_settings for select to authenticated using (profile_id = (select auth.uid()));
create policy "members read group" on public.study_groups for select to authenticated
  using (private.is_group_member(id) or private.is_org_admin(org_id));
create policy "members read members" on public.study_group_members for select to authenticated
  using (private.is_group_member(group_id) or private.is_org_admin_any());
create policy "members read targets" on public.group_day_targets for select to authenticated
  using (private.is_group_member(group_id) or private.is_org_admin_any());
create policy "members read messages" on public.group_messages for select to authenticated
  using ((private.is_group_member(group_id) and hidden_at is null) or private.is_org_admin_any());
-- Members post text as themselves, unless suspended from chat.
create policy "members post messages" on public.group_messages for insert to authenticated
  with check (
    kind = 'text' and sender_id = (select auth.uid()) and private.is_group_member(group_id)
    and not exists (
      select 1 from public.students s
      where s.profile_id = (select auth.uid()) and s.chat_suspended_until is not null and s.chat_suspended_until > now()
    )
  );
create policy "admins read reports" on public.message_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or private.is_org_admin_any());
create policy "own blocks" on public.user_blocks for select to authenticated using (blocker_id = (select auth.uid()));
create policy "own sessions" on public.study_sessions for select to authenticated using (profile_id = (select auth.uid()));
create policy "own intervals" on public.study_intervals for select to authenticated using (profile_id = (select auth.uid()));
create policy "members read help" on public.group_help_requests for select to authenticated
  using (private.is_group_member(group_id) or private.is_org_admin_any());
create policy "own friendships" on public.friendships for select to authenticated
  using (a = (select auth.uid()) or b = (select auth.uid()));
create policy "own resources" on public.student_resources for select to authenticated using (profile_id = (select auth.uid()));
create policy "own attempts" on public.resource_attempts for select to authenticated using (profile_id = (select auth.uid()));
create policy "own points" on public.points_ledger for select to authenticated using (profile_id = (select auth.uid()));
create policy "members read bookings" on public.studyhall_bookings for select to authenticated
  using (private.is_group_member(group_id) or private.is_org_admin_any());
create policy "own seats" on public.studyhall_seats for select to authenticated
  using (exists (select 1 from public.students s where s.id = student_id and s.profile_id = (select auth.uid())) or private.is_org_admin_any());

-- Live chat and help updates over Supabase Realtime (RLS applies to subscribers).
alter publication supabase_realtime add table public.group_messages, public.group_help_requests;
