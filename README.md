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
   npm run db:seed      # 1 org, admin, proctor, room, schedule, A$49/week plan, 2 families
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
| `parentA`  | parent  | `/parent`  | Family A: Ava (Year 11), Leo (Year 9, invited, no login) |
| `studentA` | student | `/student` | Ava                                      |
| `parentB`  | parent  | `/parent`  | Family B: Noah (Year 12)                 |
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
- **Time.** Every date/time goes through [src/lib/time.ts](src/lib/time.ts) (`Australia/Melbourne`,
  DST-safe).
- **Theme.** Brand tokens from the landing design (`paper`, `sheet`, `ink`, `pen`, `rule`, `cover`;
  Newsreader + JetBrains Mono) are in [src/app/globals.css](src/app/globals.css), and shadcn/ui's
  tokens map onto them.
