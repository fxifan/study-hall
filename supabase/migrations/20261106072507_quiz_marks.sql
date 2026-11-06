-- Quizzes pay the marks a student earns (owner, 6 Nov 2026). A "marks" ledger row is written per
-- attempt for the improvement on the student's best for that quiz, so a lineage can have several;
-- "completion" (notes and flashcards) stays once per lineage. attempt_id makes a retried submit
-- award nothing twice. Attempts keep each question's marks and feedback.
alter table public.points_ledger drop constraint points_ledger_kind_check;
alter table public.points_ledger add constraint points_ledger_kind_check check (kind in ('completion', 'score70', 'score90', 'marks'));
alter table public.points_ledger drop constraint points_ledger_profile_id_lineage_id_kind_key;
create unique index points_ledger_once_idx on public.points_ledger (profile_id, lineage_id, kind) where kind <> 'marks';
alter table public.points_ledger add column attempt_id uuid unique references public.resource_attempts (id) on delete set null;
alter table public.resource_attempts add column results jsonb;
