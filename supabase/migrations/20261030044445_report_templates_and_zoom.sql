-- Admin tools (owner request, 30 Oct 2026):
--   * report_templates: fixed observation and comment wording, in English and Simplified Chinese,
--     that supervisors pick when writing reports, so a report built from them reads in either
--     language. Admins manage them; staff in the org read the active ones.
--   * rooms.zoom_meeting_id: the Zoom meeting an admin created for the room from /admin/rooms
--     (its join link is rooms.video_url).

create table public.report_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  kind text not null check (kind in ('observation', 'comment')),
  text_en varchar(200) not null check (char_length(btrim(text_en)) > 0),
  text_zh varchar(200) not null check (char_length(btrim(text_zh)) > 0),
  sort smallint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index report_templates_org_idx on public.report_templates (org_id, kind, sort);

alter table public.report_templates enable row level security;
grant select, insert, update, delete on public.report_templates to authenticated;
grant all on public.report_templates to service_role;

create policy "admins manage org report templates" on public.report_templates
  for all to authenticated using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));

create policy "staff read active report templates" on public.report_templates
  for select to authenticated using (
    active
    and org_id = private.my_org_id()
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('proctor', 'admin'))
  );

alter table public.rooms add column zoom_meeting_id text;
