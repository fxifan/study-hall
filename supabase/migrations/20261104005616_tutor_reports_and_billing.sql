-- Tutor session reports + billing (docs/tutor-reports-spec.md §5): a separate product inside Study Hall
-- for independent tutors, at /app. Its tables are prefixed `tutor_` because Study Hall already has
-- `students`, `sessions` and `reports`.
--
-- Ownership
-- * tutors.id IS the tutor's auth user / profile id (the spec's `user_id`), so every row's owner is
--   simply `tutor_id = auth.uid()`.
-- * Every tutor_* table carries tutor_id. Child rows point at their parent with a composite
--   (id, tutor_id) foreign key, so a row can never reference another tutor's family, student,
--   session or invoice, even through the API.
-- * RLS: a tutor reads and writes only their own rows. Study Hall admins (the founders) read
--   tutors and usage events for /admin/costs, and nothing else: not families, students, reports or
--   invoices.
-- * Plan and trial fields, and usage events, are written by the service role only.
--
-- Money is integer cents, AUD. Bank details are encrypted by the app (src/lib/tutor/crypto.ts)
-- before they reach the database; only ciphertext is stored here.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create type public.tutor_report_lang as enum ('en', 'zh-CN', 'both');
create type public.tutor_session_status as enum ('logged', 'invoiced');
create type public.tutor_invoice_status as enum ('draft', 'sent', 'paid', 'overdue');
create type public.tutor_usage_kind as enum ('transcribe_seconds', 'llm_tokens', 'email');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.tutors (
  id uuid primary key references public.profiles (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  business_name text check (char_length(business_name) <= 120),
  abn text check (abn ~ '^[0-9]{11}$'),
  gst_registered boolean not null default false,
  default_rate_cents integer not null default 6000 check (default_rate_cents between 0 and 100000),
  bank_account_name text check (char_length(bank_account_name) <= 120),
  bank_bsb_enc text,
  bank_acct_enc text,
  report_langs text[] not null default array['en']
    check (cardinality(report_langs) between 1 and 2 and report_langs <@ array['en', 'zh-CN']),
  invoice_due_days smallint not null default 7 check (invoice_due_days between 0 and 90),
  overdue_reminders boolean not null default true,
  -- Service role only (guard below). No Stripe yet: founders switch a tutor to 'solo' by hand.
  plan text not null default 'trial' check (plan in ('trial', 'solo')),
  trial_ends_at timestamptz not null default now() + interval '14 days',
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A GST-registered business always has an ABN, and a tax invoice must show it.
  check (not gst_registered or abn is not null)
);

create table public.tutor_families (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutors (id) on delete cascade,
  parent_name text not null check (char_length(btrim(parent_name)) between 1 and 100),
  parent_email text not null check (parent_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(parent_email) <= 254),
  report_lang public.tutor_report_lang not null default 'en',
  rate_cents_override integer check (rate_cents_override between 0 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tutor_id)
);
create index tutor_families_tutor_idx on public.tutor_families (tutor_id, parent_name);

-- Data minimisation (spec §6): first name, last initial, year level, subjects, optional notes.
-- No date of birth, photo, address or phone number. year_level 0 = Foundation/Prep.
create table public.tutor_students (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutors (id) on delete cascade,
  family_id uuid not null,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 50),
  last_initial text not null check (char_length(last_initial) = 1),
  year_level smallint not null check (year_level between 0 and 12),
  subjects text[] not null default '{}' check (cardinality(subjects) <= 10),
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tutor_id),
  foreign key (family_id, tutor_id) references public.tutor_families (id, tutor_id) on delete cascade
);
create index tutor_students_tutor_idx on public.tutor_students (tutor_id, first_name);
create index tutor_students_family_idx on public.tutor_students (family_id);

