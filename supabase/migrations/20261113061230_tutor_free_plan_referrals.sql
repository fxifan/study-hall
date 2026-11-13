-- Edumi for Tutors: free plan and referrals (docs/tutor-free-and-referrals.md, owner-approved 13 Nov 2026).
--
-- The free plan needs no columns: it's worked out from plan, trial_ends_at and the student count
-- (src/lib/tutor/plan.ts). Referrals: each tutor gets a shareable code; a tutor who signs up with
-- one records who referred them; when they first pay for Solo, both tutors get a month free once.

alter table public.tutors
  add column referral_code text unique check (referral_code ~ '^[A-Z2-9]{8}$'),
  add column referred_by uuid references public.tutors (id) on delete set null check (referred_by <> id),
  -- Set once, when the reward has been given (also makes the reward idempotent).
  add column referral_rewarded_at timestamptz;
create index tutors_referred_by_idx on public.tutors (referred_by) where referred_by is not null;

-- Referral fields are set by the server, like plan and billing fields.
create or replace function private.guard_tutor_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' then
    if new.id <> old.id or new.plan <> old.plan or new.trial_ends_at <> old.trial_ends_at
       or new.stripe_customer_id is distinct from old.stripe_customer_id or new.created_at <> old.created_at
       or new.calendar_feed_token is distinct from old.calendar_feed_token
       or new.calendar_feed_fetched_at is distinct from old.calendar_feed_fetched_at
       or new.referral_code is distinct from old.referral_code
       or new.referred_by is distinct from old.referred_by
       or new.referral_rewarded_at is distinct from old.referral_rewarded_at then
      raise exception 'tutors: plan, trial, billing, calendar feed and referral fields are managed by Edumi' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
