import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell, AppShellFallback, ComingInPhase } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Student" };

export default function StudentPage() {
  return (
    <Suspense fallback={<AppShellFallback />}>
      <StudentHome />
    </Suspense>
  );
}

async function StudentHome() {
  const profile = await requireRole("student");
  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("first_name, year_level")
    .eq("profile_id", profile.id)
    .maybeSingle();

  return (
    <AppShell profile={profile} title={student ? `Hi ${student.first_name}` : "Hi there"}>
      {student && <p className="text-ink-soft">Year {student.year_level}</p>}
      <ComingInPhase phase={1}>
        Today&apos;s session, your goals, the Join button and the block timer will appear here.
      </ComingInPhase>
    </AppShell>
  );
}
