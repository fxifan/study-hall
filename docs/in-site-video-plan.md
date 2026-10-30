# In-site video rooms: plan

Status: plan only (30 Oct 2026). No app code, sign-ups or paid services. Prices come from the providers'
public pages on that date (sources at the end). A$ figures use US$1 = A$1.55; check the rate on the day.

The owner asked whether video rooms inside the website could replace the external Zoom or Google Meet
links, so one supervisor can watch several study rooms at once from one screen.

## Recommendation

- **Provider: LiveKit Cloud, "Ship" plan.** Estimated **US$84/month (≈A$130)** at full load (40 students,
  4 h, 4 nights a week, every student attending every night). At 60% attendance it's the US$50 plan fee
  alone (≈A$78). Daily and Zoom Video SDK cost **US$620–680/month (≈A$960–1,060)** at the same load, far
  over the spec's A$200/month cap for all infrastructure.
- Why LiveKit, apart from price:
  - one page can hold one connection per room, so the multi-room view works in one tab (to confirm
    in the spike, §10);
  - recording (Egress) needs a server-side permission that no token will ever carry;
  - per-token publish and subscribe permissions, changeable from the server mid-call;
  - a Sydney region;
  - an open-source server, so all development and the load test run on a laptop with no sign-up.
    The same server is a later self-hosting option if cost or Australian data residency becomes a
    priority.
- **Build it behind a per-room switch** (`external` link or `in_site`). Pilot one room for two weeks
  with the Zoom link kept as a fallback.
- **Students see only staff video by default**, not each other. This is the main cost lever: an
  8-student peer grid roughly triples LiveKit's bandwidth bill (to ≈US$263/month at full load). It also
  means fewer children's camera feeds are seen by other children. Owner decision D4.
- **Not recommended:**
  - Zoom Video SDK: one session per browser tab, so no single-screen multi-room view, and it's 7× the
    cost.
  - Daily: good product, but Daily React can't run several calls on one page, and it's 8× the cost.
  - Self-hosted Jitsi: cheapest on paper, but a sole trader would be running a live child-safety system
    in the 4–8pm window, and its React wrapper is an iframe with little control over the grid.

Owner approval is needed before any of this starts:
- Spec §2 lists "our own video infrastructure (WebRTC, SFU, streaming)" as out of scope, and §10 says
  "external Zoom or Google Meet link per room". A hosted provider runs the media servers, so we still
  build no infrastructure, but the app would now embed live video. Spec §8.1 (no capture or storage)
  is unchanged and is enforced below.
- Any paid sign-up (LiveKit Ship is US$50/month) must be agreed first.

## 1. Usage model

| Item | Full load | 60% attendance |
| --- | --- | --- |
| Student participant-minutes: students × 240 min × 4 nights × 52/12 weeks | 40 → 166,400 | 24 → 99,840 |
| Staff connections: 5 (e.g. 2 supervisors × 2 rooms + 1 tutor) × 240 × 4 × 52/12 | 20,800 | 20,800 |
| **Participant-minutes per month** | **187,200** | **120,640** |

A supervisor watching three rooms counts as three participants, because each room is a separate
connection. Bandwidth matters only for LiveKit, which bills downstream data. Assumptions:
- a student tile at 180p and about 15 fps is ≈150 kbps, so one tile for one 4-hour night is ≈0.27 GB;
- staff download every student tile, and each student downloads one small supervisor tile;
- audio is negligible because mics are muted by default.

| Downstream data per month | Full load | 60% |
| --- | --- | --- |
| Staff-only view (staff see students; students see staff) | ≈375 GB | ≈225 GB |
| Plus an 8-peer grid for each student | ≈1,870 GB | ≈1,120 GB |

## 2. Provider comparison

