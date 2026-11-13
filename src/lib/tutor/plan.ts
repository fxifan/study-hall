import { ACTIVE_SUBSCRIPTION_STATUSES } from "@/lib/subscription-status";
import { FREE_DRAFT_CAP, FREE_STUDENT_LIMIT, MONTHLY_DRAFT_CAP, PLANS, type TutorPlan } from "./config";

/**
 * Plan rules (docs/tutor-reports-spec.md §3.6, §7; free plan and referrals: docs/tutor-free-and-referrals.md).
 *
 * - solo: a Solo subscription (including its 14-day trial in Stripe), or switched on by an admin.
 * - trial: free full access until trial_ends_at (older no-card trials and referral rewards).
 * - free: no plan, up to FREE_STUDENT_LIMIT students: everything, with a smaller AI-draft allowance.
 * - locked: no plan and more students than the free plan covers. The tutor can still read, copy and
 *   export everything and mark invoices paid, but can't draft or send reports or create or send
 *   invoices until they upgrade (or archive students down to the free limit).
 */
export type PlanState = {
  plan: TutorPlan;
  trialEndsAt: string;
  /** How many students the tutor has. */
  students: number;
};

export type Tier = "solo" | "trial" | "free" | "locked";

export type Access =
  | { ok: true; plan: TutorPlan; tier: Exclude<Tier, "locked">; trialDaysLeft: number | null; draftsLeft: number; students: number }
  | { ok: false; reason: "over_free_limit" | "fair_use" | "free_cap"; plan: TutorPlan; students: number };

export function trialDaysLeft(trialEndsAt: string, now = new Date()): number {
  return Math.max(0, Math.ceil((Date.parse(trialEndsAt) - now.getTime()) / 86_400_000));
}

export function tierFor(state: PlanState, now = new Date()): Tier {
  if (state.plan === "solo") return "solo";
  if (Date.parse(state.trialEndsAt) > now.getTime()) return "trial";
  return state.students <= FREE_STUDENT_LIMIT ? "free" : "locked";
}

/** Can this tutor do paid work (AI drafts, sending, invoicing)? */
export function canWork(state: PlanState, now = new Date()): boolean {
  return tierFor(state, now) !== "locked";
}

/** Can this tutor add another student? On the free plan, only up to the limit. */
export function canAddStudent(state: PlanState, now = new Date()): boolean {
  const tier = tierFor(state, now);
  return tier === "solo" || tier === "trial" || state.students < FREE_STUDENT_LIMIT;
}

/** Can this tutor ask for another AI draft right now? */
export function draftAccess(state: PlanState & { draftsThisMonth: number }, now = new Date()): Access {
  const tier = tierFor(state, now);
  if (tier === "locked") return { ok: false, reason: "over_free_limit", plan: state.plan, students: state.students };
  const cap = tier === "free" ? FREE_DRAFT_CAP : MONTHLY_DRAFT_CAP;
  if (state.draftsThisMonth >= cap) return { ok: false, reason: tier === "free" ? "free_cap" : "fair_use", plan: state.plan, students: state.students };
  return {
    ok: true,
    plan: state.plan,
    tier,
    trialDaysLeft: tier === "trial" ? trialDaysLeft(state.trialEndsAt, now) : null,
    draftsLeft: cap - state.draftsThisMonth,
    students: state.students,
  };
}

export function planLabel(plan: TutorPlan): string {
  return PLANS[plan].name;
}

/** What to call the tutor's plan right now: Solo, Free trial, Free or Free (over the limit). */
export function tierLabel(tier: Tier): string {
  return tier === "solo" ? "Solo" : tier === "trial" ? "Free trial" : tier === "free" ? "Free" : `Free (over ${FREE_STUDENT_LIMIT} students)`;
}

/** Solo while a Stripe subscription is active (including past_due, as for families); trial otherwise. */
export function planForStatus(status: string): "solo" | "trial" {
  return (ACTIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status) ? "solo" : "trial";
}
