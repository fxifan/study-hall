import { SUPPORT_EMAIL, TUTOR_PRODUCT_NAME } from "./config";

/**
 * Placeholder legal pages for the tutor product (spec §6). DRAFTS: the founders must review them
 * (ideally with a lawyer) before launch. "[Owner to confirm: …]" marks open points; LegalBody
 * highlights them. Light markdown, as in content/legal.
 */
export const TUTOR_LEGAL_VERSION = "2026-11-draft-1";

export const TUTOR_PRIVACY = `## Who we are

${TUTOR_PRODUCT_NAME} is run by Study Hall (operator: Feifan Wu, sole trader). Contact: ${SUPPORT_EMAIL}. This policy is written to follow the Australian Privacy Principles (APPs) in the Privacy Act 1988. [Owner to confirm: legal entity, ABN and postal address.]

## What we collect

- About you (the tutor): your name, email, business name, ABN, GST status, hourly rates, report language preferences, and bank account name, BSB and account number for your invoices.
- About the families you teach, entered by you: parent name and email, report language, and rate.
- About students, entered by you: first name, last initial, year level, subjects and optional private notes. We don't collect dates of birth, photos, addresses or phone numbers for students, and we ask you not to enter them.
- Session records: date, time, length, rate, subjects, your voice-note transcript or typed notes, the AI draft and the report you sent.
- Usage records: how many minutes were transcribed, how much AI processing was used, and how many emails were sent, to run the service and its fair-use limit.

## Voice notes

Voice notes are sent to our transcription provider and deleted as soon as they're transcribed. We never store the audio. Transcripts are kept with the report so you can check it; you can delete a transcript at any time.

## How we use it

- To transcribe your notes, draft reports for you to check, send reports and invoices you choose to send, and remind families of overdue invoices if you leave reminders on.
- Nothing is sent to a parent until you tap Send.
- If a note mentions a student's wellbeing or safety, that content is left out of the parent report and shown only to you. We don't review it or report it to anyone.
- We don't sell personal information or use it for advertising.

## Who we share it with (service providers)

- Supabase (database and sign-in), hosted in Sydney, Australia.
- Vercel (website hosting), with server functions in Sydney.
- OpenAI (transcription and report drafting). We send the transcript with the student's first name replaced by a placeholder, the subjects and the session length; never parent names or emails. We use API settings that don't store or train on this data. OpenAI may process data outside Australia (including the United States). [Owner to confirm: data processing terms and region.]
- Resend (email delivery), which processes email addresses and email content to deliver reports and invoices, outside Australia. [Owner to confirm.]

## Where it's kept and for how long

Your data is stored in Australia. We keep it while your account is open. [Owner to confirm: how long after an account closes, and backups.] You can delete students, sessions, transcripts and draft invoices yourself; email us to close your account and delete everything.

## Security

Bank details are encrypted before they're stored. Access to your data is limited to you by database-level rules; Study Hall staff see only account and usage totals, not your families, students or reports.

## Your choices

You can ask for a copy of your data, a correction, or deletion at ${SUPPORT_EMAIL}. If you're unhappy with how we handled a privacy issue, contact us first; you can also complain to the Office of the Australian Information Commissioner (OAIC).

## Families and students

You collect families' and students' details for your own tutoring business, and you're responsible for telling families you use ${TUTOR_PRODUCT_NAME} to write reports and invoices. [Owner to confirm: a short notice tutors can give families.]`;

export const TUTOR_TERMS = `## The service

${TUTOR_PRODUCT_NAME} helps independent tutors write session reports for parents and send invoices. It's provided by Study Hall. By signing up you agree to these terms.

## Trial and price

- New accounts get a 14-day free trial with no card.
- After the trial, the Solo plan is A$15 a month. [Owner to confirm: GST treatment of the subscription, billing method and refunds.]
- Solo includes fair use of up to 300 AI drafts a month. We may pause drafting above that until the next month.

## Your responsibilities

- You check every report and invoice before you send it. AI drafts can be wrong; you're responsible for what you send.
- Only enter information you're allowed to, and only what you need. Don't enter students' dates of birth, photos, addresses or phone numbers.
- Reports must be factual. Don't use the service to label, rank or compare students.
- If a student tells you something about their safety, follow the guidance in the app and the law where you work; the service doesn't report anything for you.
- You're responsible for your own tax obligations, including whether you're registered for GST and what your invoices must show. The app follows your settings; it doesn't give tax advice.

## Payments between you and families

Families pay you directly. Study Hall doesn't hold, process or guarantee payments between tutors and families.

## Availability and changes

We aim to keep the service running but don't guarantee it will always be available. We may change these terms with notice by email. [Owner to confirm: governing law (Victoria), limitation of liability, and account termination.]

## Contact

${SUPPORT_EMAIL}`;
