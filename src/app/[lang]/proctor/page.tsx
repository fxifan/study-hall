import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell, AppShellFallback, ComingInPhase } from "@/components/app-shell";
import { getDateLocale, getDictionary } from "@/i18n/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MELBOURNE, dateKeyOf, dayRangeUtc, formatInZone } from "@/lib/time";

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

async function ProctorHome() {
  const [profile, t, dateLocale] = await Promise.all([requireRole("proctor"), getDictionary(), getDateLocale()]);
  const today = dateKeyOf();
  const { start, end } = dayRangeUtc(today);
  const time = (instant: string) => formatInZone(instant, t.formats.time, MELBOURNE, dateLocale);

  const supabase = await createClient();
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, starts_at, ends_at, status, rooms(name)")
    .eq("proctor_id", profile.id)
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .order("starts_at");

  return (
    <AppShell profile={profile} title={t.proctor.heading}>
      <p className="font-mono text-sm text-ink-soft">
        {formatInZone(start, t.formats.longDate, MELBOURNE, dateLocale)} · {t.proctor.melbourneTime}
      </p>
      {sessions?.length ? (
        <ul className="divide-y divide-rule rounded-md border border-hair bg-sheet">
          {sessions.map((s) => (
            <li key={s.id} className="flex justify-between gap-4 px-4 py-3">
              <span>{(s.rooms as { name?: string } | null)?.name ?? t.proctor.room}</span>
              <span className="font-mono text-sm">
                {time(s.starts_at)}–{time(s.ends_at)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-soft">{t.proctor.empty}</p>
      )}
      <ComingInPhase phase={2}>{t.proctor.rosterSoon}</ComingInPhase>
    </AppShell>
  );
}