create table public.tutor_invoices (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutors (id) on delete cascade,
  family_id uuid not null,
  number integer not null, -- per-tutor sequence, set by the trigger below
  issue_date date not null,
  due_date date not null,
  -- GST-registered: rates are GST-inclusive, gst = round(total / 11), subtotal = total - gst.
  -- Not registered: gst = 0, subtotal = total. src/lib/tutor/invoice-math.ts is the canonical maths.
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  gst_cents integer not null default 0 check (gst_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  -- Snapshot of the tutor's GST status when the invoice was created: it picks the template
  -- ("Tax invoice" vs "Invoice") and must not change if the tutor's settings change later.
  gst_registered boolean not null,
  status public.tutor_invoice_status not null default 'draft',
  payment_link_url text check (payment_link_url ~ '^https://'), -- unused until Stripe Connect (phase 2)
  pdf_path text, -- unused: PDFs are rendered on demand from the row and its `seller` snapshot
  -- Seller details as sent (names, ABN, encrypted bank details), so a re-rendered PDF matches.
  seller jsonb,
  sent_at timestamptz,
  sent_to text,
  paid_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_cents = subtotal_cents + gst_cents),
  check (gst_registered or gst_cents = 0),
  check (due_date >= issue_date),
  unique (tutor_id, number),
  unique (id, tutor_id),
  foreign key (family_id, tutor_id) references public.tutor_families (id, tutor_id) on delete restrict
);
create index tutor_invoices_tutor_idx on public.tutor_invoices (tutor_id, number desc);
create index tutor_invoices_family_idx on public.tutor_invoices (family_id);
create index tutor_invoices_due_idx on public.tutor_invoices (status, due_date);

create table public.tutor_sessions (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutors (id) on delete cascade,
  student_id uuid not null,
  starts_at timestamptz not null,
  duration_min integer not null check (duration_min between 5 and 600),
  rate_cents integer not null check (rate_cents between 0 and 100000), -- hourly rate at the time
  subjects text[] not null default '{}' check (cardinality(subjects) <= 10),
  invoice_id uuid,
  status public.tutor_session_status not null default 'logged', -- follows invoice_id (trigger)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tutor_id),
  foreign key (student_id, tutor_id) references public.tutor_students (id, tutor_id) on delete restrict,
  -- Deleting a draft invoice releases its sessions back to unbilled.
  foreign key (invoice_id, tutor_id) references public.tutor_invoices (id, tutor_id) on delete set null (invoice_id)
);
create index tutor_sessions_tutor_idx on public.tutor_sessions (tutor_id, starts_at desc);
create index tutor_sessions_student_idx on public.tutor_sessions (student_id, starts_at desc);
create index tutor_sessions_invoice_idx on public.tutor_sessions (invoice_id);

create table public.tutor_reports (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutors (id) on delete cascade,
  session_id uuid not null unique,
  source text not null check (source in ('voice', 'typed')),
  -- The transcript or typed notes. Audio is never stored. Tutors can delete it (set null).
  transcript text check (char_length(transcript) <= 20000),
  draft_json jsonb,   -- what the AI drafted (kept for quality checks)
  final_json jsonb,   -- what the tutor sent
  -- The note mentioned wellbeing/safety and that content was left out. Shown to the tutor only.
  sensitive_omitted boolean not null default false,
  langs text[] not null default array['en'] check (langs <@ array['en', 'zh-CN'] and cardinality(langs) between 1 and 2),
  sent_at timestamptz,
  sent_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (session_id, tutor_id) references public.tutor_sessions (id, tutor_id) on delete cascade
);
create index tutor_reports_tutor_idx on public.tutor_reports (tutor_id, created_at desc);

create table public.tutor_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutors (id) on delete cascade,
  invoice_id uuid not null,
  session_id uuid,
  position smallint not null default 0,
  description text not null check (char_length(btrim(description)) between 1 and 200),
  qty numeric(7, 2) not null check (qty > 0),
  unit_cents integer not null check (unit_cents >= 0),
  amount_cents integer not null check (amount_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (invoice_id, tutor_id) references public.tutor_invoices (id, tutor_id) on delete cascade,
  foreign key (session_id, tutor_id) references public.tutor_sessions (id, tutor_id) on delete restrict
);
-- A session is billed at most once.
create unique index tutor_invoice_lines_session_idx on public.tutor_invoice_lines (session_id) where session_id is not null;
create index tutor_invoice_lines_invoice_idx on public.tutor_invoice_lines (invoice_id, position);

-- Cost monitoring and the fair-use cap (spec §7). Written by the server with the service role.
create table public.tutor_usage_events (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutors (id) on delete cascade,
  kind public.tutor_usage_kind not null,
  amount numeric not null check (amount >= 0),
  created_at timestamptz not null default now()
);
create index tutor_usage_events_tutor_idx on public.tutor_usage_events (tutor_id, kind, created_at);
create index tutor_usage_events_created_idx on public.tutor_usage_events (created_at);

-- ---------------------------------------------------------------------------
-- Triggers: updated_at, session status, invoice numbers, guards
-- ---------------------------------------------------------------------------

