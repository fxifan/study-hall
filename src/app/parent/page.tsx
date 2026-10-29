import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell, AppShellFallback, ComingInPhase } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Parent" };

export default function ParentPage() {
  return (
    <Suspense fallback={<AppShellFallback />}>
      <ParentHome />
    </Suspense>
  );
}

async function ParentHome() {
  const profile = await requireRole("parent");
  const supabase = await createClient();
  // RLS returns only this parent's students.
  const { data: students } = await supabase
    .from("students")
    .select("id, first_name, last_initial, year_level, status")
    .order("first_name");

  return (
    <AppShell profile={profile} title="Your students">
      {students?.length ? (
        <ul className="divide-y divide-rule rounded-md border border-hair bg-sheet" data-testid="student-list">
          {students.map((s) => (
            <li key={s.id} className="flex items-baseline justify-between gap-4 px-4 py-3">
              <span>
                {s.first_name} {s.last_initial}.
              </span>
              <span className="font-mono text-xs text-ink-soft">
                Year {s.year_level} · {s.status}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-soft">No students yet.</p>
      )}
      <ComingInPhase phase={2}>Nightly reports and attendance history will appear here.</ComingInPhase>
    </AppShell>
  );
}
