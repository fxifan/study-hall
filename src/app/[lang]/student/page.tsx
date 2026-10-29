import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell, AppShellFallback, ComingInPhase } from "@/components/app-shell";
import { fill } from "@/i18n/fill";
import { getDictionary } from "@/i18n/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).roles.student };
}

export default async function StudentPage() {
  const t = await getDictionary();
  return (
    <Suspense fallback={<AppShellFallback label={t.common.loading} />}>
      <StudentHome />
    </Suspense>
  );
}

async function StudentHome() {
  const [profile, t] = await Promise.all([requireRole("student"), getDictionary()]);
  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("first_name, year_level")
    .eq("profile_id", profile.id)
    .maybeSingle();

  return (
    <AppShell
      profile={profile}
      title={student ? fill(t.student.greeting, { name: student.first_name }) : t.student.greetingFallback}
    >
      {student && <p className="text-ink-soft">{fill(t.student.year, { year: student.year_level })}</p>}
      <ComingInPhase phase={1}>{t.student.sessionSoon}</ComingInPhase>
    </AppShell>
  );
}
