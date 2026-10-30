# Comprehensive brief: audit and phase plan

Source: the owner's "Comprehensive Product, Pricing, Bilingual Reporting & Landing-Page Implementation
Brief" (30 Oct 2026). It supersedes earlier briefs where they conflict: the tutoring plan is A$149/week
with **one hour of tutoring per session attended**, not A$79 with a tutor for the whole session.

## Phase 0: audit (state at commit `38280ac`)

| Brief area | What exists | Gap |
| --- | --- | --- |
| Public internal notes | 6 "Owner to confirm" notes on the landing page (recording, academic-help scope, billing/GST, cancelled sessions, supervisor background, contact email) and 4 `[Owner to …]` notes in the privacy draft | Resolved in Phase 1 |
| Contact | `CHILD_SAFETY_CONTACT_EMAIL` env var, unset, so the page showed a note | Phase 1: `src/lib/contact.ts` |
| Pricing source | `plans` table is the single source for the landing page, sign-up, Checkout and the parent page. Stripe is **test mode only**; `getStripe()` refuses live keys. Test prices: A$49 and A$79 | Phase 1: A$149 plan |
| Cancellation | Customer Portal cancels at the end of the paid period; access is removed when Stripe ends the subscription | Matches the policy |
| First-week refund | No in-app flow; a refund is a manual Stripe dashboard action | Owner decision 5 |
| GST | Stripe charges the flat plan amount; prices have no tax behaviour and Stripe Tax is off, so receipts don't show a GST line | Owner decision 7 |
| Localisation | en / zh dictionaries, `/zh` routes, language switch and cookie | Reuse in Phases 2–3 |
| Report cards | Only the landing-page sample (`_landing/sample-report.tsx`, English, with copy-as-text). Parent dashboard reports and report generation aren't built yet (spec Phase 2) | Phase 2 |
| Parent emails | No app-sent parent emails. Supabase Auth sends sign-up and login links (template in the Supabase dashboard, English, built-in mailer). Stripe may send receipts from its own settings. Report emails aren't built | Phase 3 |
| Tutoring entitlement | `sessions.tutor_id` (WWCC-gated), help-request priority, staff roster with subjects | Nothing schedules or records a one-hour tutoring period per attendance (Phase 4) |
| Subject scope | `subjects` (51 rows) records what students take; no flag for which subjects get help; tutors' subjects aren't recorded | Scope published in Phase 1; staffing by subject is operational |
| Motion | `landing-effects.tsx` (IntersectionObserver) and CSS pen-stroke reveals, already behind `prefers-reduced-motion` and `scripting: enabled`. The `web-design-engineer` skill is available here | Phase 5 |
| Metrics page | Not built | Out of scope until it exists |

## Phase 1: public copy, policies and pricing (done)

- Removed every public owner note (landing component, styles and copy) and the privacy draft's
  bracketed notes; an e2e test fails if "Owner to", TODO or TBC reach a public page.
