import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppShell, AppShellFallback } from "@/components/app-shell";
import { StudiesForm } from "@/components/studies-form";
import { localizePath } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireRole } from "@/lib/auth";
import type { Subject } from "@/lib/subjects";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).studies.title };
}

export default async function StudentStudiesPage({ params }: PageProps<"/[lang]/parent/student/[id]">) {
  const t = await getDictionary();
  return (
    <Suspense fallback={<AppShellFallback label={t.common.loading} />}>
      <StudentStudies params={params} />
    </Suspense>
  );
}

async function StudentStudies({ params }: Pick<PageProps<"/[lang]/parent/student/[id]">, "params">) {
  const [profile, t, locale, { id }] = await Promise.all([requireRole("parent"), getDictionary(), getLocale(), params]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  // RLS: a parent only sees their own children.
  const [{ data: student }, { data: subjects }] = await Promise.all([
    supabase
      .from("students")
      .select("id, first_name, last_initial, year_level, study_note, student_subjects(subject_id, wants_help)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("subjects").select("id, name, stage, sort").eq("active", true).order("sort").returns<Subject[]>(),
  ]);
  if (!student) notFound();

  return (
    <AppShell profile={profile} title={`${student.first_name} ${student.last_initial}. · ${fill(t.student.year, { year: student.year_level })}`}>
      <Link href={localizePath("/parent", locale)} className="text-sm text-ink-soft underline-offset-4 hover:underline">
        ← {t.parent.back}
      </Link>
      <section className="flex flex-col gap-3 rounded-md border border-hair bg-sheet px-4 py-4">
        <h2 className="font-mono text-xs tracking-widest text-ink-soft uppercase">{t.studies.title}</h2>
        <StudiesForm student={student} subjects={subjects ?? []} selected={student.student_subjects} t={t.studies} />
      </section>
    </AppShell>
  );
}