| | Daily | LiveKit Cloud | Zoom Video SDK | Self-hosted Jitsi |
| --- | --- | --- | --- | --- |
| Price | 10,000 free/month, then US$0.0040 per participant-minute (10k–100k) and US$0.0037 (100k–500k). No bandwidth charge | Ship: US$50/month incl. 150,000 min and 250 GB; then US$0.0005/min and US$0.12/GB. Free "Build": 5,000 min, 100 concurrent | 10,000 free/month, then US$0.0035 per participant-minute | No licence fee. A Sydney or Melbourne VPS, ≈US$40–100/month for 4–8 vCPU (bandwidth allowance to check) |
| **Monthly cost, full load** | ≈US$683 (A$1,058) | ≈US$84 (A$130) staff-only view; ≈US$263 (A$408) with peer grid | ≈US$620 (A$961) | ≈US$40–100 + ops time |
| **Monthly cost, 60%** | ≈US$436 (A$676) | US$50 (A$78); ≈US$155 with peer grid | ≈US$387 (A$600) | same |
| Sydney / AU | Room `geo` property accepts `ap-southeast-2` | Sydney region (`aus`, one site, no in-region redundancy). Region *pinning* only on Scale (US$500+/month). On Ship, Melbourne users normally route to Sydney but can fail over abroad | `geo_regions` JWT claim includes `AU`, set at account level; forum reports of traffic still going through the US | Fully in AU: we pick the server |
| Recording off | Only when `enable_recording` is set on the room or token; never set it. Transcription storage defaults off | Recording is "Egress", which needs the `roomRecord` grant (server-side). Never grant it; nightly check that no egress exists | Cloud recording is a paid add-on plus a host action; don't buy it | Recording needs Jibri, so don't install it. Local recording stays off in `config.js` |
| Breakouts | Built-in only in the Prebuilt UI (beta); custom UI = separate rooms | None built in; separate rooms, created and joined only through our server | Built-in "subsessions" | Built-in, moderator-controlled |
| React SDK | `@daily-co/daily-react` | `@livekit/components-react` + `livekit-client` | `@zoom/videosdk` (+ UI toolkit) | `@jitsi/react-sdk` (iframe) |
| Several rooms in one tab | daily-js ≥ 0.67 with `allowMultipleCallInstances`; **not in Daily React**; Daily says multiple instances "often indicates a bug" | Each `Room` is an independent connection (verify in spike) | **No**: one session per browser tab | One heavy iframe per room |
| Hidden participants | `hasPresence: false` exists: never use | `hidden` grant exists: never grant | n/a | n/a |
| Verdict | Over budget; multi-room is off the supported path | **Recommended** | Ruled out by one-session-per-tab | Only if fully AU-hosted media becomes a hard requirement; LiveKit self-hosted is the better route to that |

Not compared: Agora, 100ms, Amazon Chime SDK, Whereby Embedded. These can be added if the owner wants.

## 3. How it fits the app

### Joining

Today: the Join button calls `check_in` (`supabase/migrations/20261029213052_phase_1b_foundations.sql`).
That records attendance and returns `rooms.video_url`, and the student goes to Zoom in a new tab.
`src/app/api/sessions/[id]/join/route.ts` does the redirect.

With in-site video:
1. The student opens `/student/session/[id]/room`. It shows a camera preview with a "hands and desk"
   framing guide and joins muted.
2. The page asks our server for a room pass (`POST /api/video/token`). The server calls a new
   security-definer RPC that runs the same checks as `check_in` (active student, enrolled, doors open,
   at least one goal), records check-in, and returns the room key and the role.
3. The server signs a short-lived LiveKit token with the API secret, which only Vercel holds. The token
   carries the role's permissions (§5.4). Identity is the profile UUID; the display name is
   "Ava B."; no email or other details go to LiveKit.
4. The browser connects. Staff follow the same path, but the RPC checks staff rules (§5.3).

### Webhooks and presence

LiveKit's signed webhooks (`participant_joined`, `participant_left`, `egress_started`) go to
`POST /api/video/webhook`. It verifies the signature and writes a small presence log. The occupancy
guard (§5.2) runs on each event.

### Proposed schema (one migration, Phase V1)

- `rooms.video_mode` (`external` | `in_site`, default `external`). `video_url` becomes nullable and is
  required only for `external`. The comment in the core schema ("This app never hosts … video") is
  reworded, because the app now *embeds* a provider's room.
- Provider room names are derived and never shown: `sh-<session_id>` for the main room and
  `sh-<session_id>-b<n>` for breakouts. No shareable links exist.
- `video_presence(session_id, room_key, profile_id, role, joined_at, left_at)`:
  - written only by the webhook (service role);
  - readable by that session's staff and admins; not by students or parents;
  - deleted after a short retention period (D9).
- `breakouts(id, session_id, room_key, purpose [group_help | tutoring], help_request_id, created_by,
  started_at, ended_at, end_reason)` and `breakout_members(breakout_id, profile_id, role)`.
- Supervision limits (D1–D3) as org settings, checked by a trigger alongside `enforce_wwcc` (§6).

