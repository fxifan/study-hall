# Product events

Server-side analytics events (coding action plan §2, §6). Stored in `public.product_events`
(service role only; no client access). Written by `track()` in `src/lib/events.ts`, always after
the action succeeded. Read by `/admin/analytics`.

## Rules

- **Properties are operational metadata only**: ids, statuses, plan, language, counts, reasons.
  An allow-list in `track()` drops anything else. Never names, emails, notes, transcripts, report
  or invoice content.
- **Once only**: events with a `dedupe_key` (unique) count once, however often a retry, refresh or
  webhook replays the action.
- **Test data**: `is_test` is set for test accounts (`*.test`, `example.com`) and for events about
  test students. Dashboards exclude it.
- **Never blocks the user**: if the insert fails, it's logged and the action carries on.

## Catalogue

| Event | Product | Fires when | Dedupe |
| --- | --- | --- | --- |
| `user_signed_up` | study_hall / tutors | Tutor account created; parent's first login link (account created by it) | per user |
| `user_logged_in` | all | A login link was completed | none (each login) |
| `onboarding_completed` | study_hall | Parent reached Stripe Checkout after details and consents | per parent |
| `subscription_started` | study_hall / tutors | Stripe subscription active | per subscription |
| `subscription_cancelled` | study_hall / tutors | Stripe subscription ended | per subscription |
| `payment_failed` | study_hall / tutors | Subscription past due or unpaid | per subscription per period |
| `student_goal_created` | study_hall | Student saved a task in their session plan | per session, student, position |
| `study_session_attended` / `study_session_missed` | study_hall | Supervisor set attendance | per session and student |
| `parent_report_approved` | study_hall | Supervisor approved a session report | per session and student |
| `parent_report_delivered` | study_hall | Admin marked the report sent | per session and student |
| `student_record_created` | tutors | Tutor added a student | per student |
| `voice_note_uploaded` | tutors | Voice note received | none |
| `transcription_completed` / `transcription_failed` | tutors | Transcription finished or failed | none |
| `lesson_report_generated` / `lesson_report_failed` | tutors | AI draft produced or failed | per report (success) |
| `lesson_report_approved` | tutors | Tutor sent or shared a report (approval happens at send) | per report |
| `invoice_generated` | tutors | Tutor created an invoice | per invoice |
| `invoice_sent` | tutors | Invoice emailed or marked sent | per invoice |
| `resource_generated` | tutors | Practice set or writing tips generated | per resource |
| `study_group_created` | platform | A student created a study group | none |
| `study_group_joined` | platform | A student joined a group with an invite code | none |
| `study_session_started` | platform | A verified study timer started | per session |
| `study_session_stopped` | platform | A study timer stopped (`seconds` credited) | per session |
| `help_requested` | platform | A student called out for help (`kind`, `via`) | none |
| `help_accepted` | platform | A member accepted a help request | none |
| `help_resolved` | platform | The requester marked it sorted | none |
| `message_reported` | platform | A student reported a group message | none |
| `student_resource_generated` | platform | A student generated notes, flashcards or a quiz (`kind`) | none |
| `student_resource_completed` | platform | Notes or flashcards marked done | per resource |
| `student_resource_flagged` | platform | A student flagged generated content | none |
| `quiz_submitted` | platform | A quiz was marked (`count`, `status` scored or practice) | none |

## Not tracked yet (needs product work first)

- Parent enquiries and trial bookings: there's no enquiry or trial-booking flow.
- Support requests: support is by email, with no ticketing.
- Demo video views and CTA clicks: no demo video is published yet.
- Report edits before sending: needs a draft-versus-final comparison.
