-- Tutor resources (docs/tutor-resources-spec.md): AI practice sets and VCE English writing tips,
-- built against curriculum points that Study Hall imports and an admin publishes.
--
-- * curriculum_points: shared reference data (codes + our own paraphrases, linked to VCAA). Any
--   signed-in user reads published points; only the service role writes (import script, admin page).
-- * tutor_resources: private to the tutor who made them, like every tutor table (RLS on tutor_id).
-- * tutor_usage_events.purpose: report drafts and resources have separate monthly caps.

create table public.curriculum_points (
  id uuid primary key default gen_random_uuid(),
  framework text not null check (framework in ('vce', 'vc')), -- VCE study design / Victorian Curriculum 2.0
  subject text not null check (char_length(btrim(subject)) between 1 and 80),
  unit_or_level text not null check (char_length(btrim(unit_or_level)) between 1 and 40), -- 'Unit 3', 'Year 9'
  area text not null check (char_length(btrim(area)) between 1 and 160), -- area of study / strand
  code text check (char_length(code) <= 40),
  summary text not null check (char_length(btrim(summary)) between 1 and 400), -- our paraphrase
  accreditation text check (char_length(accreditation) <= 40),
  source_url text check (source_url ~ '^https://'),
  checked_on date,
  is_published boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (framework, subject, unit_or_level, area, summary)
);
create index curriculum_points_pick_idx on public.curriculum_points (framework, subject, unit_or_level, sort) where is_published;

create table public.tutor_resources (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutors (id) on delete cascade,
  kind text not null check (kind in ('practice_set', 'writing_tips')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  framework text not null check (framework in ('vce', 'vc')),
  subject text not null,
  unit_or_level text not null,
  point_ids uuid[] not null default '{}' check (cardinality(point_ids) between 1 and 12),
  settings jsonb not null default '{}'::jsonb, -- difficulty, question types, count, focus
  content jsonb not null,    -- the tutor's edited version
  draft_json jsonb,          -- what the model returned (kept for quality checks)
  status text not null default 'draft' check (status in ('draft', 'approved')),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'approved') = (approved_at is not null))
);
create index tutor_resources_tutor_idx on public.tutor_resources (tutor_id, created_at desc);

create trigger set_updated_at before update on public.curriculum_points for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.tutor_resources for each row execute function private.set_updated_at();

alter table public.tutor_usage_events
  add column purpose text not null default 'report' check (purpose in ('report', 'resource'));

revoke all on public.curriculum_points, public.tutor_resources from anon;
grant select on public.curriculum_points to authenticated;
grant select, insert, update, delete on public.tutor_resources to authenticated;
grant all on public.curriculum_points, public.tutor_resources to service_role;

alter table public.curriculum_points enable row level security;
alter table public.tutor_resources enable row level security;

create policy "signed-in users read published points" on public.curriculum_points
  for select to authenticated using (is_published);

create policy "tutors manage own resources" on public.tutor_resources
  for all to authenticated using (tutor_id = (select auth.uid())) with check (tutor_id = (select auth.uid()));