Next.js 16 notes:
- token and webhook endpoints are Route Handlers; the webhook reads the raw body for its signature;
- moderation (mute, remove, start or end a breakout) runs as Server Actions that call LiveKit's server
  API, so no client ever holds admin rights;
- video UI is client components only;
- `vercel.json` already pins `syd1`;
- read `node_modules/next/dist/docs/` before writing code (AGENTS.md).

## 4. Supervisor multi-room view

New page `/proctor/live`: every room the supervisor is assigned to tonight (`sessions.proctor_id` or
`tutor_id` overlapping now), on one screen. The browser opens one connection per room.

```
┌ Room 1 · Years 11–12 · 12/14 in · ● 2 help ┐┌ Room 2 · Years 9–10 · 9/10 in ┐┌ Help queue (all rooms) ───┐
│ [Ava B.][Leo M.][Noah T.][....] tiles      ││ [....]                          ││ ★ Ava B. · Methods · 3m   │
│  Yr 12   cam off 3:12   ✋                  ││                                 ││   Leo M. · Chem · 1m      │
│ Not joined: Mia K. (late at 4:10)          ││ Left: Sam P. 6:41pm             ││ [Reply] [Group help room] │
└────────────────────────────────────────────┘└─────────────────────────────────┘└───────────────────────────┘
 Selected: Ava B. — goals ✓ ~ ·, flags [off_camera] [phone_visible] [chatting] [great_focus], note, thread
```

- **Tiles:**
  - students publish at most 360p and 15 fps with simulcast;
  - the grid takes the lowest layer (≈180p) through LiveKit's adaptive stream;
  - clicking a tile switches it to the higher layer in a side panel;
  - tiles are live video only, never snapshots (§5.1);
  - each tile shows name, year, and badges: help raised, camera off with a timer, late, reconnecting.
- **Who's present** combines three sources:
  - enrolments (expected);
  - `attendance` (checked in or out);
  - the live participant list (connected, camera on or off).

  States: not joined · in room, camera on · in room, camera off *m:ss* · reconnecting · left *time*.
- **Camera off for 5 minutes** (house rule) comes from track mute or unpublish events. That's metadata,
  not image analysis, so it stays within "no AI focus detection". The supervisor decides whether to flag
  or remove the student; the app only nudges.
- **Focus flags** are the existing one-tap buttons (`focus_flags`) in the side panel: no modals, keyboard
  friendly (spec §4.4).
- **Audio:** supervisors push-to-talk to one room or to all their rooms. Student mics start muted.
  Staff can mute a student through the server but can never unmute them, only ask.
- **Help requests:**
  - the queue is shared across the supervisor's rooms, ordered by `priority` (tutoring plan first), then
    age; it updates through Supabase Realtime on `help_requests`, filtered by RLS;
  - "Reply" opens the logged text thread (`messages`);
  - "Group help room" creates a breakout under the rules in §5.2.
- **Roster:** `/proctor/session/[id]` stays the per-session detail page (subjects, study notes,
  tutoring flag, and later attendance confirmation and report approval). The live view links to it.
  Attendance confirmation is still a person's decision, pre-filled from check-in and presence.
