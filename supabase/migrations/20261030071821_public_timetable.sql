-- The public timetable (landing page, sign-up) is read from active schedules, so trialling shorter
-- session blocks in /admin/schedule updates what families see. Signed-out visitors get the session
-- times only, never room links or staffing.
grant select (id, days_of_week, start_time, end_time, block_minutes, break_minutes, timezone, active)
  on public.schedules to anon;

create policy "anyone reads active schedule times" on public.schedules
  for select to anon using (active);
