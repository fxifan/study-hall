# UI refresh and the always-counting timer

From the UI refresh and study timer brief (12 Nov 2026). Mockup: `study-hall/design-preview/ui-refresh-timer.html`.

## Timer rule (built)

The study timer is an honour-based log. It counts from **Start** until the student presses **Pause** or **Finish**, whatever tab or app they're in.

- Switching tabs, hiding the page, locking the phone or not touching the mouse never pauses it. (Before this change, all of those paused it, and 10 minutes without a heartbeat ended the session.)
- Each open Edumi tab sends a heartbeat every 30 seconds, whether it's visible or not. A heartbeat only means "Edumi is open somewhere"; it never starts or stops time.
- **Away for up to 2 hours** (Edumi not open anywhere): that time counts automatically.
- **Away for over 2 hours:** the session stays open, but time after the last heartbeat isn't added to groups or ranks. On return, the student chooses: *Count until I left Edumi*, *I studied the whole time*, or *Pick when I stopped*. Then they either *Finish session* or *Keep going from now* (the gap isn't counted).
- **Over 6 hours at Finish:** the student confirms (*Keep* or *I stopped at…*).
- **No return within 24 hours:** the session is closed at the last heartbeat.
- Starting a new session while one is waiting on the question closes the old one at the last heartbeat.
- "Studying now" in a group shows only running timers that aren't waiting on the question.

Data: `study_sessions` (start, state, last heartbeat) and `study_intervals` (one piece per Start/Resume → Pause/Finish), which is the session/segment model the brief asked for. No schema change. Totals for history, groups and ranks all come from the same intervals.

Code: `src/lib/social/credit.ts` (rules: `openEnd`, `trimTo`, `clampEnd`, the constants), `src/lib/social/server.ts` (`beat`, `setPaused`, `resolveAway`, `finishSession`), `src/app/[lang]/student/_social/study-timer.tsx`.

Tests: unit tests in `src/lib/social/social.test.ts` ("timer rules"), browser test in `tests/e2e/timer.spec.ts`.

## Visual refresh (built)

- **Bottom bar** on phones: Home · Groups · **Study** (raised middle button) · Practice · Me, with line icons. The same five as pills on wider screens. Friends sit inside Groups behind a Groups / Friends switch.
- **Home** (`/student/home`, where students land after login): one dark "Continue studying" card with a single action (start the next task, or open the running timer), the streak card, up to two group goals, and today's tasks (open solo task, tutors' next steps, yesterday's "tomorrow" line).
- **Study** (`/student/solo`): a mode switch (Solo, or a group), a large clock inside a ring that fills towards today's goal, Pause / Finish, and the note that the timer keeps running across tabs. The check-in result is kept in the URL so a background refresh can't wipe it.
- **Group page:** today's shared goal first with large numbers, a "Studying now" strip, then "Who's helped today / this week" with a bar per member and neutral wording ("Not yet"), then chat; help, invite, members and settings in the side column.

Not built: the mockup's recent-activity feed, a separate leaderboard tab (it's a section on the group page), and new colour tokens (the existing Tiles sage is the accent).