- **Attendance:**
  - check-in happens when the room pass is issued, as now;
  - check-out happens on the Leave button (as now), or when the webhook sees a student gone for more
    than 3 minutes without rejoining (network blips don't count);
  - rejoining clears `check_out_at`, as `check_in` already does;
  - reports keep using `attendance`. `video_presence` only fills gaps and feeds the guard.
- **Supervisor drops out:** the room shows "Supervisor reconnecting". If no cleared adult is back within
  2 minutes, admins are alerted (D7).
- **Laptop limits:** decoding 30–45 small tiles over three connections should be fine on a recent laptop.
  The spike measures it. The tile count per screen also caps the ratio (D1).

## 5. Child-safety rules in code

### 5.1 No recording or image capture

Provider:
- no token ever has `roomRecord`, `roomAdmin`, `roomCreate` or `hidden`;
- the LiveKit API key and secret exist only in Vercel server env;
- no Egress, Ingress or Agents are configured;
- the webhook raises an admin alert and ends the room on any `egress_started`;
- a nightly job lists egresses and fails loudly if any exist.

Our code:
- an ESLint rule bans `MediaRecorder`, `ImageCapture`, `captureStream`, and canvas `toDataURL` /
  `toBlob` / `drawImage` on video in `src/`, backed by a CI grep test;
- no background-blur or other frame processors are installed;
- thumbnails are the live low-resolution layer, never stored frames.

Browser:
- `Permissions-Policy: display-capture=()` on student pages if students may not share their screen (D5);
- a CSP limits `connect-src` / `media-src` to our origin, Supabase and LiveKit;
- no analytics on video pages (spec §8.8).

Limit to state plainly: no website can stop someone screenshotting or photographing their own screen.
The house rules and a staff code of conduct forbid it; the privacy notice says so.

### 5.2 An adult is never alone on video with a student

Rule, checked for every provider room (main and breakout): **if a room has exactly one cleared adult
and exactly one student, staff media in that room is cut.** Otherwise, any adult present needs at
least two students or a second adult.

1. **Issuing passes.** The server won't issue a breakout pass to an adult until two students, or a
   second adult, are connected in that breakout. The adult joins last and is removed first. Creating a
   breakout requires two or more students or a named second adult.
2. **Fast guard in the browser.** Roles come from token attributes the server sets
   (`canUpdateOwnMetadata` is false, so they can't be spoofed). The staff client counts participants
   by role. When the count hits the forbidden state, the client immediately stops subscribing to that
   student and stops publishing to that room. The supervisor sees "Paused: only one student here".
3. **Server guard as backstop.** On every join or leave webhook, the server re-reads the participant
   list from LiveKit's API (not a webhook count, which can arrive out of order). If the state is
   forbidden, it calls `UpdateParticipant` to remove the adult's publish and subscribe rights in that
   room, or ends the breakout and sends the student back to the main room. It also writes `audit_log`
   and alerts admins if the client guard didn't fire first.
4. **Main rooms too.** The same rule covers the first arrival at 3:50pm and the last student at 7:58pm.
   Default: staff media pauses until a second student arrives or another adult joins. The alternative
   is moving the lone student into another of the same supervisor's rooms (D6).
5. **No invisible adults.** Staff are always listed and shown. LiveKit's `hidden` grant (and Daily's
   `hasPresence: false`) are never used, so a "watching quietly" connection can't happen.
6. **Text help** stays in `messages`: logged, admin-visible, not deletable by staff (spec §8.4). The
   provider's in-call chat and data channel are off (`canPublishData: false`), so no unlogged
   adult–student text exists.

Tests:
- unit tests for the rule function (every count combination);
- database tests for the pass RPC (no breakout pass for an adult while only one student is there);
- Playwright with Chromium fake camera devices against a local LiveKit server: a breakout drops to one
  student, and the adult's tracks are unsubscribed within 2 seconds.

### 5.3 Only WWCC-verified staff join as staff

- The staff pass RPC requires all of the following:
  - `profiles.role` is proctor or admin;
  - assigned to that session (`proctor_id` or `tutor_id`), or an admin;
  - `private.assert_cleared()` passes for today's Melbourne date. That function already backs the
    `enforce_wwcc` trigger: verified and not expired.
- **Admins need a verified WWCC too** to join as staff. They're adults on video with children.
- Passes last ≤ 10 minutes. LiveKit's docs say a removal holds for 10 minutes on Cloud, so longer TTLs
  would let a removed person back in. The app refreshes them by re-running the checks.
- When an admin un-verifies a check or ends an assignment, the same action removes that person from any
  live room through the server API.
- Parents never get passes. Each staff pass issued is written to `audit_log`.

### 5.4 Permissions by role (LiveKit terms)

| | Student | Staff | Our server |
| --- | --- | --- | --- |
| Join | own session's room only (and a breakout they've been placed in) | rooms of their assigned sessions | — |
| Publish | camera, microphone (`canPublishSources`) | camera, microphone; screen share if D5 allows | — |
| Data channel / chat | no | no (use logged app messages) | — |
| Subscribe | staff tracks only: auto-subscribe off, plus publisher permissions limited to staff identities (unless D4 allows peers) | everyone in the room | — |
| Change own metadata | no | no | sets roles in token attributes |
| `hidden`, `roomRecord`, `roomCreate` | never | never | `roomRecord` never used; room admin through the server API for mute, remove, permissions |

## 6. Supervision ratios: owner decides

The app can enforce whatever the owner picks. A trigger next to `enforce_wwcc` refuses a supervisor
assignment that would break the limits, the same way the WWCC gate works now. Suggested starting values
are only suggestions. The spec's physical-room benchmark is about 40 students per adult, but watching
small tiles is harder than watching a room.

