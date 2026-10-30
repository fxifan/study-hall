import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppShell, AppShellFallback } from "@/components/app-shell";
import { localizePath } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { getDateLocale, getDictionary, getLocale } from "@/i18n/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MELBOURNE, addDaysToDateKey, dateKeyOf, dayRangeUtc, formatInZone } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).roles.proctor };
}

export default async function ProctorPage() {
  const t = await getDictionary();
  return (
    <Suspense fallback={<AppShellFallback label={t.common.loading} />}>
      <ProctorHome />
    </Suspense>
  );
}

type StaffSession = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  proctor_id: string | null;
  tutor_id: string | null;
  rooms: { name: string } | null;
  enrolments: { count: number }[];
};

async function ProctorHome() {
  const [profile, t, locale, dateLocale] = await Promise.all([
    requireRole("proctor"),
    getDictionary(),
    getLocale(),
    getDateLocale(),
  ]);
  const today = dateKeyOf();
  const { start, end } = dayRangeUtc(today);
  const { start: horizon } = dayRangeUtc(addDaysToDateKey(today, 8));
  const time = (instant: string) => formatInZone(instant, t.formats.time, MELBOURNE, dateLocale);

  // Sessions where this person supervises or tutors, today and the coming week.
  const supabase = await createClient();
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, starts_at, ends_at, status, proctor_id, tutor_id, rooms(name), enrolments(count)")
    .or(`proctor_id.eq.${profile.id},tutor_id.eq.${profile.id}`)
    .neq("status", "cancelled")
    .gte("starts_at", start.toISOString())
    .lt("starts_at", horizon.toISOString())
    .order("starts_at")
    .returns<StaffSession[]>();
  const todays = (sessions ?? []).filter((s) => s.starts_at < end.toISOString());
  const later = (sessions ?? []).filter((s) => s.starts_at >= end.toISOString());

  const row = (s: StaffSession, withDate: boolean) => (
    <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
      <span className="flex items-baseline gap-3">
        {withDate && <span className="font-mono text-sm">{formatInZone(s.starts_at, t.formats.longDate, MELBOURNE, dateLocale)}</span>}
        <span>{s.rooms?.name ?? t.proctor.room}</span>
        <span className="font-mono text-xs text-ink-soft uppercase">
          {[s.proctor_id === profile.id && t.proctor.supervising, s.tutor_id === profile.id && t.proctor.tutoring]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      <span className="flex items-baseline gap-4">
        <span className="font-mono text-sm">
          {time(s.starts_at)}–{time(s.ends_at)}
        </span>
        <Link className="text-sm underline underline-offset-4" href={localizePath(`/proctor/session/${s.id}`, locale)}>
          {fill(t.proctor.roster, { count: s.enrolments[0]?.count ?? 0 })}
        </Link>
      </span>
    </li>
  );

  return (
    <AppShell profile={profile} title={t.proctor.heading}>
      <p className="font-mono text-sm text-ink-soft">
        {formatInZone(start, t.formats.longDate, MELBOURNE, dateLocale)} · {t.proctor.melbourneTime}
      </p>
      {todays.length ? (
        <ul className="divide-y divide-rule rounded-md border border-hair bg-sheet" data-testid="today-sessions">
          {todays.map((s) => row(s, false))}
        </ul>
      ) : (
        <p className="text-ink-soft">{t.proctor.empty}</p>
      )}
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-medium">{t.proctor.upcoming}</h2>
        {later.length ? (
          <ul className="divide-y divide-rule rounded-md border border-hair bg-sheet" data-testid="upcoming-sessions">
            {later.map((s) => row(s, true))}
          </ul>
        ) : (
          <p className="text-ink-soft">{t.proctor.noneUpcoming}</p>
        )}
      </section>
    </AppShell>
  );
}
