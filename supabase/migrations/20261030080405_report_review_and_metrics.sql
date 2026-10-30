-- Supervisor report review (spec 4.4, 4.5). A report is released to the parent when it's approved, or
-- automatically 60 minutes after the session ends. Until then parents don't see the supervisor's
-- flags or check-ins. great_focus stays in the enum but the app no longer offers it: reports carry
-- no judgements about attitude.
--   * private.report_released(): the shared rule.
--   * parents read focus flags and check-ins only once released.
--   * subscriptions.canceled_at and cancel_reason: for churn on /admin/metrics.

create function private.report_released(target_session uuid, target_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.reports r
    where r.session_id = target_session and r.student_id = target_student and r.status in ('approved', 'sent')
  ) or exists (
    select 1 from public.sessions s
    where s.id = target_session and s.ends_at <= now() - interval '60 minutes'
  )
$$;

create policy "parents read released flags" on public.focus_flags
  for select to authenticated
  using (private.is_parent_of(student_id) and private.report_released(session_id, student_id));

drop policy "parents read their students' check-ins" on public.session_checkins;
create policy "parents read released check-ins" on public.session_checkins
  for select to authenticated
  using (private.is_parent_of(student_id) and private.report_released(session_id, student_id));

alter table public.subscriptions
  add column canceled_at timestamptz,
  add column cancel_reason text;
