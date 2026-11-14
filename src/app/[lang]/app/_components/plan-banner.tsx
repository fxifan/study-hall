import Link from "next/link";
import { FREE_STUDENT_LIMIT, PLANS } from "@/lib/tutor/config";
import { formatCents } from "@/lib/tutor/invoice-math";
import type { Access } from "@/lib/tutor/plan";
import { blockedMessage } from "@/lib/tutor/plan-messages";

export { blockedMessage };

/** Trial countdown, the free plan's student count, or the reason the tutor is blocked. */
export function PlanBanner({ access, settingsHref }: { access: Access; settingsHref?: string }) {
  if (!access.ok) {
    return (
      <p role="alert" className="rounded-md border border-pen px-3 py-2 text-sm text-pen">
        {blockedMessage(access.reason)}
      </p>
    );
  }
  if (access.tier === "trial" && access.trialDaysLeft !== null) {
    return (
      <p className="dash-card px-3 py-2 text-sm">
        Free trial: {access.trialDaysLeft} {access.trialDaysLeft === 1 ? "day" : "days"} left. After that you keep the free plan for up to {FREE_STUDENT_LIMIT}{" "}
        students, or Solo is {formatCents(PLANS.solo.priceCentsPerMonth)}/month.
      </p>
    );
  }
  if (access.tier === "free") {
    return (
      <p className="dash-card px-3 py-2 text-sm" data-testid="free-plan-banner">
        Free plan: {access.students} of {FREE_STUDENT_LIMIT} students, {access.draftsLeft} AI drafts left this month.{" "}
        {settingsHref && (
          <Link href={settingsHref} className="font-medium">
            Teaching more? Try Solo free for 14 days →
          </Link>
        )}
      </p>
    );
  }
  return null;
}
