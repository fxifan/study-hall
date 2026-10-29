# Study Hall: MVP Build Spec

> **For Claude Code:** Read this whole file before writing code. Build one phase at a time (see "Build phases"), stop at the end of each phase, and summarise what was built and what's untested. Ask before adding any paid service not listed under "Stack and budget". Never build features listed under "Out of scope".

---

## 1. What we're building and why

An **online supervised study hall** for VCE students (Years 9–12, Victoria, Australia).

Students join a group video room on weeknight afternoons, keep their camera on their hands and desk, and study while a human proctor supervises. Parents pay weekly and get a short report every night saying whether their kid showed up, what they planned, and what they finished.

The product replaces the physical after-school "supervised study" room (one adult, ~40 students, ~$25/student-hour). It does not replace the room itself. It sells **parent visibility** and **accountability** at a lower price.

Closest working analogue: Korea's online managed study rooms (e.g. CLUB STUDY), which run on Zoom, check students' proof of work daily, and call no-shows.

**The MVP exists to test one hypothesis:**

> VCE parents will pay at least A$40/week for an online supervised study hall.
> Pass = 15 paying families within 14 days of launch. Fail = pivot to B2B tooling for tuition centres.

So: **build the thinnest software that lets a human run this service well.** Video is outsourced to Zoom or Google Meet. Supervision is human. Software handles sign-up, payment, scheduling, check-in, the proctor's roster, student goals, and nightly parent reports.

---

## 2. Scope

### In scope (MVP)
- Marketing landing page with pricing and sign-up
- Parent accounts, student profiles created by parents, parental consent capture
- Stripe weekly subscription (AUD)
- Recurring session schedule (default Mon–Thu, 4:00–8:00pm Melbourne time)
- Student "Join session" button: records check-in, then redirects to the room's external video link
- Student session goals (set at start, marked at end)
- Proctor dashboard: live roster, attendance, focus flags, notes, help-request queue
- Nightly parent report: generated automatically, emailed, plus a copy-as-text version for WhatsApp/WeChat
- Admin pages: rooms, sessions, proctors (with WWCC verification), students, plans, metrics

### Out of scope (do NOT build)
- Our own video infrastructure (WebRTC, SFU, streaming). Use external Zoom/Meet links only.
- Any recording, storage, or analysis of webcam video or images
- AI focus detection or any computer vision
- Phone-lock or screen-time companion apps
- Native mobile apps (responsive web only)
- Student-to-student messaging, public profiles, leaderboards, social feeds
- Multi-tenant B2B (centres running their own rooms). Design the schema so it's addable later, but don't build it.
- AI tutoring / AI answers to help requests (Phase 3 at the earliest, only if the hypothesis passes)

---

## 3. Users and roles

| Role | Who | Can do |
|---|---|---|
| `parent` | Payer, account owner | Sign up, give consent, add/edit students, manage subscription, read reports |
| `student` | VCE student, often under 16 | View today's session, join, set/complete goals, raise help requests, see own history |
| `proctor` | Tutor supervising a room | See roster for assigned sessions, mark attendance, add flags/notes, handle help requests, approve reports |
| `admin` | Founders | Everything, plus rooms, schedule, plans, proctor verification, metrics |

Students never self-register. A parent creates the student profile and invites the student by email (magic link).

---

## 4. Core flows

### 4.1 Parent sign-up and payment
1. Parent lands on `/`, reads pricing, clicks "Start".
2. Creates account (email magic link).
3. Adds one or more students: first name, last name initial only, year level (9–12), school (optional), student email (for login).
4. Reads and accepts the **House Rules** and **Privacy & Child Safety Notice** (versioned). Store a consent record per student.
5. Chooses a plan → Stripe Checkout (weekly subscription, AUD).
6. On successful payment (Stripe webhook), students become `active` and receive an invite email.
7. Parent manages billing via Stripe Customer Portal (cancel, change card).

### 4.2 Student session
1. Student logs in (magic link) → `/student` shows today's session, the room, the house rules, and a countdown.
2. Doors open 10 min before start. Student enters up to **3 goals** for the session (required before joining; one line each).
3. Clicks **Join** → app records `check_in_at`, then redirects to the room's `video_url` (new tab).
4. During the session the student page shows a block timer (default: 50 min study / 10 min break, configurable per session) and an **"I'm stuck"** button.
5. At 10 min before end, the student is prompted to mark each goal `done` / `partial` / `not done`, with an optional one-line note.
6. Student clicks **Leave** (records `check_out_at`). If they never click it, check-out = session end.

