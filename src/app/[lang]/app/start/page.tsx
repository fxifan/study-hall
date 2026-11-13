import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { FREE_STUDENT_LIMIT, PLANS, MONTHLY_DRAFT_CAP } from "@/lib/tutor/config";
import { formatCents } from "@/lib/tutor/invoice-math";
import { syncTutorCheckout } from "@/lib/tutor/billing";
import { needsTrialStart, requireTutor } from "@/lib/tutor/server";
import { formatInZone } from "@/lib/time";
import { startSoloCheckout } from "../billing-actions";
import { Loading, TutorShell, primaryButton } from "../_components/shell";

export const metadata: Metadata = { title: "Try Solo free" };

/**
 * Solo's 14-day trial starts here, in Stripe Checkout with a card (owner, 8 Nov 2026). Since the
 * free plan (13 Nov 2026) it's optional: tutors use Edumi free for up to 3 students without it.
 */
export default function StartPage({ searchParams }: PageProps<"/[lang]/app/start">) {
  return (
    <Suspense fallback={<Loading />}>
      <Start searchParams={searchParams} />
    </Suspense>
  );
}

async function Start({ searchParams }: Pick<PageProps<"/[lang]/app/start">, "searchParams">) {
  const [me, locale, query] = await Promise.all([requireTutor({ allowTrialStart: true }), getLocale(), searchParams]);
  if (typeof query.checkout === "string" && /^cs_[A-Za-z0-9_]+$/.test(query.checkout)) {
    if (await syncTutorCheckout(query.checkout, me.tutor.id).catch(() => false)) redirect(localizePath("/app?trial=started", locale));
  }
  if (!needsTrialStart(me.tutor)) redirect(localizePath("/app", locale));
  const solo = formatCents(PLANS.solo.priceCentsPerMonth);
  const firstCharge = formatInZone(new Date(new Date().getTime() + PLANS.trial.days * 86_400_000).toISOString(), "EEE d MMM");

  return (
    <TutorShell tutor={me} title="Try Solo free for 14 days" current="today">
      <section className="dash-card flex flex-col gap-3 p-5" data-testid="start-trial">
        <p className="text-ink-soft">Teaching more than {FREE_STUDENT_LIMIT} students? Solo has no limit.</p>
        <ul className="list-disc pl-5 text-sm">
          <li>{PLANS.trial.days} days free, with everything in Solo: unlimited students, reports and invoices, and {MONTHLY_DRAFT_CAP} AI drafts a month.</li>
          <li>You&apos;ll add a card on the next page and pay A$0 today.</li>
          <li>
            From {firstCharge} it&apos;s {solo}/month, charged to that card until you cancel. Cancel any time in Settings; cancel in the trial and you pay
            nothing.
          </li>
        </ul>
        <form action={startSoloCheckout}>
          <input type="hidden" name="from" value="start" />
          <button type="submit" className={primaryButton}>
            Start my {PLANS.trial.days}-day free trial
          </button>
        </form>
      </section>
    </TutorShell>
  );
}
