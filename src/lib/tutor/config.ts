/**
 * Product, pricing and cost settings for the tutor report + billing product (docs/tutor-reports-spec.md).
 * Pricing lives here, not in components (spec §3.6). Change it in one place.
 */

/** Working name. Founders: rename here (spec §11.1: it lives inside Edumi for now). */
export const TUTOR_PRODUCT_NAME = "Edumi for Tutors";

export const PLANS = {
  /** Owner decision (spec §11.4): 14 days free, no report or invoice limits during the trial. */
  trial: { name: "Free trial", days: 14, priceCentsPerMonth: 0 },
  /**
   * Advertised only (owner decision, spec §11.2): Stripe isn't linked for this product yet.
   * Tutors pay in Settings (Stripe Checkout); admins can also switch Solo on by hand at /admin/costs.
   */
  solo: { name: "Solo", priceCentsPerMonth: 1500 },
} as const;

/**
 * Free plan (owner decision, 13 Nov 2026, from the market strategy): after any trial, a tutor with
 * up to this many students keeps every feature, for free and with no time limit. More students
 * need Solo (14 days free, then A$15/month).
 */
export const FREE_STUDENT_LIMIT = 3;
/** AI report drafts a month on the free plan (about weekly lessons for 3 students, plus redos). */
export const FREE_DRAFT_CAP = 30;

/** Referrals: when a tutor you referred first pays for Solo, you both get this much off (one month). */
export const REFERRAL_CREDIT_CENTS = 1500;
/** For a referrer who isn't paying yet, the same reward as days of full (Solo) access. */
export const REFERRAL_FREE_DAYS = 30;
export type TutorPlan = keyof typeof PLANS;

/** Fair-use cap on AI drafts per calendar month (Melbourne), on every plan (spec §7). */
export const MONTHLY_DRAFT_CAP = 300;

/** Longest voice note, in seconds (spec §7). */
export const MAX_AUDIO_SECONDS = 180;
/** Upload ceiling for one voice note. Vercel functions accept up to 4.5 MB per request. */
export const MAX_AUDIO_BYTES = 4_000_000;

/** Days after the due date when the one overdue reminder goes out (spec §3.5). */
export const OVERDUE_REMINDER_DAYS = 7;

/**
 * Unit costs for /admin/costs, in US dollars as the vendors bill. Check them against the vendors'
 * price pages and update after week 1 (spec §7 asks for real numbers from usage_events).
 */
export const UNIT_COSTS_USD = {
  /** gpt-4o-mini-transcribe: about US$0.003 per minute. */
  transcribePerMinute: 0.003,
  /** Blended input/output price per 1M tokens for the drafting model. */
  llmPerMillionTokens: 0.8,
  /** Resend: free tier, then about US$0.0009 per email on the Pro plan. */
  perEmail: 0.0009,
} as const;
/** For showing costs in AUD. Update occasionally. */
export const AUD_PER_USD = 1.55;

export const SUPPORT_EMAIL = "feifanwork1@gmail.com";

/** AI resources (docs/tutor-resources-spec.md §4, owner decisions 5 Nov 2026). */
export const MONTHLY_RESOURCE_CAP = 60;
/** Practice sets and writing tips a trial tutor can make in total. */
export const TRIAL_RESOURCE_LIMIT = 3;