### 4.3 Help requests
1. Student clicks "I'm stuck", picks a subject, writes a short description.
2. Request appears in the proctor's queue (`open` → `helping` → `resolved`).
3. Help is given **only** by:
   - text in the app (all messages logged and visible to admins), or
   - a video breakout room with **2+ students or a second adult present**.
   **Never private 1:1 video between an adult and a student.** Show this rule in the proctor UI.

### 4.4 Proctor dashboard (`/proctor/session/[id]`)
- Roster of enrolled students: name, year level, check-in time, goals.
- Attendance status per student, set by the proctor: `present`, `late`, `left_early`, `absent`. The app pre-fills from check-in data; the proctor confirms what they see on camera.
- One-tap **focus flags** per student, each timestamped: `off_camera`, `phone_visible`, `chatting`, `great_focus`. Optional free-text note.
- Help-request queue with status controls.
- Session-end panel: review each student's auto-drafted report, add an optional one-line proctor comment, and approve. Approved reports send; any not approved within 60 min of session end send automatically without a comment.
- Must work on a laptop beside the Zoom window: dense layout, keyboard-friendly, no modals for flags.

### 4.5 Nightly parent report
Generated per student per session. Sent by email to the parent. A "Copy as text" button on the proctor and admin views gives a plain-text version to paste into WhatsApp/WeChat.

Template (plain, short, factual):

```
{student_first_name}: {weekday} {date}
Attended {check_in}–{check_out} ({minutes} min of {session_minutes})
Goals:
 ✓ {goal 1}
 ~ {goal 2} (partial)
 ✗ {goal 3}
Proctor: {focus summary, e.g. "Focused all session" or "Phone visible twice"} {optional comment}
```

- Absent students: one line saying they didn't attend, sent at session end + 15 min.
- No webcam images, ever. No comparison with other students.
- Parents can switch report frequency to `nightly` (default) or `weekly_summary`.

### 4.6 Admin
- **Rooms:** name, external `video_url`, capacity (default 40), default proctor.
- **Schedule:** recurring rule (days, start, end, timezone) that generates `sessions`; override or cancel individual dates (public holidays, exam weeks).
- **Proctors:** invite; record WWCC number, expiry, and verified date. **A proctor cannot be assigned to a session until WWCC is marked verified and not expired.** Warn 30 days before expiry.
- **Plans:** price, billing interval, days allowed per week (to test 2-day vs unlimited plans), active flag.
- **Students:** search, status, attendance history, consent records.
- **Metrics** (`/admin/metrics`): see section 9.

---

## 5. Data model (Postgres)

All timestamps stored in UTC; display in `Australia/Melbourne`. Include an `org_id` column on core tables (single org for now) so B2B multi-tenancy can be added later.

```
orgs(id, name, created_at)

profiles(id → auth.users, org_id, role[parent|student|proctor|admin], full_name, email, created_at)

students(id, org_id, profile_id → profiles nullable until invite accepted,
         first_name, last_initial, year_level smallint check 7..12, school text null,
         status[invited|active|paused|cancelled], created_at)

parent_students(parent_id → profiles, student_id → students, PRIMARY KEY both)

consents(id, student_id, parent_id, document[house_rules|privacy_child_safety],
         document_version, accepted_at, ip_hash)

plans(id, org_id, name, price_cents int, currency 'AUD', interval[week],
      days_per_week smallint null (null = unlimited), stripe_price_id, active bool)

subscriptions(id, parent_id, plan_id, stripe_customer_id, stripe_subscription_id,
              status, current_period_end, created_at)

rooms(id, org_id, name, video_url, capacity int default 40, default_proctor_id null)

schedules(id, room_id, days_of_week int[], start_time time, end_time time,
          timezone text default 'Australia/Melbourne', block_minutes int default 50,
          break_minutes int default 10, active bool)

sessions(id, room_id, schedule_id null, starts_at, ends_at, proctor_id,
         status[scheduled|live|ended|cancelled])

enrolments(id, session_id, student_id, UNIQUE(session_id, student_id))

attendance(id, session_id, student_id, check_in_at null, check_out_at null,
           status[present|late|left_early|absent|unknown], confirmed_by null, confirmed_at null)

goals(id, session_id, student_id, position smallint 1..3, text varchar(140),
      outcome[done|partial|not_done|null], note varchar(140) null)

focus_flags(id, session_id, student_id, type[off_camera|phone_visible|chatting|great_focus],
            note varchar(200) null, created_by, created_at)

help_requests(id, session_id, student_id, subject, description varchar(500),
              status[open|helping|resolved], claimed_by null, created_at, resolved_at null)

messages(id, help_request_id, sender_id, body varchar(1000), created_at)  -- logged, admin-visible

reports(id, session_id, student_id, body_text, proctor_comment null,
        status[draft|approved|sent|failed], sent_at null, channel[email])

proctor_checks(id, proctor_id, wwcc_number, wwcc_expiry date, verified_at null, verified_by null)

audit_log(id, actor_id, action, entity, entity_id, created_at)
```

