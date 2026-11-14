# EduMi AI: student study assistant (MVP)

Owner-approved 12 Nov 2026, from the EduMi AI product brief and the approved mockup
(`design/edumi-ai-mockup.html`). This is the brief's stage 1: the student assistant only.
Study Hall and tutor workflows come later.

## What students get

- **Ask EduMi AI** (`/student/practice/ask`): a hint-first chat. It explains at the student's year
  level, gives one similar question to try, checks the answer, and words any likely mistake as a
  suggestion. Quick replies: a hint, another way, test me, the full worked solution.
- **Help me understand my mistake**: on every marked quiz question that lost marks. The server
  builds the context from the stored quiz, its answer key and the student's latest attempt.
- **Entry points**: a "Stuck on something?" tile on Home and a card at the top of Practice.
- **Save to Your practice**: saved chats are listed with quizzes, notes and flashcards.
- **Feedback**: thumbs up or down and "Flag this answer" (wrong, unclear, wrong level, inappropriate)
  on every reply, stored on `ai_messages`.

## The A$2.99/month add-on

- EduMi AI is an add-on to the A$3.99/month student plan, sold as a **second item on the
  student's own Stripe subscription** (price lookup key `edumi-ai-addon-monthly`). It trials with
  the plan and is pro-rated after that. It ends when the plan ends.
- Students add or remove it on the Ask page or on Your plan. The webhook
  (`customer.subscription.updated`) keeps `student_plans.ai_addon_item_id` in step with Stripe.
- Who can add it themselves: a plan the student pays for, with a card (`aiAccess` in
  `src/lib/social/assistant-server.ts`). Parent-paid plans, Study Hall families and older no-card
  trials see what has to happen first. **Not built yet:** adding it from the parent pay link,
  and an add-on for Study Hall families.
- Admins in Student view always have it.

## Limits, cost and privacy

- 20 replies per Melbourne day (`ASSISTANT_DAILY_LIMIT`), logged in `student_ai_usage` with kind
  `assistant` and the token count. A failed reply doesn't count.
- The model is `OPENAI_ASSISTANT_MODEL`, or the report model by default. There's an offline
  stand-in when there's no API key (or `TUTOR_RESOURCES_OFFLINE=1`).
- Messages are capped at 1,500 characters. Only the last 12 messages go back to the model.
  Every reply records its model, `prompt_version` (`assistant-v4`) and tokens.
- Chats are private: RLS lets only the student read them. Parents, tutors and supervisors have no
  access. The student's words are fenced in the prompt, and the rules hold whatever they write.
- Safety: the prompt refuses to write assessed work, says when it's unsure, and points to Kids
  Helpline (1800 55 1800) or 000 if a student says they're unsafe.

## Before launch (from the brief's release gates)

- Run the human-reviewed evaluation set (Years 7–10 Maths, VCE Methods and General, Biology,
  Chemistry, English, Accounting) against `assistant-v4`.
- Privacy and child-safety review for minors; decide on retention for `ai_messages`.
- Run `npm run stripe:setup` in each Stripe mode so the add-on price exists.
