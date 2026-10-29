# Study Hall

Online supervised study hall for VCE students. The build spec is [docs/spec.md](docs/spec.md) and the
landing-page design is [design/landing.html](design/landing.html).

**Status: Phase 0 (Foundations).** Scaffold, database schema with RLS, seed data, magic-link login
and role-based routing. No sign-up, payments, sessions or reports yet (Phases 1–2).

Stack: Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS 4 · shadcn/ui ·
Supabase (Postgres, Auth, RLS) · Zod · Vitest · Playwright.

## Setup

1. **Supabase project.** Create a free project in the **Sydney (ap-southeast-2)** region.
   - Authentication → URL Configuration: Site URL `http://localhost:3000`; add `http://localhost:3000/**`
     to Redirect URLs.
   - Authentication → Emails → Magic Link: paste [supabase/templates/magic_link.html](supabase/templates/magic_link.html)
     so links work when opened on another device. (Without it, links still work in the same browser.)
2. **Env.** `cp .env.example .env.local` and fill in the Supabase section. Never commit `.env.local`.
3. **Install, migrate, seed.**
   ```bash
   npm install
   npm run db:migrate   # applies supabase/migrations to SUPABASE_DB_URL
   npm run db:seed      # 1 org, admin, proctor, tutor, room, schedule, A$49 and A$79/week plans, 2 families
   npm run dev
   ```
   Migrations can also be applied through the Supabase MCP server in [.mcp.json](.mcp.json) (that's
   how the dev project was set up). Local migration filenames match the versions recorded on the
   project, so `supabase db push` and the MCP stay in step.

## Logging in as a seeded account

Seeded emails use `SEED_EMAIL_DOMAIN` (default `studyhall.test`), so they can't receive mail. Print a
one-time login link instead:

```bash
npm run login-link -- parentA
```

| Account    | Role    | Lands on   | Notes                                    |
| ---------- | ------- | ---------- | ---------------------------------------- |
| `admin`    | admin   | `/admin`   |                                          |
| `proctor`  | proctor | `/proctor` | WWCC recorded as verified (test number)  |
| `tutor`    | proctor | `/proctor` | Tom Tutor: the room's default tutor, WWCC verified |
| `parentA`  | parent  | `/parent`  | Family A, tutoring plan: Ava (Year 11), Leo (Year 9, invited, no login) |
| `studentA` | student | `/student` | Ava                                      |
| `parentB`  | parent  | `/parent`  | Family B, supervision plan: Noah (Year 12) |
| `studentB` | student | `/student` | Noah                                     |

Real emailed links work for real addresses, but Supabase's built-in mailer is heavily rate-limited
and only delivers to your project team. Point Supabase Auth at Resend SMTP before launch.

## Tests

```bash
npm test            # unit: Melbourne time helper, including DST changes
npm run test:rls    # RLS against your Supabase project (needs migrate + seed)
npm run test:e2e    # Playwright: each role logs in and lands home (needs seed; first run: npx playwright install chromium)
npm run typecheck && npm run lint
```

## Deployment (Vercel, Hobby plan)

Production: https://study-hall-murex.vercel.app (project `study-hall`, team "feifan's projects").
`vercel.json` pins the Next.js preset and runs functions in Sydney (`syd1`); `.vercelignore` keeps
`.env*` files out of uploads.

The project is connected to GitHub (`fxifan/study-hall`): pushing to `main` deploys production, and
pushing any other branch creates a protected preview (only signed-in team members can open it).
Manual deploys from a local checkout still work:

```bash
vercel deploy --environment preview   # protected preview URL
vercel deploy --prod                  # public production
```

Environment variables on Vercel: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
(Preview + Production), and `NEXT_PUBLIC_SITE_URL` (Production). The secret key isn't needed there
yet. For emailed magic links to work in production, add the production URL to the Supabase
project's Auth > URL Configuration (Site URL and Redirect URLs).

To log in as a seeded account on a deployed site:
`NEXT_PUBLIC_SITE_URL=https://study-hall-murex.vercel.app npm run login-link -- parentA`

## Payments (Stripe, test mode)

Study Hall uses its own Stripe account, in test mode until live payments are approved.

1. Put the account's test secret key in `.env.local` as `STRIPE_SECRET_KEY` (and on Vercel).
2. `npm run stripe:setup` creates a weekly AUD price for each active plan (saved to
   `plans.stripe_price_id`) and the Customer Portal (cancel at the end of the paid week, with a reason).
