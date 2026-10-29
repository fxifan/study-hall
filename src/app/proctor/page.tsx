import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell, AppShellFallback, ComingInPhase } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateKeyOf, dayRangeUtc, formatInZone } from "@/lib/time";

export const metadata: Metadata = { title: "Proctor" };

export default function ProctorPage() {
  return (
    <Suspense fallback={<AppShellFallback />}>
      <ProctorHome />
    </Suspense>
  );
}

async function ProctorHome() {
  const profile = await requireRole("proctor");
  const today = dateKeyOf();
  const { start, end } = dayRangeUtc(today);

  const supabase = await createClient();
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, starts_at, ends_at, status, rooms(name)")
    .eq("proctor_id", profile.id)
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .order("starts_at");

  return (
    <AppShell profile={profile} title="Today's sessions">
      <p className="font-mono text-sm text-ink-soft">{formatInZone(start, "EEEE d MMMM")} · Melbourne time</p>
      {sessions?.length ? (
        <ul className="divide-y divide-rule rounded-md border border-hair bg-sheet">
          {sessions.map((s) => (
            <li key={s.id} className="flex justify-between gap-4 px-4 py-3">
              <span>{(s.rooms as { name?: string } | null)?.name ?? "Room"}</span>
              <span className="font-mono text-sm">
                {formatInZone(s.starts_at, "h:mmaaa")}–{formatInZone(s.ends_at, "h:mmaaa")}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-soft">No sessions assigned to you today.</p>
      )}
      <ComingInPhase phase={2}>The live roster, focus flags and help queue open from each session.</ComingInPhase>
    </AppShell>
  );
}
