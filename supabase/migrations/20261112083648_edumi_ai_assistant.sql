-- EduMi AI study assistant, student MVP (docs/edumi-ai.md, owner-approved 12 Nov 2026).
-- A hint-first chat inside Practice, sold as an A$2.99/month add-on to the student plan.
--
-- Privacy: conversations are the student's own. Only the student (select) and the service role can
-- read them; there is no parent, tutor or supervisor policy, so those roles can't see them.

-- The add-on is a second item on the student's own Stripe subscription. ai_addon_item_id is that
-- subscription item (null = not added); the webhook keeps it in step with Stripe.
alter table public.student_plans
  add column ai_addon_item_id text,
  add column ai_addon_since timestamptz;

-- Assistant replies count against their own daily allowance in the existing usage log.
alter table public.student_ai_usage drop constraint student_ai_usage_kind_check;
alter table public.student_ai_usage
  add constraint student_ai_usage_kind_check check (kind in ('generate', 'regenerate', 'assistant'));

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  subject text check (char_length(subject) <= 80),
  topic text check (char_length(topic) <= 120),
  year_level smallint,
  -- Where it started: the Ask page, a quiz question the student got wrong, or a Home task.
  source text not null default 'ask' check (source in ('ask', 'quiz_mistake', 'task')),
  -- For quiz_mistake: the quiz (student_resources.id) and the 0-based question.
  resource_id uuid references public.student_resources (id) on delete set null,
  question_index smallint check (question_index between 0 and 19),
  -- "Save to Your practice": listed with the student's quizzes, notes and flashcards.
  saved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_conversations_profile_idx on public.ai_conversations (profile_id, updated_at desc);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role text not null check (role in ('student', 'assistant')),
  -- The student's words, or a plain-text version of the reply (used as history for the model).
  body text not null check (char_length(body) between 1 and 6000),
  -- Assistant replies: the structured blocks the chat renders (explain, steps, try, hint …).
  content jsonb,
  feedback smallint check (feedback in (-1, 1)),
  flagged_at timestamptz,
  flag_reason text check (char_length(flag_reason) <= 300),
  model text,
  prompt_version text,
  tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

revoke all on public.ai_conversations, public.ai_messages from anon, authenticated;
grant select on public.ai_conversations, public.ai_messages to authenticated;
grant all on public.ai_conversations, public.ai_messages to service_role;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
create policy "students read own ai conversations" on public.ai_conversations
  for select to authenticated using (profile_id = (select auth.uid()));
create policy "students read own ai messages" on public.ai_messages
  for select to authenticated using (
    exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.profile_id = (select auth.uid()))
  );
