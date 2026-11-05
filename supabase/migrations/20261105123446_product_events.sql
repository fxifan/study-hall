-- Product analytics events (coding action plan §2, §6): written by the server only, after the
-- action they describe succeeded. Operational metadata only: ids, statuses, labels. Never names,
-- emails, notes, transcripts, report or invoice content.
create table public.product_events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name ~ '^[a-z][a-z0-9_]{2,60}$'),
  product text not null check (product in ('study_hall', 'tutors', 'platform')),
  role text check (role in ('parent', 'student', 'proctor', 'admin', 'tutor')),
  user_id uuid references public.profiles (id) on delete set null,
  object_type text check (char_length(object_type) <= 40),
  object_id uuid,
  properties jsonb not null default '{}'::jsonb check (pg_column_size(properties) <= 2000),
  -- Same key, same event: retries and page refreshes don't double count.
  dedupe_key text unique check (char_length(dedupe_key) <= 200),
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);
create index product_events_name_time_idx on public.product_events (name, created_at);
create index product_events_user_time_idx on public.product_events (user_id, created_at);
create index product_events_product_time_idx on public.product_events (product, created_at) where not is_test;

revoke all on public.product_events from anon, authenticated;
grant all on public.product_events to service_role;
alter table public.product_events enable row level security;
-- No policies: only the service role (server code and the admin pages after their role check) reads or writes.
