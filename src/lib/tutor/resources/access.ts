import { MONTHLY_RESOURCE_CAP, TRIAL_RESOURCE_LIMIT, type TutorPlan } from "../config";
import { canWork } from "../plan";

/**
 * Who can generate a resource (owner decisions, 5 Nov 2026): Solo, up to 60 a month; the trial,
 * 3 in total. Regenerating one question doesn't count as a new resource.
 */
export type ResourceAccess = { ok: true; left: number } | { ok: false; reason: "trial_ended" | "trial_limit" | "monthly_cap" };

export function resourceAccess(
  state: { plan: TutorPlan; trialEndsAt: string; thisMonth: number; total: number },
  now = new Date(),
): ResourceAccess {
  if (!canWork(state, now)) return { ok: false, reason: "trial_ended" };
  if (state.plan === "trial") {
    const left = TRIAL_RESOURCE_LIMIT - state.total;
    return left > 0 ? { ok: true, left } : { ok: false, reason: "trial_limit" };
  }
  const left = MONTHLY_RESOURCE_CAP - state.thisMonth;
  return left > 0 ? { ok: true, left } : { ok: false, reason: "monthly_cap" };
}

export const ACCESS_MESSAGES: Record<Exclude<ResourceAccess, { ok: true }>["reason"], string> = {
  trial_ended: "Your free trial has ended. Upgrade to Solo in Settings to make practice sets.",
  trial_limit: `The free trial includes ${TRIAL_RESOURCE_LIMIT} resources. Upgrade to Solo in Settings for up to ${MONTHLY_RESOURCE_CAP} a month.`,
  monthly_cap: `You've made ${MONTHLY_RESOURCE_CAP} resources this month (the fair-use limit). It resets on the 1st.`,
};
