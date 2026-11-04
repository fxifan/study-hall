import { MONTHLY_DRAFT_CAP, PLANS } from "@/lib/tutor/config";
import { formatCents } from "@/lib/tutor/invoice-math";
import type { Access } from "@/lib/tutor/plan";

export function blockedMessage(reason: "trial_ended" | "fair_use"): string {
  return reason === "trial_ended"
    ? `Your 14-day free trial has ended. To keep drafting and sending reports and invoices, upgrade to Solo (${formatCents(PLANS.solo.priceCentsPerMonth)}/month) in Settings. Your students, reports and invoices are all still here.`
    : `You've used this month's fair-use allowance of ${MONTHLY_DRAFT_CAP} AI drafts. It resets on the 1st. You can still edit and send reports you've already drafted.`;
}

/** Trial countdown, or the reason the tutor is blocked. */
export function PlanBanner({ access }: { access: Access }) {
  if (!access.ok) {
    return (
      <p role="alert" className="rounded-md border border-pen px-3 py-2 text-sm text-pen">
        {blockedMessage(access.reason)}
      </p>
    );
  }
  if (access.plan === "trial" && access.trialDaysLeft !== null) {
    return (
      <p className="dash-card px-3 py-2 text-sm">
        Free trial: {access.trialDaysLeft} {access.trialDaysLeft === 1 ? "day" : "days"} left. Then Solo is {formatCents(PLANS.solo.priceCentsPerMonth)}/month.
      </p>
    );
  }
  return null;
}