create trigger set_updated_at before update on public.tutors for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.tutor_families for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.tutor_students for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.tutor_sessions for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.tutor_reports for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.tutor_invoices for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.tutor_invoice_lines for each row execute function private.set_updated_at();

create function private.tutor_session_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.status := case when new.invoice_id is null then 'logged' else 'invoiced' end;
  return new;
end;
$$;
create trigger tutor_session_status before insert or update on public.tutor_sessions
  for each row execute function private.tutor_session_status();

-- Numbers run 1, 2, 3 … per tutor, whatever the client sends. The advisory lock serialises two
-- invoices created at once by the same tutor.
create function private.tutor_invoice_number() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('tutor_invoice_number:' || new.tutor_id::text, 0));
  select coalesce(max(i.number), 0) + 1 into new.number from public.tutor_invoices i where i.tutor_id = new.tutor_id;
  return new;
end;
$$;
create trigger tutor_invoice_number before insert on public.tutor_invoices
  for each row execute function private.tutor_invoice_number();

-- Tutors can't change their own plan, trial or Stripe id.
create function private.guard_tutor_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' then
    if new.id <> old.id or new.plan <> old.plan or new.trial_ends_at <> old.trial_ends_at
       or new.stripe_customer_id is distinct from old.stripe_customer_id or new.created_at <> old.created_at then
      raise exception 'tutors: plan, trial and billing fields are managed by Study Hall' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_tutor_update before update on public.tutors
  for each row execute function private.guard_tutor_update();

-- A sent report is a record of what the parent received: the final version can't change.
-- The transcript can still be deleted.
create function private.guard_tutor_report_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and old.sent_at is not null then
    if new.final_json is distinct from old.final_json or new.sent_at is distinct from old.sent_at
       or new.sent_to is distinct from old.sent_to or new.langs is distinct from old.langs
       or new.draft_json is distinct from old.draft_json or new.session_id <> old.session_id
       or (new.transcript is not null and new.transcript is distinct from old.transcript) then
      raise exception 'tutor_reports: a sent report can''t be changed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_tutor_report_update before update on public.tutor_reports
  for each row execute function private.guard_tutor_report_update();

-- Once an invoice leaves draft, its contents are fixed. Status may move between sent, overdue and
-- paid (mark paid / undo), never back to draft.
create function private.guard_tutor_invoice_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and old.status <> 'draft' then
    if new.family_id <> old.family_id or new.number <> old.number or new.issue_date <> old.issue_date
       or new.due_date <> old.due_date or new.subtotal_cents <> old.subtotal_cents
       or new.gst_cents <> old.gst_cents or new.total_cents <> old.total_cents
       or new.gst_registered <> old.gst_registered or new.seller is distinct from old.seller
       or new.sent_at is distinct from old.sent_at or new.sent_to is distinct from old.sent_to
       or new.status = 'draft' then
      raise exception 'tutor_invoices: a sent invoice can''t be changed' using errcode = '42501';
    end if;
  end if;
  if new.number <> old.number then
    raise exception 'tutor_invoices: numbers can''t change' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger guard_tutor_invoice_update before update on public.tutor_invoices
  for each row execute function private.guard_tutor_invoice_update();

create function private.guard_tutor_invoice_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and old.status <> 'draft' then
    raise exception 'tutor_invoices: only drafts can be deleted' using errcode = '42501';
  end if;
  return old;
end;
$$;
create trigger guard_tutor_invoice_delete before delete on public.tutor_invoices
  for each row execute function private.guard_tutor_invoice_delete();

-- Lines change only while their invoice is a draft.
create function private.guard_tutor_invoice_lines() returns trigger
language plpgsql set search_path = '' as $$
declare
  target uuid := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
  invoice_status public.tutor_invoice_status;
begin
  if current_user = 'authenticated' then
    select i.status into invoice_status from public.tutor_invoices i where i.id = target;
    -- invoice_status is null while the invoice itself is being deleted (cascade): allow that.
    if invoice_status is not null and invoice_status <> 'draft' then
      raise exception 'tutor_invoice_lines: the invoice has been sent' using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger guard_tutor_invoice_lines before insert or update or delete on public.tutor_invoice_lines
  for each row execute function private.guard_tutor_invoice_lines();

