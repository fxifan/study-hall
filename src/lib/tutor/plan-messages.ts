import { FREE_DRAFT_CAP, FREE_STUDENT_LIMIT, MONTHLY_DRAFT_CAP, PLANS } from "./config";
import { formatCents } from "./invoice-math";
import type { Access } from "./plan";

const solo = () => `Solo (${formatCents(PLANS.solo.priceCentsPerMonth).replace(".00", "")}/month, 14 days free)`;

/** Why a tutor can't draft, send or invoice right now, and what to do about it. */
export function blockedMessage(reason: Exclude<Access, { ok: true }>["reason"]): string {
  if (reason === "over_free_limit") {
    return `The free plan covers up to ${FREE_STUDENT_LIMIT} students. To keep drafting and sending reports and invoices, upgrade to ${solo()} in Settings, or remove students you no longer teach. Your students, reports and invoices are all still here.`;
  }
  if (reason === "free_cap") {
    return `You've used this month's ${FREE_DRAFT_CAP} AI drafts on the free plan. They reset on the 1st, or upgrade to ${solo()} for up to ${MONTHLY_DRAFT_CAP} a month. You can still edit and send reports you've already drafted.`;
  }
  return `You've used this month's fair-use allowance of ${MONTHLY_DRAFT_CAP} AI drafts. It resets on the 1st. You can still edit and send reports you've already drafted.`;
}

/** Shown when a free-plan tutor tries to add one student too many. */
export function studentLimitMessage(): string {
  return `The free plan covers up to ${FREE_STUDENT_LIMIT} students. Upgrade to ${solo()} in Settings to add more.`;
}
