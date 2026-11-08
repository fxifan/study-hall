# Next steps between lessons (tutors)

From the tutor homepage proposal (owner picked Hero B + the list layout, 8 Nov 2026; mockup in
`study-hall/design-preview/tutor-homepage.html`). Build the signed-in screen first, so the public
homepage can later show the real experience.

## Version 1 (built): tutor-only

- **Before your next lesson** sits at the top of the tutor dashboard (`/app`): the next three
  students with a scheduled lesson, soonest first. Each row shows when, the student, their current
  next step, a status chip and a one-line **Start here**.
- The tutor sets a next step (up to 300 characters, optional due date, defaulting to the lesson
  day) and marks progress: Hasn't started, Started, Done or Stuck, with an optional note such as
  where the student got stuck.
- **Start here** is plain wording from the status and note (`startHere()` in
  `src/lib/tutor/next-steps.ts`), not AI.
- In version 1 nothing reached the student or parent (see version 2).

Data: `tutor_tasks` (migration `20261108054057_tutor_tasks.sql`). The newest row per student is
the current next step; older rows are history. Same ownership and RLS as the other `tutor_*` tables.

## Version 2 (built): students link their own account

Owner decisions, 8 Nov 2026: no plan needed for tutor features (groups, friends and AI practice still
need one); tutors never see study minutes; no email to parents; build linking before Hero B.

- **Invite:** on a student's page (`/app/students/<id>`) the tutor creates an invite link
  (`/link/<token>`, works once). The page says exactly what the tutor will and won't see.
  Signed out, "Create a free account" or "I already have an account" keeps the invite in the
  `edumi_tutor_link` cookie through sign-up or login; the student accepts on **My tutor**.
- **My tutor** (`/student/tutor`, free): each linked tutor's current next step, "How did you go?"
  (not started, started, done, stuck) and a note, sent with "Tell <tutor>". A study timer that
  counts towards no group. Paid pages send an expired student here instead of the plan page.
  Linked students' unfinished next steps also show on Groups.
- **Tutor:** the dashboard shows "reported by Alex" when the student updated progress, and
  "sees this on Edumi" for linked students. Either side can unlink.
- **Rules:** link fields (`link_token`, `linked_profile_id`, `linked_at`) are written only by the
  server; a database trigger rejects tutors writing them. Students 13+ only (Edumi accounts are 13+).
- Data: `tutor_students` link columns and `tutor_tasks.updated_by`
  (`20261108063210_tutor_student_links.sql`).
- **Public page:** `/tutors` now leads with Hero B and a three-step "between lessons" section.

## Later

1. Draft the next step from the voice recap's homework; add task progress to parent updates.
2. Replace the Hero B illustration with a real screenshot once tutors use it.

## Tests

- Unit: `src/lib/tutor/next-steps.test.ts`.
- Database: `tests/rls/tutor-isolation.test.ts` (tutor_tasks is isolated per tutor; only the server can link).
- Browser: `tests/e2e/tutor.spec.ts` ("before your next lesson"), `tests/e2e/tutor-link.spec.ts`
  (invite, accept with an expired trial, report stuck, solo timer, link works once, unlink).
