import { MONTHLY_DRAFT_CAP, PLANS, type TutorPlan } from "./config";

/**
 * Plan rules (docs/tutor-reports-spec.md §3.6, §7, owner decisions §11): a 14-day free trial, then
 * Solo (A$15/month, switched on by hand until Stripe is linked). Both have the fair-use cap.
 *
 * When the trial has ended without Solo, the tutor can still read, copy and export everything and
 * mark invoices paid, but can't draft or send new reports or create or send invoices.
 */
export type PlanState = {
  plan: TutorPlan;
  trialEndsAt: string;
  draftsThisMonth: number;
};

export type Access =
  | { ok: true; plan: TutorPlan; trialDaysLeft: number | null; draftsLeft: number }
  | { ok: false; reason: "trial_ended" | "fair_use"; plan: TutorPlan };

export function trialDaysLeft(trialEndsAt: string, now = new Date()): number {
  return Math.max(0, Math.ceil((Date.parse(trialEndsAt) - now.getTime()) / 86_400_000));
}

/** Can this tutor do paid work (AI drafts, sending, invoicing)? */
export function canWork(state: Pick<PlanState, "plan" | "trialEndsAt">, now = new Date()): boolean {
  return state.plan === "solo" || Date.parse(state.trialEndsAt) > now.getTime();
}

/** Can this tutor ask for another AI draft right now? */
export function draftAccess(state: PlanState, now = new Date()): Access {
  if (!canWork(state, now)) return { ok: false, reason: "trial_ended", plan: state.plan };
  if (state.draftsThisMonth >= MONTHLY_DRAFT_CAP) return { ok: false, reason: "fair_use", plan: state.plan };
  return {
    ok: true,
    plan: state.plan,
    trialDaysLeft: state.plan === "trial" ? trialDaysLeft(state.trialEndsAt, now) : null,
    draftsLeft: MONTHLY_DRAFT_CAP - state.draftsThisMonth,
  };
}

export function planLabel(plan: TutorPlan): string {
  return PLANS[plan].name;
}