3. For a deployed site, `npm run stripe:setup -- --webhook https://<site>/api/stripe/webhook`
   creates the webhook endpoint and saves its signing secret to `.stripe-webhook-secret` (gitignored);
   set it as `STRIPE_WEBHOOK_SECRET` on Vercel. Locally the webhook isn't needed:
   `/onboarding/complete` confirms the Checkout session directly.

Pricing is per student: Checkout's quantity is the number of children signing up. Pay with Stripe's
test card `4242 4242 4242 4242`, any future expiry and any CVC.

## Sessions and admin

- `/api/cron/generate-sessions` runs daily on Vercel (`vercel.json`, needs `CRON_SECRET`): it creates
  14 days of sessions from the schedule and enrols active students, one room per time slot, up to
  room capacity. Admins can run it from `/admin/schedule`.
- A session's supervisor and tutor must each have a verified Working with Children Check valid on the
  session date; the database refuses anything else. Tutors are proctor accounts assigned as
  `sessions.tutor_id` (room default: `rooms.default_tutor_id`).
- Admin pages: `/admin/rooms`, `/admin/schedule`, `/admin/subjects` (subject demand),
  `/admin/plans`, `/admin/proctors` (English only).

## Tutoring plan and study profiles

- Plans with `includes_tutoring` (seeded: "Weeknights + tutoring", A$79/week per student) put a
  dedicated tutor in the same room. Their students' help requests get `priority` (set by the database
  from the family's plan), and the student page says so. Help stays text or small-group; there's no
  one-to-one video.
- Parents record each child's subjects (taking / wants help, from the `subjects` list: Years 7–10 and
  VCE) and an optional 200-character note on current work, at sign-up or from `/parent/student/<id>`.
  The tutoring plan can't be bought until every child has at least one subject.
- Supervisors and tutors see each assigned session's roster at `/proctor/session/<id>` (the
  `session_roster()` function: tutoring students first, subjects, notes). Admins see subject demand
  at `/admin/subjects`.

## How it fits together

- **Auth.** `/login` emails a magic link for existing accounts only (parents sign up through
  `/onboarding` in Phase 1). Links land on `/auth/confirm`, which verifies the token and redirects to
  the user's role home.
- **Roles.** `profiles.role` is the source of truth. It's set from `app_metadata` (service-role only),
  never from client-writable `user_metadata`; a self-signup becomes a `parent`.
- **Route protection.** [src/proxy.ts](src/proxy.ts) refreshes the session and sends each role to its
  own area (`/parent`, `/student`, `/proctor`, `/admin`). Pages call `requireRole()` too, and RLS
  guards the data itself.
- **Database.** SQL migrations only, in [supabase/migrations](supabase/migrations). All timestamps are
  UTC `timestamptz`. RLS policies use `SECURITY DEFINER` helpers in a non-exposed `private` schema;
  column guards (triggers) stop parents changing a student's status or anyone changing their own role.
- **Landing page.** `/` (and `/zh`) is the port of `design/landing.html` with the positioning in
  [docs/product-changes-plan.md](docs/product-changes-plan.md). Copy is in
  `src/i18n/dictionaries/landing.*.ts`; prices come from the `plans` table (signed-out visitors can
  read active plans' public columns). Dashed "Owner to confirm" notes mark undecided policy and must
  be resolved before launch.
- **Languages.** English and Simplified Chinese. English keeps the spec's URLs (`/parent`); Chinese
  is under `/zh` (`/zh/parent`). Pages live in `src/app/[lang]`; the proxy rewrites unprefixed URLs to
  `/en/…`, sends browsers that prefer Chinese (or chose it with the header's language switch, stored
  in the `NEXT_LOCALE` cookie) to `/zh/…`, and keeps the language through role redirects. Strings
  are in [src/i18n/dictionaries](src/i18n/dictionaries); `zh.ts` is typed against `en.ts`, so a
  missing translation fails the typecheck. The magic-link email itself is still English only.
- **Time.** Every date/time goes through [src/lib/time.ts](src/lib/time.ts) (`Australia/Melbourne`,
  DST-safe).
- **Theme.** Brand tokens from the landing design (`paper`, `sheet`, `ink`, `pen`, `rule`, `cover`;
  Newsreader + JetBrains Mono) are in [src/app/globals.css](src/app/globals.css), and shadcn/ui's
  tokens map onto them.
