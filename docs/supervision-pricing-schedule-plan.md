# Supervision, pricing, work evidence and session blocks

Source: the owner's "Supervision, Pricing, Work Evidence, and Session Scheduling Updates" brief
(30 Oct 2026). What changed, and what the owner still needs to decide.

## Done

- **Positioning.** Public copy now calls the service supervised study sessions that help students
  stay engaged and accountable. "The supervisor watches the room" became "a supervisor is in the
  room" / "runs the room and checks in"; no copy describes check-in frequency or claims continuous
  monitoring. Supervised Study is "structured independent study with a supervisor checking in" and
  "doesn't include tutoring"; Study + Tutoring keeps its confirmed rule (one hour of one-to-one
  tutoring per session attended, in the main room, scheduled on request).
- **Prices.** New plans: Supervised Study A$99/week and Study + Tutoring A$199/week, each with a
  **Stripe test-mode** price (`npm run stripe:setup`). The A$49, A$79 and A$149 plans are closed to
  new sign-ups; the one test-mode subscription on A$149 keeps that price. Every price shown comes
  from the `plans` table, so the landing page, comparison table, sign-up and parent page agree.
- **Checklist and evidence.** See the README. Uploads are optional, private, type- and size-checked
  (JPG, PNG, WebP, PDF; 10 MB; three per task), and named by a random id in storage. Reports and the
  report email label student-marked progress, uploads ("Study Hall hasn't checked or marked it")
  and supervisor check-ins separately. No webcam recording, screen capture or AI monitoring.
- **Session blocks.** The timetable families see is read from active schedules, and the student page
  shows the current or next block when there are several a day. Admins can add blocks (inactive by
  default). The live schedule is **unchanged (4:00–8:00pm)**: the 4–6pm / 7–9pm blocks are a
  proposal, not switched on.
- **Domain and email.** Nothing bought; contact stays `feifanwork1@gmail.com` (`src/lib/contact.ts`).

## Owner decisions

1. **Stripe.** Only test mode is set up. Before going live, create live prices of A$99 and A$199 to
   match, and decide whether the A$149 test subscriber should move to A$199.
2. **Tutoring hour in a two-hour block.** "One hour per session attended" would be half of a two-hour
   block. Confirm that's intended before switching to two-hour blocks.
3. **Switching to two-hour blocks.** In `/admin/schedule`: change the 4:00–8:00pm rule to
   4:00–6:00pm, add 7:00–9:00pm (tick Active), then generate sessions. Already-generated 4–8pm
   sessions stay until cancelled on the same page; nothing is migrated automatically. Students are
   enrolled in every block (there's no booking step), so each block shows as its own session.
4. **Booking specific blocks.** Not built (no booking system exists); decide if families should pick
   blocks rather than being enrolled in all of them.
5. **Retention of uploaded work.** No rule exists. Decide how long uploads are kept (they're deleted
   with the student today, and on request).
6. **Final session times**, once the trial shows what suits families.
7. **Zoom automation.** The owner's school Zoom login can't make a Server-to-Server OAuth app, so
   "Create Zoom meeting" stays unconnected; paste meeting links into rooms. The code is ready if a
   Zoom account that allows it turns up.
8. **Report emails** are manual (`/admin/reports`). Automatic sending needs a verified sending domain.
