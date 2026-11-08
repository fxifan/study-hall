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
- Nothing reaches the student or parent yet.

Data: `tutor_tasks` (migration `20261108054057_tutor_tasks.sql`). The newest row per student is
the current next step; older rows are history. Same ownership and RLS as the other `tutor_*` tables.

## Later

1. Link a tutor's student to their Edumi account (invite the student accepts; parents for under-13s).
2. Show "From your tutor" in the student's study view; the student marks progress and flags where they're stuck.
3. Draft the next step from the voice recap's homework; add task progress to parent updates.
4. New public homepage (Hero B), recorded from the real flow. Update both privacy notices first.

Open decisions: whether tutor-linked students need a paid plan, whether tutors see study minutes,
under-13s, and AI vs plain "Start here".

## Tests

- Unit: `src/lib/tutor/next-steps.test.ts`.
- Database: `tests/rls/tutor-isolation.test.ts` (tutor_tasks is isolated per tutor).
- Browser: `tests/e2e/tutor.spec.ts`, "before your next lesson".
