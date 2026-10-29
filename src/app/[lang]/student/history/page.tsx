import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell, AppShellFallback } from "@/components/app-shell";
import { fill } from "@/i18n/fill";
import { getDateLocale, getDictionary } from "@/i18n/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MELBOURNE, formatInZone } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).student.historyTitle };
}

export default async function StudentHistoryPage() {
  const t = await getDictionary();
  return (
    <Suspense fallback={<AppShellFallback label={t.common.loading} />}>
      <History />
    </Suspense>
  );
}

const MARK = { done: "✓", partial: "~", not_done: "✗" } as const;

/** Own past sessions and goals (spec §6 /student/history). RLS limits everything to this student. */
async function History() {
  const [profile, t, dateLocale] = await Promise.all([requireRole("student"), getDictionary(), getDateLocale()]);
  const s = t.student;
  const supabase = await createClient();
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, starts_at, ends_at, attendance(check_in_at, check_out_at), goals(position, text, outcome)")
    .lt("ends_at", new Date().toISOString())
    .neq("status", "cancelled")
    .order("starts_at", { ascending: false })
    .limit(30);
  const time = (iso: string) => formatInZone(iso, t.formats.time, MELBOURNE, dateLocale);

  return (
    <AppShell profile={profile} title={s.historyTitle}>
      {sessions?.length ? (
        <ul className="flex flex-col gap-3" data-testid="history">
          {sessions.map((session) => {
            const a = session.attendance[0];
            return (
              <li key={session.id} className="rounded-md border border-hair bg-sheet px-4 py-3">
                <p className="font-medium">{formatInZone(session.starts_at, t.formats.longDate, MELBOURNE, dateLocale)}</p>
                <p className="font-mono text-sm text-ink-soft">
                  {a?.check_in_at
                    ? fill(s.attended, { start: time(a.check_in_at), end: time(a.check_out_at ?? session.ends_at) })
                    : s.absent}
                </p>
                {session.goals.length > 0 && (
                  <ul className="mt-2 font-mono text-sm">
                    {[...session.goals]
                      .sort((x, y) => x.position - y.position)
                      .map((g) => (
                        <li key={g.position}>
                          {g.outcome ? MARK[g.outcome as keyof typeof MARK] : "·"} {g.text}
                        </li>
                      ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-ink-soft">{s.historyEmpty}</p>
      )}
    </AppShell>
  );
}
