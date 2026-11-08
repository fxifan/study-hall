-- Link a tutor's student record to the student's own Edumi account (docs/tutor-next-steps.md), so
-- the student sees their tutor's next steps and reports progress. The tutor shares an invite link
-- (link_token); the student opens it, sees what the tutor will see, and accepts. Either side can
-- unlink. The tutor sees only next-step progress and notes: never study minutes, chats or friends.
--
-- Link fields are written by the server (service role) only: a tutor can't point a record at
-- someone else's account. The student's progress updates also go through the server.

alter table public.tutor_students
  add column link_token text unique check (link_token ~ '^[A-Za-z0-9_-]{24,64}$'),
  add column linked_profile_id uuid references public.profiles (id) on delete set null,
  add column linked_at timestamptz;

-- One record per tutor for a given student account.
create unique index tutor_students_one_link_idx on public.tutor_students (tutor_id, linked_profile_id) where linked_profile_id is not null;
create index tutor_students_linked_idx on public.tutor_students (linked_profile_id) where linked_profile_id is not null;

create or replace function private.guard_tutor_student_link() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      if new.link_token is not null or new.linked_profile_id is not null or new.linked_at is not null then
        raise exception 'tutor_students: links are managed by Edumi' using errcode = '42501';
      end if;
    elsif new.link_token is distinct from old.link_token
       or new.linked_profile_id is distinct from old.linked_profile_id
       or new.linked_at is distinct from old.linked_at then
      raise exception 'tutor_students: links are managed by Edumi' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_link before insert or update on public.tutor_students
  for each row execute function private.guard_tutor_student_link();

-- Who last updated a next step's progress: the tutor, or the student ("Alex reported").
alter table public.tutor_tasks
  add column updated_by text not null default 'tutor' check (updated_by in ('tutor', 'student'));
