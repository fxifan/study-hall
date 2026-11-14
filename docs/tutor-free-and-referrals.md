# Edumi for Tutors: free plan and referrals

Owner-approved 13 Nov 2026, from the market strategy (tutor mode is the first revenue bet: aim for
5–10 paying tutors). The goal is less friction to try Edumi, and tutors bringing in tutors.

## Plans

| Plan | Who | Students | AI report drafts | Practice sets |
|---|---|---|---|---|
| **Free** | No plan, after any trial | Up to 3 | 30 a month | 3 in total |
| **Trial** | Older no-card trials, or a referral reward | Unlimited | 300 a month | 3 in total |
| **Solo** (A$15/month, 14 days free in Stripe) | Paying, or switched on by an admin | Unlimited | 300 a month | 60 a month |

- New tutors **sign up and go straight in** on the free plan, with no card. The Solo trial starts
  from Settings ("Try Solo free for 14 days") or `/app/start`.
- The 4th student is refused on the free plan, with a link to upgrade.
- A tutor with **more than 3 students and no plan** (e.g. Solo cancelled) is "locked". They can read,
  copy and export everything and mark invoices paid. They can't draft or send reports or create or
  send invoices until they upgrade or remove students.
- The rules are in `src/lib/tutor/plan.ts` (`tierFor`, `canWork`, `canAddStudent`, `draftAccess`).
  Limits are in `src/lib/tutor/config.ts` (`FREE_STUDENT_LIMIT`, `FREE_DRAFT_CAP`).

## Referrals

- Every tutor has a link in Settings: `/tutors?ref=CODE#signup`. The code is 8 characters, made
  on first view.
- A tutor who signs up through it is saved with `referred_by`. The sign-up form shows "you both get
  a month free".
- When the referred tutor's Solo subscription first becomes **active** (paid, not trialing), the
  webhook rewards both tutors once (`referral_rewarded_at`):
  - a tutor paying for Solo gets a **A$15 credit** on their Stripe balance (used by the next invoice);
  - otherwise they get **30 days of full access** (`trial_ends_at` moves out).
- Settings shows how many tutors signed up with your link and how many free months you've earned.
- Event: `tutor_referral_rewarded`. Sign-ups through a link have `via: referral` on `user_signed_up`.
- Code: `src/lib/tutor/referrals.ts`; migration `20261113061230_tutor_free_plan_referrals.sql`. The
  tutors guard stops tutors setting their own referral fields.

## Known limits

- If giving one of the two rewards fails, the claim is undone so the next webhook retries. A Stripe
  credit is never given twice (idempotency key), but a 30-day extension could be.
- There's no cap on referral rewards per tutor yet.
