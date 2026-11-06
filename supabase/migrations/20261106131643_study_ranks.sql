-- Edumi Study Ranks (docs/study-ranks.md). A student's rank comes from their points ledger. The
-- ladder (names, thresholds) lives in src/lib/social/ranks.ts; the app passes the thresholds to
-- sync_student_rank, so the database never holds a second copy.
--
-- student_ranks: the highest tier each student has reached (1 = Copper … 13 = Grandmaster).
-- rank_promotions: one row per promotion (from → to), uniquely keyed by (profile, to_tier), so a
-- retried or concurrent award can't promote twice. seen_at records that the student acknowledged
-- the celebration. Existing students are initialised from their current balances below, with no
-- promotion rows, so nobody is shown historical ranks as new.

create table public.student_ranks (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  tier smallint not null check (tier between 1 and 13),
  updated_at timestamptz not null default now()
);

create table public.rank_promotions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  from_tier smallint not null check (from_tier between 1 and 13),
  to_tier smallint not null check (to_tier between 1 and 13),
  points integer not null,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  unique (profile_id, to_tier),
  check (to_tier > from_tier)
);
create index rank_promotions_unseen_idx on public.rank_promotions (profile_id) where seen_at is null;

-- Whether other members see this student's rank badge (boards, chat). Points stay private.
alter table public.student_settings add column show_rank boolean not null default true;

alter table public.student_ranks enable row level security;
alter table public.rank_promotions enable row level security;
revoke all on public.student_ranks, public.rank_promotions from anon, authenticated;
grant select on public.student_ranks, public.rank_promotions to authenticated;
grant all on public.student_ranks, public.rank_promotions to service_role;
create policy "own rank" on public.student_ranks for select to authenticated using (profile_id = (select auth.uid()));
create policy "own promotions" on public.rank_promotions for select to authenticated using (profile_id = (select auth.uid()));

-- Compare the committed balance with the stored tier and record a promotion if it went up. Locks the
-- student's rank row, so concurrent awards serialise: the first records the jump (to the highest
-- tier earned, in one event), later ones see the new tier and record nothing. Returns the
-- promotion, or no row.
create function public.sync_student_rank(p_profile uuid, p_thresholds integer[])
returns table (promotion_id uuid, from_tier smallint, to_tier smallint, points integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_total integer;
  v_new smallint := 1;
  v_old smallint;
  v_id uuid;
  i integer;
begin
  if p_thresholds is null or array_length(p_thresholds, 1) <> 13 or p_thresholds[1] <> 0 then
    raise exception 'sync_student_rank: expected 13 thresholds starting at 0';
  end if;
  insert into public.student_ranks (profile_id, tier) values (p_profile, 1) on conflict (profile_id) do nothing;
  select r.tier into v_old from public.student_ranks r where r.profile_id = p_profile for update;
  select coalesce(sum(l.points), 0) into v_total from public.points_ledger l where l.profile_id = p_profile;
  for i in 1 .. 13 loop
    if v_total >= p_thresholds[i] then v_new := i; end if;
  end loop;
  if v_new <= v_old then
    return;
  end if;
  update public.student_ranks set tier = v_new, updated_at = now() where profile_id = p_profile;
  insert into public.rank_promotions (profile_id, from_tier, to_tier, points)
  values (p_profile, v_old, v_new, v_total)
  on conflict (profile_id, to_tier) do nothing
  returning id into v_id;
  if v_id is not null then
    return query select v_id, v_old, v_new, v_total;
  end if;
end;
$$;
revoke all on function public.sync_student_rank(uuid, integer[]) from public, anon, authenticated;
grant execute on function public.sync_student_rank(uuid, integer[]) to service_role;

-- Initialise every student from their current balance (thresholds as in ranks.ts, Nov 2026).
insert into public.student_ranks (profile_id, tier)
select p.id,
  (select count(*) from unnest(array[0, 50, 150, 300, 500, 800, 1200, 1700, 2300, 3000, 4000, 5500, 7500]) t
   where coalesce((select sum(l.points) from public.points_ledger l where l.profile_id = p.id), 0) >= t)::smallint
from public.profiles p
where p.role = 'student'
on conflict (profile_id) do nothing;
