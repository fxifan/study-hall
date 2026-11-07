-- Friends by username, direct messages and group invites between friends (docs/friends.md).
-- Modelled on Discord (unique usernames, exact-match add, requests the other person accepts) with
-- the teen defaults of Instagram and Snapchat: nobody can browse or search strangers, and only
-- accepted friends can message or invite each other. All writes go through the server (service
-- role) after those checks; students read their own rows under RLS, and Realtime delivers new
-- direct messages only to the two people in the conversation.

-- Usernames: unique, lowercase letters, numbers, dots and underscores, 3 to 20 characters, not
-- starting or ending with a dot or underscore, no double dots. Display names stay "Mia T.".
alter table public.students
  add column username text,
  add column username_changed_at timestamptz;
alter table public.students
  add constraint students_username_format check (
    username is null
    or (username ~ '^[a-z0-9._]{3,20}$' and username !~ '^[._]' and username !~ '[._]$' and username !~ '\.\.')
  );
create unique index students_username_key on public.students (username) where username is not null;

-- A friend inviting a friend into a group. The invitee joins only by accepting.
create table public.group_friend_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  state text not null default 'pending' check (state in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (inviter_id <> invitee_id)
);
create unique index group_friend_invites_pending_key on public.group_friend_invites (group_id, invitee_id) where state = 'pending';
create index group_friend_invites_invitee_idx on public.group_friend_invites (invitee_id, state);
create index group_friend_invites_inviter_time_idx on public.group_friend_invites (inviter_id, created_at desc);

-- One-to-one messages between two friends (a < b, like friendships). kind 'invite' carries a group
-- invite as a card in the conversation.
create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  a uuid not null references public.profiles (id) on delete cascade,
  b uuid not null references public.profiles (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  kind text not null default 'text' check (kind in ('text', 'invite')),
  body varchar(1000) not null check (char_length(btrim(body)) > 0),
  invite_id uuid references public.group_friend_invites (id) on delete cascade,
  hidden_at timestamptz,
  hidden_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (a < b),
  check (kind = 'text' or invite_id is not null)
);
create index direct_messages_pair_time_idx on public.direct_messages (a, b, created_at desc);
create index direct_messages_b_idx on public.direct_messages (b, created_at desc);
create index direct_messages_sender_time_idx on public.direct_messages (sender_id, created_at desc);

-- When each student last read each conversation (for unread dots).
create table public.dm_reads (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  other_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (profile_id, other_id)
);

-- Reports on direct messages, reviewed on the admin Edumi page like group message reports.
create table public.dm_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.direct_messages (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason varchar(300) not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  outcome text check (outcome in ('hidden', 'no_action', 'suspended')),
  unique (message_id, reporter_id)
);

revoke all on public.group_friend_invites, public.direct_messages, public.dm_reads, public.dm_reports from anon, authenticated;
grant select on public.group_friend_invites, public.direct_messages, public.dm_reads to authenticated;
grant all on public.group_friend_invites, public.direct_messages, public.dm_reads, public.dm_reports to service_role;

alter table public.group_friend_invites enable row level security;
alter table public.direct_messages enable row level security;
alter table public.dm_reads enable row level security;
alter table public.dm_reports enable row level security;

create policy "own invites" on public.group_friend_invites for select to authenticated
  using (inviter_id = (select auth.uid()) or invitee_id = (select auth.uid()));
create policy "own conversations" on public.direct_messages for select to authenticated
  using ((a = (select auth.uid()) or b = (select auth.uid())) and hidden_at is null);
create policy "own reads" on public.dm_reads for select to authenticated using (profile_id = (select auth.uid()));
-- dm_reports: service role only (admins review them through the server).

-- New direct messages arrive live; RLS limits each subscriber to their own conversations.
alter publication supabase_realtime add table public.direct_messages;
