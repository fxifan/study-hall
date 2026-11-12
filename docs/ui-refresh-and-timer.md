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

## Visual refresh (mocked, not built)

Bottom bar Home · Groups · Study · Practice · Me; timer-centred Study screen; group goal before ranking. Waiting on a decision to build.
