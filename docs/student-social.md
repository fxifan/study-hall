# Edumi for students: study with your friends

Edumi's core product (owner, 6 Nov 2026). Brief: `edumi-study-hall-claude-code.md`. Schema: `supabase/migrations/20261106055736_student_social.sql`.

## Owner decisions

- Students 13+ sign themselves up at `/join` (birth month and year age gate). Under-13s join only through a parent, who switches on "Study groups" per child on `/parent`.
- Full group chat, with report and block for students and moderation on `/admin/edumi`.
- Student plan: A$11.99/month, paid by the student (`/student/plan`) or a parent (shared link `/pay/[token]`). Families on a Study Hall plan are covered.
- Free trial (owner, 8 Nov 2026): 7 days, started in Stripe Checkout with a card (`payment_method_collection: always`, `trial_period_days: 7`), then billed monthly unless cancelled. After sign-up and login the student lands on `/student/plan` ("Start my free trial"); without a plan row they have no paid features (`Access.kind = "none"`). Students on an older no-card trial keep its end date if they add a card. One trial per student. Tutors work the same way: 14 days via `/app/start`. Tutor-linked features stay free.
- AI practice: 2 quizzes of 8 questions a day, plus 4 notes or flashcard sets a day.
- Edumi for students isn't linked to Study Hall (owner, 6 Nov 2026): no group bookings. Families on a Study Hall plan still get it included.
- Uni and TAFE students can sign up (year level 13 = "University or TAFE"); minimum age stays 13.
- Quizzes: 8 questions mixing multiple choice and free response, from chosen Victorian Curriculum or VCE points (or the student's own topic). Free responses are marked by AI against a rubric written for the curriculum point; points equal marks earned, and retakes pay only the improvement on the best. Notes and flashcards pay 10 when finished. Daily cap 60.
- Login emails are personal (name, what's waiting) and sent through Resend (`src/lib/email/login.ts`); without `RESEND_API_KEY` they fall back to Supabase's mailer.
- Admin analytics has an "Edumi students" tab.

## Defaults chosen (change if needed)

- Group and friend discovery is invite-code only; friend requests only between students who share a group.
- The web timer counts only on Edumi group and practice pages, while the tab is visible and the student was active in the last 5 minutes. External or self-reported time isn't offered.
- Tiers: Starter 0, Bronze 50, Silver 150, Gold 400, Platinum 800, Diamond 1500. Daily cap 60 points.
- Groups: up to 12 members; invites last 7 days, 20 uses.
- Friends board uses Melbourne time.
- Muting a group stores the preference; Edumi has no push notifications yet, so it changes nothing else today.

## How credit works

- Heartbeats every 30 s from the study screen report `active` (visible, not idle, not paused). The server opens or closes `study_intervals`; a gap longer than 75 s closes the open interval at the last heartbeat. A session with no heartbeat for 10 minutes is stopped (`timeout`). Logic: `src/lib/social/credit.ts` (`planBeat`), applied in `src/lib/social/server.ts` (`beat`).
- One live session per student (unique index), shared by all their devices. One interval open per session (unique index). Stops and retries are idempotent.
- The group snapshot is taken at start; leaving the group stops the session (`left_group`).
- Group day: the group's IANA timezone (default Australia/Melbourne). Totals are interval overlaps with the local-day window, so sessions crossing midnight split correctly. Targets are snapshotted per day in `group_day_targets`; edits go to `next_target_minutes` and apply the next day.
- One "X just started studying" event per session (`study_sessions.announced`), only if the student shares their status.
- Day-end recap: once per group day (`group_recaps` primary key), posted lazily when a member opens the group and by the daily cron `/api/cron/edumi`. Joint standouts on ties; no award without activity; only members who opted in to the spotlight.

## Privacy and access

- Every write goes through Server Actions that check the student and their group membership. Chat inserts use the student's own client, so the RLS insert policy (member, not suspended, text only) applies. Realtime only delivers rows the student can read under RLS.
- Quiz answer keys live in `student_resource_keys` (service role only) and are returned only after a submission is marked.
- Parent pages (`/pay/[token]`, `/book/[token]`) show the student's first name, the plan or session, and the price. Never chats, scores or boards.

## Not built yet

- Push or email notifications (and so the effect of muting).
- Automatic deletion for self-signed students whose plan ended (families and tutors already have a 7-day rule).

## Tests

- Unit: `src/lib/social/social.test.ts` (the brief's acceptance scenarios for credit, midnight split, ties, points).
- End to end: `tests/e2e/student-social.spec.ts` (age gate, sign-up, invite, realtime chat, timer start event, help request, outsider access, server-marked quiz). Run the dev server with `TUTOR_RESOURCES_OFFLINE=1`.