### Row-level security (required)
- Parents: read/write only their own students and those students' goals, attendance, and reports.
- Students: read/write only their own goals and help requests; read their own attendance.
- Proctors: read the roster for sessions they're assigned to; write attendance, flags, reports, and help-request status for those sessions only.
- Admins: everything in their org.

Write RLS policies in migrations and add tests that prove cross-family data is not readable.

---

## 6. Routes

```
/                         Landing page (pricing, how it works, house rules, FAQ)
/login                    Magic-link login
/onboarding               Parent: add students → consent → choose plan → Stripe
/parent                   Parent home: students, latest reports, billing link
/parent/student/[id]      Report history and attendance for one student
/student                  Today's session, goals, Join, timer, I'm stuck
/student/history          Own past sessions and goals
/proctor                  Today's assigned sessions
/proctor/session/[id]     Live roster, flags, help queue, report approval
/admin                    Overview
/admin/rooms
/admin/schedule
/admin/proctors
/admin/plans
/admin/students
/admin/metrics
/legal/house-rules        Versioned
/legal/privacy            Versioned (privacy + child safety notice)
/api/stripe/webhook
/api/cron/generate-sessions    Daily: create sessions from schedules 14 days ahead
/api/cron/send-reports         Every 15 min: send due reports
```

---

## 7. House rules (shown at sign-up, before every session, and on `/legal/house-rules`)

- Camera on, framed on your **hands and desk**. Face optional.
- Phone face-down **inside the camera frame** for the whole block.
- Mic muted unless the proctor asks.
- Set up to 3 goals before you join; mark them before you leave.
- Breaks happen together, on the timer.
- The proctor may remove you from the room if you're off camera for more than 5 minutes; your parent's report will say so.

Store the rules text as a versioned record. Changing it requires re-consent on the student's next login.

---

## 8. Child safety and privacy (non-negotiable)

Context: Victoria's Child Safe Standards apply to coaching and tuition services for children. The OAIC's Children's Online Privacy Code is due to be registered by 10 Dec 2026. Australia's under-16 social media restrictions exclude services whose primary purpose is education. Build to these constraints:

1. **No video, image, or audio capture or storage** by this app. Ever.
2. **No private 1:1 video** between an adult and a student (see 4.3). Show the rule in the proctor UI.
3. **WWCC gate:** proctors cannot be assigned without a verified, unexpired WWCC (see 4.6).
4. **All adult–student text messages logged** and visible to admins; no deleting by proctors.
5. **Data minimisation:** students store first name, last initial, year level, optional school. No date of birth, photo, address, or phone number.
6. **Parent-controlled accounts:** a parent creates every student account and records consent first.
7. **No social features:** no student-to-student messaging, profiles, rankings, or feeds. Keeps the product clearly education-primary.
8. **Privacy by default:** no third-party analytics or ad pixels on student-facing pages. Product analytics on the landing page only, cookieless.
9. **Hosting in Australia** where available (database region: Sydney).
10. **Deletion:** a parent can request deletion of a student's data from `/parent`. An admin processes it within 30 days; it's logged in `audit_log`.
11. **Incident path:** `/legal/privacy` lists a child-safety contact email. Admins can flag a session for review.

---

## 9. Metrics (`/admin/metrics`)

These exist to decide the hypothesis. Show them on one page, filterable by date range:

- **Paying families** (active subscriptions), with a daily trend. Target: 15 by day 14.
- **Conversion:** sign-ups started → consent given → paid.
- **Attendance rate:** present or late ÷ enrolled, per week.
- **Days attended per active student per week.** This answers whether families use it daily or 1–2 days.
- **Goal completion rate:** done ÷ goals set.
- **Report delivery:** sent vs failed.
- **Churn:** cancellations per week, with an optional cancellation reason captured in the Stripe portal.
- **Revenue:** weekly AUD.

---

## 10. Stack and budget

Matches the existing Master My Interviews site (Next.js + React) so it can be merged later. Hard cap: **A$200/month total infrastructure.** Expected cost is well under that.

| Concern | Choice | Notes |
|---|---|---|
| App | Next.js (App Router, latest stable), TypeScript, React | Server Actions for mutations |
| UI | Tailwind CSS + shadcn/ui | Accessible, dense proctor layout |
| DB + Auth | Supabase (Postgres, Auth magic links, RLS), Sydney region | Free tier to start; Pro if needed |
| Payments | Stripe Checkout + Billing + Customer Portal, AUD | Webhooks drive subscription state |
| Email | Resend | Free tier should cover early volume |
| Hosting | Vercel | Commercial use needs a paid plan |
| Scheduled jobs | Vercel Cron hitting `/api/cron/*` | Protect with a secret header |
| Video | External Zoom or Google Meet link per room | Free tiers cut group calls at roughly 40–60 min; a 4-hour room needs one paid licence. Verify current pricing. |
| Validation | Zod | All forms and API inputs |
| Tests | Vitest (unit), Playwright (key flows) | |

Rules:
- Provide `.env.example` with every variable. Never commit secrets.
- Database changes via SQL migrations only.
- All dates and times through one helper that handles `Australia/Melbourne`, including DST.

---

## 11. Build phases

Stop after each phase and report: what was built, how to run it, what's untested.

### Phase 0: Foundations
- Scaffold Next.js + TypeScript + Tailwind + shadcn/ui.
- Supabase project config, migrations for the full schema in section 5, RLS policies, seed script (1 org, 1 admin, 1 proctor, 1 room, 1 schedule, 1 plan at A$49/week, 2 test families).
- Auth with magic links; role-based route protection.
- **Done when:** each seeded role logs in and lands on the right home page, and an RLS test proves parent A can't read parent B's students.

### Phase 1: Sign-up, payment, joining (launch-blocking)
- Landing page, onboarding flow, consent records, Stripe Checkout and webhook, Customer Portal link.
- Schedule → sessions cron; auto-enrol active students into sessions their plan allows.
- Student page: goals, Join (check-in + redirect), block timer, Leave.
- Admin: rooms, schedule, plans, proctors with WWCC gate.
- **Done when:** a test parent can pay in Stripe test mode, their student can set goals and join a session via the external link, and check-in shows up in the database.

### Phase 2: Proctor and reports (also launch-blocking)
- Proctor dashboard: roster, attendance confirmation, focus flags, help queue with logged text messages.
- Report generation, proctor approval, auto-send after 60 min, absent-student notice, copy-as-text.
- Parent report history page.
- Admin metrics page.
- **Done when:** a full simulated session (3 students: one present, one late with a phone flag, one absent) produces 3 correct reports, and all 3 are delivered to test inboxes.

### Phase 3: Only if the hypothesis passes (don't start without explicit go-ahead)
- AI first-pass answers on help requests, with tutor escalation
- Weekly parent summary emails with trends
- Multi-tenant mode for tuition centres (B2B)
- Investigate phone-lock via iOS/Android parental-control APIs
- On-device focus signals (privacy review first)

---

## 12. Open decisions (defaults used until changed)

| Decision | Default in this spec |
|---|---|
| Product name | "Study Hall" (working name) |
| Price | A$49/week, unlimited Mon–Thu; a 2-day plan can be added in admin |
| Free trial | None; first week refundable on request |
| Session hours | Mon–Thu 4:00–8:00pm Melbourne |
| Block length | 50 min study / 10 min break |
| Report channel | Email + manual copy-as-text for WhatsApp/WeChat (no WhatsApp API in MVP) |
| Standalone vs inside the MMI site | Standalone repo, same stack, mergeable later |
| GST handling | Confirm with accountant before launch; Stripe Tax optional |
