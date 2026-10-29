# Product changes: audit and phase plan

Source brief: `study-hall-product-changes-claude-code.md` (owner, 2026-10-30). Base spec: [spec.md](spec.md).
This plan folds the brief into the spec's remaining build phases so nothing is built twice.

## Audit (state at commit `c6619b2`)

| Brief item | Already in the repo | Gap |
|---|---|---|
| §1–2 Positioning, landing page | Design file `design/landing.html` (hero, how it works, timeline, sample report, house rules, child safety, pricing, FAQ). `/` is a placeholder. | Port to `/` with the brief's positioning; tutoring section; fictional, neutral sample report; FAQ answers the brief's questions; owner TODOs instead of invented policy. |
| §2 Founder section | No verified founder facts anywhere in the repo. | Omitted until the owner supplies facts (decision 5). |
| §2 Trust/privacy | Schema enforces data minimisation; messages can't be deleted (RLS); data hosted in Sydney; no video handling in code. | No `/legal/*` pages; no contact email; WWCC gate, in-app help text and deletion requests aren't built yet (spec Phase 1–2). |
| §3 Plans and pricing | `plans` table with `price_cents`, `days_per_week` (null = unlimited), `active`, `stripe_price_id`. One seeded plan: A$49/week, unlimited Mon–Thu. | Anonymous visitors can't read plans (RLS), so prices would have to be hard-coded. No Stripe yet. Two-day price undecided (decision 1). |
| §4 Academic help | `help_requests` (open/helping/resolved, `claimed_by`), `messages` (append-only, admin-visible), RLS for students/proctors, column guard on proctor updates. | No UI (spec Phase 2). |
| §5 Reports | `reports` (draft/approved/sent/failed, `proctor_comment`), `focus_flags` types, template in spec §4.5. | Generation, approval, sending (spec Phase 2). Spec's sample wording ("Focused all session") is evaluative; brief prefers neutral observations. Weekly summaries are spec Phase 3, so they aren't promised. |
| §6 Chinese readiness | i18n framework: `/zh` routes, dictionaries (`zh` typed against `en`), language switch, date locales. App pages translated. | Landing copy in Chinese; native-speaker review. Reports and email stay English (no auto-translation, per brief). |
| §7 Onboarding trust | Consent table is versioned; nothing pre-ticked anywhere (no forms yet). | Onboarding doesn't exist (spec Phase 1). |
| §8 Capacity | `rooms.capacity` (default 40, admin-editable column). | Not enforced on enrolment; auto-enrol is spec Phase 1. Ratio undecided (decision 8). |
| §9 Metrics | Tables hold attendance, goals, help requests, reports, subscriptions, consents. | Metrics page is spec Phase 2. No acquisition-source field; no onboarding/checkout funnel events. No analytics (keep it that way unless the owner picks a cookieless tool). |

## Phases

Each phase ends with lint, typecheck, unit + RLS + Playwright tests, a production build, a commit, and a report.

### Phase 1A: landing page, positioning and trust (brief Phase 1, now)
- Port `design/landing.html` to `/` and `/zh` with the brief's positioning and copy, centralised in `src/i18n/dictionaries/landing.*.ts`.
- Sections: hero, how it works (set goals / study together / ask for help / review progress), session timeline, what parents receive (fictional, neutral sample report with "participation, not proof of learning"), alongside tutoring, house rules, safety and privacy (incl. the video provider's own data handling), pricing, FAQ (the brief's eight questions), closing CTA.
- Pricing reads active plans from the database (new migration: anonymous read of a few plan columns), so prices live in one place.
- Founder section omitted. Unknown policies shown as visible "Owner to confirm" notes, not invented.
- Sign-up isn't built, so plan buttons say sign-up opens soon instead of linking to a missing route.
- Simplified Chinese landing copy, marked for human review. The sample report stays in English on `/zh` with a note, because real reports are English.

### Phase 1B: sign-up, payment, joining (spec Phase 1 + brief Phase 2, §7, §8)
- Onboarding (spec 4.1) with the pre-checkout explanations from brief §7, unticked consent boxes, versioned house rules and privacy notice stored as records, `/legal/house-rules` and `/legal/privacy` (privacy text from the owner; Chinese legal text not published until reviewed).
- Optional parent `acquisition_source` (WeChat referral, parent referral, social media, other) on onboarding (brief §9).
- Stripe Checkout + webhook + Customer Portal in test mode only; plan comparison driven by `plans`; two-day plan added as a `plans` row once priced (decision 1). Auto-enrolment respects `days_per_week`.
- Session generation cron; auto-enrol enforces `rooms.capacity` with tests (brief §8); WWCC gate on `sessions.proctor_id`.
- Student page: goals, Join, timer, help-request button with the brief's scope wording and request status (open / being handled / resolved).
- Admin: rooms (capacity), schedule, plans (revalidate the landing page cache on change), proctors.
- Landing: replace "sign-up opens soon" with the real onboarding link.

### Phase 2: proctor, help queue, reports, metrics (spec Phase 2 + brief Phase 3, §5, §9)
- Proctor dashboard with help queue and logged text messages; "no private 1:1 video" rule shown.
- Report generation using neutral observation wording that matches the landing sample; approval, auto-send, absent notice, copy-as-text. Reports stay English unless the owner approves translation.
- Metrics page split into acquisition (onboarding started), conversion (checkout completed, paying families), activation (first attended session), retention (renewals, cancellations), plus attendance, goal completion, help requests per session and status, report delivery. Only from collected data; no guesses for missing values.

### Launch checklist (brief Phase 5 and earlier notes)
- Landing claims that depend on later phases must be true before launch: WWCC gate (1B), in-app help text (2), Stripe billing and cancellation (1B), email reports (2), deletion requests handled within 30 days (process + contact email).
- No "Owner to confirm" notes left on public pages.
- Native-speaker review of all Chinese copy.
- Rotate the Supabase secret key; set Auth URLs, magic-link template and Resend SMTP on the Sydney project.
- Vercel Pro (commercial use); GST wording (spec §12).

## Owner decisions needed (brief §12)
1. Two-day plan price (proposed A$29–35/week).
2. Academic-help scope and subjects covered.
3. Supervisor qualifications, training, and how many students one supervisor covers.
4. Cancellation timing, refunds beyond "first week refundable on request" (spec §12), missed and cancelled sessions.
5. Founder story: names, facts, and whether to mention University of Melbourne medical-student status.
6. Whether to publish the Simplified Chinese marketing copy after review.
7. Service contact email and child-safety escalation contact (`CHILD_SAFETY_CONTACT_EMAIL`).
8. Room capacity (schema default 40) for the supervision promised.
9. Zoom/Meet room settings: cloud recording off, waiting room, who can share screen (so the "not recorded" claim holds).
