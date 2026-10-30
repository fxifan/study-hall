import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppShell, AppShellFallback } from "@/components/app-shell";
import { ReportCards } from "@/components/report-cards";
import { Button, buttonVariants } from "@/components/ui/button";
import { localizePath } from "@/i18n/config";
import { en } from "@/i18n/dictionaries/en";
import { zh } from "@/i18n/dictionaries/zh";
import { fill } from "@/i18n/fill";
import { getDateLocale, getDictionary, getLocale } from "@/i18n/server";
import { requireRole } from "@/lib/auth";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@/lib/subscription-status";
import { formatAud } from "@/lib/money";
import { getParentReports } from "@/lib/parent-reports";
import { createClient } from "@/lib/supabase/server";
import { MELBOURNE, formatInZone } from "@/lib/time";
import { openBillingPortal } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).roles.parent };
}

export default async function ParentPage({ searchParams }: PageProps<"/[lang]/parent">) {
  const t = await getDictionary();
  return (
    <Suspense fallback={<AppShellFallback label={t.common.loading} />}>
      <ParentHome searchParams={searchParams} />
    </Suspense>
  );
}

async function ParentHome({ searchParams }: Pick<PageProps<"/[lang]/parent">, "searchParams">) {
  const [profile, t, locale, dateLocale, query] = await Promise.all([
    requireRole("parent"),
    getDictionary(),
    getLocale(),
    getDateLocale(),
    searchParams,
  ]);
  const supabase = await createClient();
  // RLS returns only this parent's students and subscriptions.
  const [{ data: students }, { data: subscription }, reports] = await Promise.all([
    supabase
      .from("students")
      .select("id, first_name, last_initial, year_level, status, student_subjects(subject_id)")
      .order("first_name"),
    supabase
      .from("subscriptions")
      .select("status, quantity, current_period_end, cancel_at_period_end, stripe_customer_id, plans(name, price_cents)")
      .in("status", [...ACTIVE_SUBSCRIPTION_STATUSES])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{
        status: string;
        quantity: number;
        current_period_end: string | null;
        cancel_at_period_end: boolean;
        stripe_customer_id: string | null;
        plans: { name: string; price_cents: number } | null;
      }>(),
    getParentReports(supabase),
  ]);
  const b = t.parent.billing;
  const until = subscription?.current_period_end
    ? formatInZone(subscription.current_period_end, t.formats.longDate, MELBOURNE, dateLocale)
    : "";

  return (
    <AppShell profile={profile} title={t.parent.heading}>
      {query.welcome === "1" && subscription && (
        <p role="status" className="rounded-md border border-hair bg-sheet px-4 py-3">
          {b.welcome}
        </p>
      )}
      {students?.length ? (
        <ul className="divide-y divide-rule rounded-md border border-hair bg-sheet" data-testid="student-list">
          {students.map((s) => (
            <li key={s.id} className="flex items-baseline justify-between gap-4 px-4 py-3">
              <span>
                {s.first_name} {s.last_initial}.
              </span>
              <span className="flex items-baseline gap-4 font-mono text-xs text-ink-soft">
                {fill(t.parent.yearStatus, {
                  year: s.year_level,
                  status: t.studentStatus[s.status as keyof typeof t.studentStatus] ?? s.status,
                })}
                <Link className="underline underline-offset-4" href={localizePath(`/parent/student/${s.id}`, locale)}>
                  {t.parent.editStudies} ({s.student_subjects.length})
                </Link>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-soft">{t.parent.empty}</p>
      )}

      <section className="flex flex-col gap-3 rounded-md border border-hair bg-sheet px-4 py-4" data-testid="billing">
        <h2 className="font-mono text-xs tracking-widest text-ink-soft uppercase">{b.title}</h2>
        {subscription?.plans ? (
          <>
            <p>
              {fill(subscription.cancel_at_period_end ? b.cancelling : b.active, {
                plan: subscription.plans.name,
                count: subscription.quantity,
                price: formatAud(subscription.plans.price_cents),
                date: until,
              })}
            </p>
            {subscription.stripe_customer_id && (
              <form action={openBillingPortal}>
                <Button type="submit" variant="outline">
                  {b.manage}
                </Button>
                <p className="mt-2 text-sm text-ink-soft">{b.manageHelp}</p>
              </form>
            )}
          </>
        ) : (
          <>
            <p className="text-ink-soft">{b.none}</p>
            <Link className={buttonVariants() + " self-start"} href={localizePath("/onboarding", locale)}>
              {b.finish}
            </Link>
          </>
        )}
      </section>
      <section className="flex flex-col gap-3" data-testid="reports">
        <h2 className="font-mono text-xs tracking-widest text-ink-soft uppercase">{t.parent.reports}</h2>
        <p className="text-sm text-ink-soft">{t.parent.reportsIntro}</p>
        {reports.length ? (
          // Both label sets go to the browser so the list can switch language without a reload.
          <ReportCards reports={reports} labels={{ en: en.reportCard, zh: zh.reportCard }} initialLang={locale} />
        ) : (
          <p className="text-ink-soft">{t.parent.reportsEmpty}</p>
        )}
      </section>
    </AppShell>
  );
}