| # | Decision | Options | Suggestion |
| --- | --- | --- | --- |
| D1 | Max students per supervisor, all rooms combined | 15 / 20 / 25 / 30 / 40 | Start at 25; review after the pilot using help-response time and camera-off follow-up |
| D2 | Max rooms per supervisor | 2 / 3 / 4 | 3 |
| D3 | Room size | min 2 (safety rule); max 10 / 12 / 15 | max 12, so tiles stay legible |
| D7 | Second adult on duty | always / when >N students / only for breakouts and tutoring | One floating adult (tutor or admin) each evening: covers breakouts, tutoring and supervisor drop-outs |
| — | Does the tutor count toward the ratio? | yes / no | No: the tutor is helping, not supervising |
| — | Supervisor equipment | laptop / laptop + external monitor | Laptop + monitor for 3 rooms |

## 7. Privacy notice and house rules

Both are versioned records. Changing them triggers re-consent (spec §7). The re-consent flow was
deferred in Phase 1B and must be built before these versions go live. Proposed wording for the owner to
review (not applied; the privacy draft has uncommitted edits from another session):

**`content/legal/privacy-draft.md`**
- *The video room* (replaces the Zoom/Meet paragraph): "Sessions run in a video room inside the Study
  Hall website, provided by LiveKit, using its servers in Sydney. Only enrolled students and Study Hall
  staff with a verified Working with Children Check can join, using a pass the website issues for that
  session. Video and audio travel live and are not recorded or stored by Study Hall or LiveKit;
  recording is switched off for every room. Staff see students' cameras live to supervise. [Students
  see staff video only. | Students also see other students in their room.] LiveKit receives your
  child's display name (first name and last initial), an anonymous ID, their IP address and device and
  connection-quality data, under its own privacy terms."
- *What we collect*: add "when your child's video connection started and ended in each session, used for
  attendance and safety checks and deleted after [N] days."
- *What we don't collect*: add "We don't take snapshots of the video. We can't stop someone photographing
  their own screen, so our house rules forbid recording or photographing a session."
- *Where it's stored*: replace "Zoom or Google Meet" with LiveKit. Add an overseas-disclosure line if
  LiveKit keeps account, analytics or quality logs outside Australia. It's a US company; confirm with
  them before publishing.
- *Child safety*: add "The website enforces this: a staff member's video pauses automatically if they
  would otherwise be alone with one student, and staff can't join a room without being seen."

**`content/legal/house-rules.md`**
- "Join only through the Study Hall website, with your own login."
- "Don't record, screenshot or photograph the session, other students or staff."
- "You join with your mic off. Unmute only when the supervisor asks." (now the default, not just a rule)
- "Use a laptop, desktop or tablet; your phone stays face-down in the camera frame." (D8)
- "If you're the only student in your room, the supervisor's video pauses until someone else joins."
- "Help happens by text in the app, or in a help room with at least one other student or a second
  adult."

Also: a staff code of conduct (not public), acknowledged each term. It forbids recording, screenshots,
personal contact and one-to-one video. The Children's Online Privacy Code (OAIC, due by 10 Dec 2026)
should be checked against this design once it's registered.

## 8. Phased build

Each phase ends like the others in the repo: lint, typecheck, unit, database and Playwright tests, a
production build, a commit and a report.

| Phase | What | Cost | Done when |
| --- | --- | --- | --- |
| V0 Decisions + spike | Owner answers D1–D9. Prototype the multi-room grid against the open-source LiveKit server on a laptop (`livekit-server --dev`), with ~40 simulated publishers (`lk load-test` or Playwright fake cameras). Measure supervisor CPU and bandwidth per tile; confirm several `Room`s on one page | Free, no sign-up | Numbers recorded in this doc; decisions answered |
| V1 Data + passes | Migration (§3); staff and student pass RPCs; token and webhook route handlers; occupancy rule function; ratio trigger; `rooms.video_mode` switch | Free (local server) | Database and unit tests prove: no pass without enrolment, goals and an open session; no staff pass without a valid WWCC; no adult breakout pass with one student |
| V2 Student room | `/student/session/[id]/room`: preview, framing guide, join muted, timer, "I'm stuck", Leave. Student permissions per §5.4 | Free | Playwright: the seeded student joins a local room, check-in is recorded, the student can't see other students (unless D4) |
| V3 Supervisor live view | `/proctor/live` (§4), Realtime help queue, presence-based check-out, camera-off timers, browser and server occupancy guards, mute and remove through the server | Free | Playwright: 3 rooms on one page; a lone-student room pauses staff media within 2 s; a dropped supervisor alerts admins |
| V4 Breakouts | Group help room from a help request; observed tutoring only if D10 approves it; auto-end when unsafe | Free | Tests for every unsafe transition |
| V5 Pilot and switch-over | Re-consent flow, new privacy and house-rule versions, staff code, CSP and Permissions-Policy, nightly no-recording check. **Ask the owner, then sign up for LiveKit Cloud Ship (US$50/month)**; pilot one room for two weeks with the Zoom link as fallback; then switch rooms one at a time | US$50–85/month | Two pilot weeks without an unsafe-state alert or a lost session; owner signs off |

