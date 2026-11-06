-- sync_student_rank's output column to_tier clashed with rank_promotions.to_tier in the ON CONFLICT
-- target ("column reference is ambiguous"). Prefer table columns, and alias the insert.
create or replace function public.sync_student_rank(p_profile uuid, p_thresholds integer[])
returns table (promotion_id uuid, from_tier smallint, to_tier smallint, points integer)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
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
  insert into public.rank_promotions as rp (profile_id, from_tier, to_tier, points)
  values (p_profile, v_old, v_new, v_total)
  on conflict (profile_id, to_tier) do nothing
  returning rp.id into v_id;
  if v_id is not null then
    return query select v_id, v_old, v_new, v_total;
  end if;
end;
$$;
revoke all on function public.sync_student_rank(uuid, integer[]) from public, anon, authenticated;
grant execute on function public.sync_student_rank(uuid, integer[]) to service_role;