-- Billed sessions keep their date, length and rate: they're on an invoice.
create function private.guard_tutor_session_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and old.invoice_id is not null and new.invoice_id is not distinct from old.invoice_id
     and (new.starts_at <> old.starts_at or new.duration_min <> old.duration_min or new.rate_cents <> old.rate_cents
          or new.student_id <> old.student_id) then
    raise exception 'tutor_sessions: this session is on an invoice' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger guard_tutor_session_update before update on public.tutor_sessions
  for each row execute function private.guard_tutor_session_update();

-- ---------------------------------------------------------------------------
-- Invoices: create and edit atomically (security invoker: RLS applies to the caller)
-- ---------------------------------------------------------------------------

-- p_lines: [{ "session_id": uuid|null, "description": text, "qty": number, "unit_cents": int,
--             "amount_cents": int }]. Totals are computed by the app (invoice-math.ts) and checked
-- here against the lines: the sum of line amounts must equal the invoice total.
create function private.check_invoice_totals(p_lines jsonb, p_subtotal integer, p_gst integer, p_total integer)
returns void language plpgsql immutable set search_path = '' as $$
declare
  line_sum bigint;
begin
  select coalesce(sum((l ->> 'amount_cents')::bigint), 0) into line_sum from jsonb_array_elements(p_lines) l;
  if line_sum <> p_total or p_subtotal + p_gst <> p_total then
    raise exception 'invoice totals don''t match the lines' using errcode = '22023';
  end if;
end;
$$;

