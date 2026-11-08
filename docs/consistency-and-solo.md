# Rewarding consistency, and solo mode (proposal)

From the 8 Nov 2026 review, finding 1: Edumi promises healthier, consistent study habits, but it
rewards only minutes and quiz marks. It has no personal goal, no streak, no "what to do tomorrow",
and a student without friends on Edumi (or a tutor) has no first useful moment. Mockup:
`study-hall/design-preview/consistency-solo.html`. Proposal only: nothing is built yet.

## The scheme

**1. A personal daily goal.** On first open: "How long can you study on a school day?" 15, 25
(default), 45 or 60 minutes. It can be changed on Me. Group goals stay as they are.

**2. A study day counts when you either:**
- reach your daily goal in verified minutes (solo, group or practice), or
- finish one thing: a quiz submitted, a tutor's next step marked done, or a solo task marked done.

Finishing work counts, not just minutes, so a short productive day isn't a lost day.

**3. Streak, with a rest day.** Days in a row that count. One rest day a week is used
automatically, so one missed day doesn't reset the streak. Shown as seven dots for this week, plus
"12-day streak" (Melbourne days, like the boards).

**4. Points for consistency, inside the existing ranks.**

| Reward | Points |
|---|---|
| A study day (goal met or one thing finished) | +5 |
| A full week (5 study days, Mon–Sun) | +15 bonus |
| Streak milestones (7, 30, 100 days) | badge only, no points |

That's up to 40 a week, alongside quiz marks (up to 60 a day). The daily points cap counts
consistency points separately, so practice can't crowd them out.

**5. Solo mode ("Study solo").**
- On Groups and its empty state: **Study solo** next to Create and Join.
- Pick one task: your tutor's next step, a practice topic, or your own words ("Chem ch. 4 Qs 1–10").
- A timer that counts towards no group (already built for tutor-linked students), with an optional
  25-minute focus block and a 5-minute break.
- At the end: **Done / Partly / Stuck** and a pre-filled **Tomorrow** line ("Finish Qs 6–10").
  Tomorrow's line greets you on your next visit.
- Solo minutes count towards your goal, streak and the Friends board, never towards a group's goal.

**6. Quiet days in groups.** When nobody else is studying, the group page leads with your own goal
and streak ("You're 10 minutes from today's goal") rather than an empty board.

## What it needs

| Piece | Change |
|---|---|
| Daily goal | `student_settings.daily_goal_minutes` (default 25) |
| Solo tasks | New `solo_tasks` table: text, status (done, partly, stuck), tomorrow text, session id |
| Study days and streak | Computed from study intervals, quiz attempts and tutor tasks per Melbourne day. Cache per day in a small `study_days` table |
| Points | Two new ledger kinds: `study_day` (+5) and `full_week` (+15), deduplicated per day or week |
| UI | Streak strip on Groups and Me, Study solo card, end-of-session check-in, Tomorrow card |

Roughly 3–4 days including tests.

## Experiment

Show it to half of new signups for 4 weeks. Measure the share who come back on day 7, study
days per week, and the share of sessions with a task marked done. Keep it if day-7 return is 20% or
more higher than without.