A one-room pilot (10 students × 4 h × 4 nights ≈ 41,600 minutes/month) is past the free Build tier's
5,000 minutes, so real students need the paid plan.

## 9. Owner decisions

1. Approve the scope change (spec §2 out-of-scope list and the §10 video row) and the provider
   (LiveKit Cloud). Approve the US$50/month sign-up when V5 starts.
2. Budget: at full load LiveKit is ≈A$130 of the A$200 cap, leaving ≈A$70 for Vercel, Supabase and
   Resend. That's tight if Vercel Pro and Supabase Pro are both paid. At 40 students the subscriptions
   bring in ≈A$8,500/month, so the cap may be worth revisiting.
3. D1–D3, D7: ratios (§6).
4. D4: can students see each other? Default no (privacy and cost).
5. D5: can students share their screen (e.g. to show working in a help room)? Default no.
6. D6: lone student in a room: pause staff media (default) or move them to another room.
7. D7: what happens when a supervisor drops out: who covers, and whether student video stays visible
   to peers meanwhile (only relevant if D4 is yes).
8. D8: allowed devices (laptop, desktop, tablet; phones?). School-managed Chromebooks may block camera
   access or third-party domains. Check with a few families.
9. D9: how long the presence log is kept (suggest 30 days).
10. D10: a safe format for one-to-one tutoring (open owner decision 1 in
    `comprehensive-brief-plan.md`). In-site video makes an **observed breakout** possible: tutor and
    student in a breakout, with the supervisor connected, visible to both and able to hear. The server
    ends it the moment the supervisor isn't connected. Whether that counts as "a second adult present"
    under the child-safety rule is the owner's call; take advice first. Until then, tutoring stays in
    the main room.

## 10. Risks and checks for the spike

- **Several `Room`s in one tab** isn't stated in LiveKit's docs. If it fails, fall back to one
  connection per room in separate tabs (still no Zoom) or a single room with subscription groups. The
  single room is less safe, because a permission mistake leaks video across groups.
- **Region:**
  - LiveKit's Sydney region is a single site; on Ship, an outage there fails over abroad;
  - only Scale (US$500+/month) can pin traffic to Australia;
  - metadata and billing data are likely held in the US.

  Disclose both in the privacy notice, or self-host later.
- **Restrictive networks** (school or home firewalls): LiveKit Cloud includes TURN over TLS; test from
  a school-managed device.
- **Vendor change:** keep provider calls behind one server module (`src/lib/video/`) and one client
  hook, so Daily or a self-hosted server stays a swap rather than a rewrite.
- **Cost drift:** a usage alert at 150,000 minutes and 250 GB in the LiveKit dashboard, plus a monthly
  check in `/admin/metrics` once it exists.

## Sources (read 30 Oct 2026)

- Daily pricing: https://www.daily.co/pricing/video-sdk/
- Daily room properties (`geo`, `enable_recording`, `enable_breakout_rooms`): https://docs.daily.co/reference/rest-api/rooms/create-room
- Daily multiple call instances: https://docs.daily.co/reference/daily-js/daily-call-client/multi-instance-guide
- LiveKit Cloud pricing: https://livekit.com/pricing
- LiveKit regions and region pinning: https://docs.livekit.io/deploy/admin/regions/region-pinning
- LiveKit tokens and grants: https://docs.livekit.io/frontends/reference/tokens-grants
- Zoom Video SDK rates: https://explore.zoom.us/docs/en-us/video-sdk-rates.html
- Zoom Video SDK sessions (one session per tab): https://developers.zoom.us/docs/video-sdk/web/sessions/
- Zoom Video SDK auth (`geo_regions`): https://developers.zoom.us/docs/video-sdk/auth/
- Jitsi configuration (breakout rooms, recording): https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-configuration/
