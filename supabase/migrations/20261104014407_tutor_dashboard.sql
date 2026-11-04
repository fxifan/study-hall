-- Tutor dashboard (/app, reached from /tutors): scheduled lessons, saved meeting links, student
-- learning goals and a private calendar feed. Same ownership rules as the other tutor_* tables:
-- every row has tutor_id, child references are composite (id, tutor_id) foreign keys, and RLS
-- limits each tutor to their own rows.

-- What a student needs help with, shown on the dashboard (minimal, like the rest of the record).
alter table public.tutor_students add column goals text check (char_length(goals) <= 300);

-- Saved online-class links the tutor pastes in (Zoom). Nothing here creates meetings.
create table public.tutor_meeting_links (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutors (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  url text not null check (url ~ '^https://' and char_length(url) <= 500),
  student_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tutor_id),
  foreign key (student_id, tutor_id) references public.tutor_students (id, tutor_id) on delete set null (student_id)
);
create index tutor_meeting_links_tutor_idx on public.tutor_meeting_links (tutor_id, name);

-- Planned lessons. A lesson becomes "done" when the tutor logs it (session_id is set); logged
-- sessions are what's billed, so a scheduled lesson never reaches an invoice by itself.
create table public.tutor_lessons (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutors (id) on delete cascade,
  student_id uuid not null,
  starts_at timestamptz not null,
  duration_min integer not null check (duration_min between 15 and 600),
  subjects text[] not null default '{}' check (cardinality(subjects) <= 10),
  notes text check (char_length(notes) <= 300),
  meeting_link_id uuid,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  session_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (student_id, tutor_id) references public.tutor_students (id, tutor_id) on delete cascade,
  foreign key (meeting_link_id, tutor_id) references public.tutor_meeting_links (id, tutor_id) on delete set null (meeting_link_id),
  foreign key (session_id, tutor_id) references public.tutor_sessions (id, tutor_id) on delete set null (session_id)
);
create index tutor_lessons_tutor_idx on public.tutor_lessons (tutor_id, starts_at);
create index tutor_lessons_student_idx on public.tutor_lessons (student_id, starts_at);

create trigger set_updated_at before update on public.tutor_meeting_links for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.tutor_lessons for each row execute function private.set_updated_at();

-- Private calendar feed (ICS) that Apple Calendar, Google Calendar or Outlook subscribe to.
-- The token is the whole credential: rotating or clearing it revokes the old URL. The feed route
-- records when a calendar app last fetched it, so the dashboard can show sync status.
alter table public.tutors
  add column calendar_feed_token text unique check (calendar_feed_token ~ '^[A-Za-z0-9_-]{32,64}$'),
  add column calendar_feed_fetched_at timestamptz;

-- The feed token is set by the server (random) and the fetch time by the feed route; tutors can't
-- write either directly.
create or replace function private.guard_tutor_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' then
    if new.id <> old.id or new.plan <> old.plan or new.trial_ends_at <> old.trial_ends_at
       or new.stripe_customer_id is distinct from old.stripe_customer_id or new.created_at <> old.created_at
       or new.calendar_feed_token is distinct from old.calendar_feed_token
       or new.calendar_feed_fetched_at is distinct from old.calendar_feed_fetched_at then
      raise exception 'tutors: plan, trial, billing and calendar feed fields are managed by Study Hall' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on public.tutor_meeting_links, public.tutor_lessons from anon;
grant select, insert, update, delete on public.tutor_meeting_links, public.tutor_lessons to authenticated;
grant all on public.tutor_meeting_links, public.tutor_lessons to service_role;
alter table public.tutor_meeting_links enable row level security;
alter table public.tutor_lessons enable row level security;

create policy "tutors manage own meeting links" on public.tutor_meeting_links
  for all to authenticated using (tutor_id = (select auth.uid())) with check (tutor_id = (select auth.uid()));
create policy "tutors manage own lessons" on public.tutor_lessons
  for all to authenticated using (tutor_id = (select auth.uid())) with check (tutor_id = (select auth.uid()));
