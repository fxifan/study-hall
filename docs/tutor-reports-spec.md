# Tutor session reports + billing (MVP inside Study Hall)

Working name in the app: **Study Hall for Tutors** (`TUTOR_PRODUCT_NAME` in `src/lib/tutor/config.ts`).
This file records the founders' brief (2 Nov 2026), their answers to its open questions, and how the
build maps onto it. Section numbers (§) in code comments refer to the brief's sections below.

## The brief, in short

Independent tutors in Australia (first Melbourne and Sydney, many teaching Chinese-speaking families)
finish a session, speak for about 60 seconds, and get: (1) a factual parent report in English and/or
Simplified Chinese, ready to email or paste into WeChat/WhatsApp; (2) the session logged; (3) the
session on that family's next invoice. Budget: ≤ A$200/month total infrastructure at ~500 tutors.

- §3 Scope: tutor account, students and families, log a session (voice ≤ 3 min or typed), review and
  send (never auto-send), copy as text, report history, invoices (draft/sent/paid/overdue, PDF, one
  overdue reminder), our subscription. Out of scope: scheduler, parent logins, centres, native apps,
  lesson content, any rating of students.
- §4 Reports: factual, not evaluative; fixed order (Session · Covered · Went well · Next focus ·
  Homework · Tutor note); under 120 words per language; grounded only in the note; empty sections
  omitted; structured JSON; Chinese translated from the JSON, not re-summarised; every field editable;
  draft and final both stored.
- §5 Data model, §6 privacy/safety/compliance, §7 cost guardrails, §8 pages, §9 milestones,
  §10 engineering rules (Zod, RLS with isolation tests, vendors only server-side).

## Founders' answers (§11)

| Question | Answer | What was built |
| --- | --- | --- |
| 1. Name and domain | Build the MVP inside Study Hall | Routes in this app: `/tutors` (landing), `/app/*` (tutor app), `/admin/costs` |
| 2. Stripe Connect or bank transfer | Advertise the price, don't link Stripe | Bank transfer only; `src/lib/payments.ts` returns no payment link. Solo (A$15/month) is advertised; founders switch tutors to Solo at `/admin/costs` |
| 3. Sending domain | Don't worry yet | Sent from `REPORTS_FROM_EMAIL` as "‹Tutor› via Study Hall", Reply-To the tutor |
| 4. Free plan limits | 14 days free instead of a report count | 14-day trial, then drafting, sending and invoicing pause until Solo. Fair use (300 AI drafts/month) applies to every plan |
| 5. Shared report code | Reuse what you can | Same repo, so imported directly: the bilingual email layout (`src/lib/email/bilingual.ts`, generalised to 1–2 languages and a brand line), copy-to-clipboard hook, time helpers, auth/roles, report wording rules (ported into the prompt) |

## Decisions made while building (review these)

- **New role `tutor`** (`profiles.role`), home `/app`. Study Hall's existing room tutors stay `proctor`.
  Sign-up creates the account server-side with `app_metadata.role = tutor`; an email already used by a
  Study Hall family or staff account is refused.
- **Tables are prefixed `tutor_`** because Study Hall already has `students`, `sessions` and `reports`.
  `tutors.id` is the user id (the brief's `user_id`). Every table has `tutor_id`; child rows use
  composite foreign keys so they can't reference another tutor's rows.
- **GST**: rates are treated as GST-inclusive (consumer pricing). GST-registered → "Tax invoice" with
  ABN and GST = round(total ÷ 11); otherwise "Invoice", no GST line. The GST flag is snapshotted per
  invoice. Confirm with the ATO / an accountant.
- **PDFs are rendered on demand** (`/api/tutor/invoices/[id]/pdf`) from the invoice row and a `seller`
  snapshot taken at send time, instead of storing files. Built-in PDF fonts are Latin-only: a parent
  name in Chinese characters is replaced by their email in "Bill to".
- **Encryption** uses Node's AES-256-GCM (`TUTOR_DATA_KEY`) rather than libsodium: same guarantee, no
  new dependency.
- **Audio is never stored**: it's streamed to transcription and discarded, which satisfies "delete
  immediately after transcription" by construction. Transcripts are kept; tutors can delete them.
- **Vendors**: OpenAI for both transcription (`gpt-4o-mini-transcribe`) and drafting (`gpt-4.1-mini`,
  overridable), one key and one processor to disclose. The model sees the note with the student's
  first name replaced by `[STUDENT]`; no parent names or emails.
- **Grounding**: the model must quote the note for every item; items whose quote isn't in the note are
  dropped (and counted for the tutor). Labels, comparisons with other students and mark/ATAR
  predictions are dropped. Notes too short to draft from skip the model entirely.
- **Sensitive disclosures**: a keyword screen (English + Chinese) plus the model's flag. Such content is
  dropped from every section; the tutor sees a private notice linking to `/app/guidance` (draft
  guidance with Australian helplines, for founders to review). Nothing is escalated.
- **Tutor UI is English only** (like Study Hall's admin pages); reports and emails are bilingual.
- Google sign-in isn't built: it needs a Google OAuth client configured in Supabase, plus a rule for
  turning an OAuth sign-up into a tutor. Magic link works today.

## Cost estimate per report (check in week 1)

1 minute of `gpt-4o-mini-transcribe` (~US$0.003) + one draft and, for Chinese, one translation
(~1–2k tokens on `gpt-4.1-mini`, ~US$0.001–0.002) + one email ≈ **A$0.007–0.01**, under the A$0.02
target. Real numbers: `/admin/costs` (from `tutor_usage_events`) and `npm run report:eval`.
