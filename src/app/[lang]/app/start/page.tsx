import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { PLANS, MONTHLY_DRAFT_CAP } from "@/lib/tutor/config";
import { formatCents } from "@/lib/tutor/invoice-math";
import { syncTutorCheckout } from "@/lib/tutor/billing";
import { needsTrialStart, requireTutor } from "@/lib/tutor/server";
import { formatInZone } from "@/lib/time";
import { startSoloCheckout } from "../billing-actions";
import { Loading, TutorShell, primaryButton } from "../_components/shell";

export const metadata: Metadata = { title: "Start your free trial" };

/**
 * New tutors start their 14-day trial here, in Stripe Checkout with a card (owner, 8 Nov 2026).
 * Every other tutor page sends them here until they have.
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
    <TutorShell tutor={me} title="Start your free trial" current="today">
      <section className="dash-card flex flex-col gap-3 p-5" data-testid="start-trial">
        <p className="text-ink-soft">Welcome, {me.tutor.display_name.split(" ")[0]}. One step before your dashboard.</p>
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
