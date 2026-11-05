-- Resource limits count creations from the usage log (purpose 'resource'), so deleting a
-- resource doesn't free a trial slot. Regenerating one question or re-running the answer check is
-- logged as 'resource_edit' and doesn't count towards the limits.
alter table public.tutor_usage_events drop constraint tutor_usage_events_purpose_check;
alter table public.tutor_usage_events add constraint tutor_usage_events_purpose_check
  check (purpose in ('report', 'resource', 'resource_edit'));
create index tutor_usage_events_purpose_idx on public.tutor_usage_events (tutor_id, purpose, created_at);
