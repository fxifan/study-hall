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

## Plan for later phases (each needs the owner's go-ahead)

- **Phase 2, report localisation.** Sample report: move its labels into the landing dictionaries and
  add an English / 简体中文 switch on the sample (client-side, no reload), using the brief's draft
  translations and the fictional "Alex" sample. Parent reports: build on the existing dictionaries and
  language cookie when the parent report view is built; free text (goals, supervisor notes) stays as
  written and is labelled as such. No schema change expected.
- **Phase 3, bilingual emails.** One shared template module (English first, separator, Simplified
  Chinese) with plain-text fallback and HTML escaping, used by report emails when they exist. The
  Supabase Auth templates (sign-up, login) are edited in the Supabase dashboard; the repo keeps the
  source in `supabase/templates/`. Previews only; nothing sent.
- **Phase 4, tutoring hour.** Proposal: a `tutoring_periods` record per attendance (session, student,
  tutor, start, end, status) that the rostered tutor opens and closes from the session roster, shown on
  the parent report; the plan's entitlement is "one per attended session". Needs the owner to decide
  the booking and staffing model first (decisions 2 and 3).
- **Phase 5, motion.** Extend the existing IntersectionObserver reveals to section headings, steps,
  plan cards and the sample report, CSS only, behind the same reduced-motion and scripting guards.

## Owner decisions still needed

1. Does "current medical students with years of tutoring and teaching experience" describe every
   advertised supervisor? Until confirmed, the site says the team "currently includes" them.
2. How the one-hour tutoring period is booked, staffed and recorded. The app doesn't schedule or
   record it yet, so the A$149 plan advertises something the product can't yet show a parent.
3. Whether the tutoring hour is one-to-one (by text) or small-group. The copy assumes neither; private
   one-to-one video stays ruled out.
4. Live Stripe isn't set up. Test mode now matches A$49 and A$149; live prices must be created to match
   before launch.
5. First-week refund conditions: how "the first week" is counted and how a refund is requested
   (currently: email, then a manual Stripe refund).
6. A fluent speaker's review of all Simplified Chinese copy.
7. Policy and implementation gaps:
   - "GST included" is shown as instructed. Confirm Study Hall is registered for GST; if it is, decide
     whether receipts or tax invoices need to show GST (Stripe doesn't itemise it today).
   - Zoom or Meet room settings (cloud recording off, who can record or share): the app can't enforce
     these, so the "Study Hall doesn't record" answer covers the app only.
   - What happens when Study Hall cancels a session (public holidays) and whether it's credited. The
     FAQ no longer asks this question.
   - How long data is kept after a subscription ends, and the legal entity name/ABN, for the privacy
     notice.
   - Child-safety escalation process beyond the contact email.
   - Parent reports and report emails are promised on the landing page but not built yet (spec Phase 2).
   - Which supervisors or tutors cover which subjects isn't recorded in the app.
