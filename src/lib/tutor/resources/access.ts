import { FREE_STUDENT_LIMIT, MONTHLY_RESOURCE_CAP, TRIAL_RESOURCE_LIMIT } from "../config";
import { tierFor, type PlanState } from "../plan";

/**
 * Who can generate a resource (owner decisions, 5 Nov 2026; free plan 13 Nov 2026): Solo, up to 60
 * a month; the trial and the free plan, 3 in total. Regenerating one question doesn't count.
 */
export type ResourceAccess = { ok: true; left: number } | { ok: false; reason: "over_free_limit" | "trial_limit" | "monthly_cap" };

export function resourceAccess(state: PlanState & { thisMonth: number; total: number }, now = new Date()): ResourceAccess {
  const tier = tierFor(state, now);
  if (tier === "locked") return { ok: false, reason: "over_free_limit" };
  if (tier !== "solo") {
    const left = TRIAL_RESOURCE_LIMIT - state.total;
    return left > 0 ? { ok: true, left } : { ok: false, reason: "trial_limit" };
  }
  const left = MONTHLY_RESOURCE_CAP - state.thisMonth;
  return left > 0 ? { ok: true, left } : { ok: false, reason: "monthly_cap" };
}

export const ACCESS_MESSAGES: Record<Exclude<ResourceAccess, { ok: true }>["reason"], string> = {
  over_free_limit: `The free plan covers up to ${FREE_STUDENT_LIMIT} students. Upgrade to Solo in Settings to make practice sets.`,
  trial_limit: `The free plan includes ${TRIAL_RESOURCE_LIMIT} resources. Upgrade to Solo in Settings for up to ${MONTHLY_RESOURCE_CAP} a month.`,
  monthly_cap: `You've made ${MONTHLY_RESOURCE_CAP} resources this month (the fair-use limit). It resets on the 1st.`,
};