- Contact `feifanwork1@gmail.com` in the safety section, footer, FAQ (new "How do I contact Study
  Hall?"), sign-up terms and privacy draft (now version `2026-10-draft-3`).
- GST, cancellation and refund wording on the pricing section, plan cards, comparison table, FAQ,
  sign-up "Before you pay" and checkout summary, and the parent billing line.
- Plans: "Supervised Study" A$49 (renamed, same Stripe price) and a new "Study + Tutoring" A$149 plan
  with its own test-mode Stripe price. The A$79 plan is inactive (no real subscribers had it). The
  tutoring limit sits next to the A$149 price and button; a comparison table follows the brief.
- Academic-help subjects (VCE and Years 7–10) on the landing page, FAQ, sign-up and the parent
  subjects form, with the note that help depends on the rostered supervisor.
- Supervisor background in the qualified form ("Our supervisor team currently includes medical
  students with years of tutoring and teaching experience"); no university is named.
- Hero, how-it-works and plan explanations rewritten to the brief's positioning.

## Owner answers (30 Oct 2026), applied

1. All supervisors are current medical students with years of tutoring and teaching experience: the
   site now says so without qualification.
2. Tutoring hour: no in-app booking. When a parent asks, the supervisor schedules the hour within the
   session. The plan copy and FAQ say so (requests go to the contact email).
3. Refunds: within 7 days of the first payment; none after that.
4. Tutoring format: one-to-one, **in the main session room** with the supervisor and other students
   present (the owner's choice after the first answer, private one-to-one video, was flagged against the
   child-safety rule). Never a private call or a breakout with one adult. Landing, sign-up, student
   page and privacy draft (`2026-10-draft-5`) say so.
5. Not registered for GST: every GST mention is removed from prices, sign-up and billing.
6. Study Hall-cancelled sessions: families booked into that session get a credit to attend another
   one (FAQ). Credits are handled by hand; the app doesn't track them. The privacy notice names the
   operator: Feifan Wu, sole trader (no ABN shown).
7. The Simplified Chinese copy is approved.

## Phase 2: report-card localisation (done)

- `src/lib/report-card.ts`: one structured report (date, attendance, goals, observations, supervisor
  comment) with plain-text output. Labels live in the `reportCard` dictionary (en, zh). Anything a
  person wrote is shown as written; only fixed demo text carries both languages.
- Landing sample (`_landing/sample-data.ts`, `sample-report.tsx`): the brief's fictional "Alex" report
  with an English / 简体中文 switch that changes the whole sample (labels, statuses, controls, copy as
  text) without a reload. Labelled fictional in both languages; the hero sheet follows the page
  language. The brief's 120-minute session is shown as 110 of 240 minutes, to match real sessions.
- Parent page: "Session reports" for the last two weeks, built from recorded attendance and goals
  plus the supervisor's comment once a report is approved (`src/lib/parent-reports.ts`), with the
  same language switch and copy as text (`src/components/report-cards.tsx`). RLS limits it to the
  parent's own children; e2e tests cover both families.
- No schema change. Supervisor focus flags aren't shown to parents yet: parents can't read them, and
  they belong in reports once the supervisor review step exists (spec Phase 2).

## Phase 3: bilingual parent emails (done)

Inventory of automated emails:

| Email | Sent by | Status |
| --- | --- | --- |
| Sign-up confirmation (parent) | Supabase Auth, "Confirm signup" template | Bilingual template generated; **paste into the dashboard** |
| Login link (parents; also student invites after payment and supervisor invites) | Supabase Auth, "Magic Link" template | Bilingual template generated; **paste into the dashboard** |
| Session report and absence note | The app | Bilingual template built (`reportEmail`); sending isn't built yet (spec Phase 2) |
| Receipts, failed payments, subscription notices | Stripe, if turned on in Stripe's email settings | Stripe can't put two languages in one email; owner decision |
| Welcome, reminders, weekly summaries, cancellation confirmations | — | Not sent by Study Hall today |

- `src/lib/email/bilingual.ts`: one layout for every email: the complete English version, a separator,
  then the complete Simplified Chinese version; table HTML with inline styles and a plain-text
  alternative; every value is HTML-escaped.
- `src/lib/email/templates.ts`: `authEmail("login" | "signup")` and `reportEmail(report, origin)`.
  Copy is in the `emails` and `reportCard` dictionaries; the contact address is the same constant in
  both languages. Goals and supervisor notes appear as written in both parts.
- `npm run emails` writes `supabase/templates/magic_link.html` and `confirmation.html` and prints
  their subjects; `-- --preview` also writes every email to `email-previews/` (gitignored). Nothing is
  sent.
- The templates link to `{{ .RedirectTo }}?token_hash=…&type=email`, which works on any device. If
  Supabase falls back to the Site URL, the proxy forwards the token to `/auth/confirm`.

Manual step for the owner: in Supabase, Authentication > Email Templates, paste
`supabase/templates/confirmation.html` into "Confirm signup" and `magic_link.html` into "Magic Link",
with the subjects in `supabase/config.toml`.

## Plan for later phases (each needs the owner's go-ahead)
- **Phase 4, tutoring hour.** Per the owner, scheduling stays manual. Optional: let the supervisor
  record the hour on the session roster so it can appear on the parent report.
- **Phase 5, motion.** Extend the existing IntersectionObserver reveals to section headings, steps,
  plan cards and the sample report, CSS only, behind the same reduced-motion and scripting guards.

## Owner decisions still needed

1. Live Stripe isn't set up. Test mode matches A$49 and A$149; live prices must match before launch.
2. How long data is kept after a subscription ends, for the privacy notice.
3. Zoom or Meet room settings (cloud recording off, who can record or share): the app can't enforce
   these, so "Study Hall doesn't record" covers the app only.
4. Child-safety escalation process beyond the contact email.
5. Parent report emails and the supervisor's report review aren't built yet (spec Phase 2), though
   the landing page describes them. The bilingual email template for them is ready.
7. Stripe's own customer emails (receipts, failed payments): leave them on in English, or turn them off
   and have Study Hall send bilingual ones later.
6. Which supervisors cover which subjects isn't recorded in the app.
