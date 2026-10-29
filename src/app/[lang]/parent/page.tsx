import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell, AppShellFallback, ComingInPhase } from "@/components/app-shell";
import { fill } from "@/i18n/fill";
import { getDictionary } from "@/i18n/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).roles.parent };
}

export default async function ParentPage() {
  const t = await getDictionary();
  return (
    <Suspense fallback={<AppShellFallback label={t.common.loading} />}>
      <ParentHome />
    </Suspense>
  );
}

async function ParentHome() {
  const [profile, t] = await Promise.all([requireRole("parent"), getDictionary()]);
  const supabase = await createClient();
  // RLS returns only this parent's students.
  const { data: students } = await supabase
    .from("students")
    .select("id, first_name, last_initial, year_level, status")
    .order("first_name");

  return (
    <AppShell profile={profile} title={t.parent.heading}>
      {students?.length ? (
        <ul className="divide-y divide-rule rounded-md border border-hair bg-sheet" data-testid="student-list">
          {students.map((s) => (
            <li key={s.id} className="flex items-baseline justify-between gap-4 px-4 py-3">
              <span>
                {s.first_name} {s.last_initial}.
              </span>
              <span className="font-mono text-xs text-ink-soft">
                {fill(t.parent.yearStatus, {
                  year: s.year_level,
                  status: t.studentStatus[s.status as keyof typeof t.studentStatus] ?? s.status,
                })}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-soft">{t.parent.empty}</p>
      )}
      <ComingInPhase phase={2}>{t.parent.reportsSoon}</ComingInPhase>
    </AppShell>
  );
}