create function public.tutor_create_invoice(
  p_family_id uuid,
  p_issue_date date,
  p_due_date date,
  p_gst_registered boolean,
  p_lines jsonb,
  p_subtotal_cents integer,
  p_gst_cents integer,
  p_total_cents integer
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  new_id uuid;
  session_ids uuid[];
  claimed integer;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  perform private.check_invoice_totals(p_lines, p_subtotal_cents, p_gst_cents, p_total_cents);

  insert into public.tutor_invoices (tutor_id, family_id, number, issue_date, due_date, gst_registered,
                                     subtotal_cents, gst_cents, total_cents)
  values (me, p_family_id, 0, p_issue_date, p_due_date, p_gst_registered, p_subtotal_cents, p_gst_cents, p_total_cents)
  returning id into new_id;

  insert into public.tutor_invoice_lines (tutor_id, invoice_id, session_id, position, description, qty, unit_cents, amount_cents)
  select me, new_id, nullif(l ->> 'session_id', '')::uuid, (ord - 1)::smallint, l ->> 'description',
         (l ->> 'qty')::numeric, (l ->> 'unit_cents')::integer, (l ->> 'amount_cents')::integer
  from jsonb_array_elements(p_lines) with ordinality as t(l, ord);

  select coalesce(array_agg(nullif(l ->> 'session_id', '')::uuid), '{}') into session_ids
  from jsonb_array_elements(p_lines) l where nullif(l ->> 'session_id', '') is not null;

  -- Claim the sessions: only this tutor's unbilled sessions for this family's students.
  update public.tutor_sessions s set invoice_id = new_id
  where s.id = any(session_ids) and s.invoice_id is null
    and exists (select 1 from public.tutor_students st where st.id = s.student_id and st.family_id = p_family_id);
  get diagnostics claimed = row_count;
  if claimed <> cardinality(session_ids) then
    raise exception 'some sessions are already invoiced or belong to another family' using errcode = '23514';
  end if;
  return new_id;
end;
$$;

-- Replace a draft's lines and totals. Sessions dropped from the lines go back to unbilled.
create function public.tutor_save_invoice(
  p_invoice_id uuid,
  p_issue_date date,
  p_due_date date,
  p_lines jsonb,
  p_subtotal_cents integer,
  p_gst_cents integer,
  p_total_cents integer
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  inv public.tutor_invoices;
  session_ids uuid[];
begin
  select * into inv from public.tutor_invoices i where i.id = p_invoice_id;
  if inv.id is null or inv.tutor_id <> me then
    raise exception 'invoice not found' using errcode = '42501';
  end if;
  if inv.status <> 'draft' then
    raise exception 'only a draft invoice can be edited' using errcode = '42501';
  end if;
  perform private.check_invoice_totals(p_lines, p_subtotal_cents, p_gst_cents, p_total_cents);

  select coalesce(array_agg(nullif(l ->> 'session_id', '')::uuid), '{}') into session_ids
  from jsonb_array_elements(p_lines) l where nullif(l ->> 'session_id', '') is not null;
  -- Lines may only keep sessions already on this invoice.
  if exists (
    select 1 from unnest(session_ids) sid
    where not exists (select 1 from public.tutor_sessions s where s.id = sid and s.invoice_id = p_invoice_id)
  ) then
    raise exception 'a line refers to a session that isn''t on this invoice' using errcode = '23514';
  end if;

  delete from public.tutor_invoice_lines where invoice_id = p_invoice_id;
  insert into public.tutor_invoice_lines (tutor_id, invoice_id, session_id, position, description, qty, unit_cents, amount_cents)
  select me, p_invoice_id, nullif(l ->> 'session_id', '')::uuid, (ord - 1)::smallint, l ->> 'description',
         (l ->> 'qty')::numeric, (l ->> 'unit_cents')::integer, (l ->> 'amount_cents')::integer
  from jsonb_array_elements(p_lines) with ordinality as t(l, ord);

  update public.tutor_sessions s set invoice_id = null
  where s.invoice_id = p_invoice_id and not (s.id = any(session_ids));

  update public.tutor_invoices
  set issue_date = p_issue_date, due_date = p_due_date,
      subtotal_cents = p_subtotal_cents, gst_cents = p_gst_cents, total_cents = p_total_cents
  where id = p_invoice_id;
end;
$$;

revoke execute on function public.tutor_create_invoice(uuid, date, date, boolean, jsonb, integer, integer, integer) from public, anon;
revoke execute on function public.tutor_save_invoice(uuid, date, date, jsonb, integer, integer, integer) from public, anon;
grant execute on function public.tutor_create_invoice(uuid, date, date, boolean, jsonb, integer, integer, integer) to authenticated;
grant execute on function public.tutor_save_invoice(uuid, date, date, jsonb, integer, integer, integer) to authenticated;
revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Grants and row-level security
-- ---------------------------------------------------------------------------

revoke all on public.tutors, public.tutor_families, public.tutor_students, public.tutor_sessions,
  public.tutor_reports, public.tutor_invoices, public.tutor_invoice_lines, public.tutor_usage_events from anon;
grant select, update on public.tutors to authenticated; -- rows are created by the server at sign-up
grant select, insert, update, delete on public.tutor_families, public.tutor_students, public.tutor_sessions,
  public.tutor_reports, public.tutor_invoices, public.tutor_invoice_lines to authenticated;
grant select on public.tutor_usage_events to authenticated;
grant all on public.tutors, public.tutor_families, public.tutor_students, public.tutor_sessions,
  public.tutor_reports, public.tutor_invoices, public.tutor_invoice_lines, public.tutor_usage_events to service_role;

alter table public.tutors enable row level security;
alter table public.tutor_families enable row level security;
alter table public.tutor_students enable row level security;
alter table public.tutor_sessions enable row level security;
alter table public.tutor_reports enable row level security;
alter table public.tutor_invoices enable row level security;
alter table public.tutor_invoice_lines enable row level security;
alter table public.tutor_usage_events enable row level security;

create policy "tutors read own row" on public.tutors
  for select to authenticated using (id = (select auth.uid()));
create policy "tutors update own row" on public.tutors
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "admins read org tutors" on public.tutors
  for select to authenticated using (private.is_org_admin(private.profile_org(id)));

create policy "tutors manage own families" on public.tutor_families
  for all to authenticated using (tutor_id = (select auth.uid())) with check (tutor_id = (select auth.uid()));
create policy "tutors manage own students" on public.tutor_students
  for all to authenticated using (tutor_id = (select auth.uid())) with check (tutor_id = (select auth.uid()));
create policy "tutors manage own sessions" on public.tutor_sessions
  for all to authenticated using (tutor_id = (select auth.uid())) with check (tutor_id = (select auth.uid()));
create policy "tutors manage own reports" on public.tutor_reports
  for all to authenticated using (tutor_id = (select auth.uid())) with check (tutor_id = (select auth.uid()));
create policy "tutors manage own invoices" on public.tutor_invoices
  for all to authenticated using (tutor_id = (select auth.uid())) with check (tutor_id = (select auth.uid()));
create policy "tutors manage own invoice lines" on public.tutor_invoice_lines
  for all to authenticated using (tutor_id = (select auth.uid())) with check (tutor_id = (select auth.uid()));

create policy "tutors read own usage" on public.tutor_usage_events
  for select to authenticated using (tutor_id = (select auth.uid()));
create policy "admins read org usage" on public.tutor_usage_events
  for select to authenticated using (private.is_org_admin(private.profile_org(tutor_id)));
