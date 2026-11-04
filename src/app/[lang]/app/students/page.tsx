import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { requireTutor } from "@/lib/tutor/server";
import { LANG_LABELS, Loading, Notice, TutorShell, appHref, yearLabel } from "../_components/shell";
import { AddStudentForm } from "./add-student-form";

export const metadata: Metadata = { title: "Students" };

export default function StudentsPage({ searchParams }: PageProps<"/[lang]/app/students">) {
  return (
    <Suspense fallback={<Loading />}>
      <Students searchParams={searchParams} />
    </Suspense>
  );
}

type Family = {
  id: string;
  parent_name: string;
  report_lang: keyof typeof LANG_LABELS;
  tutor_students: { id: string; first_name: string; last_initial: string; year_level: number; subjects: string[] }[];
};

const ERRORS: Record<string, string> = {
  student: "Check the student's details and try again.",
  family: "Check the parent's name and email and try again.",
};

async function Students({ searchParams }: Pick<PageProps<"/[lang]/app/students">, "searchParams">) {
  const [me, locale, query] = await Promise.all([requireTutor(), getLocale(), searchParams]);
  const { data: families } = await (await createClient())
    .from("tutor_families")
    .select("id, parent_name, report_lang, tutor_students(id, first_name, last_initial, year_level, subjects)")
    .order("parent_name")
    .returns<Family[]>();
  const error = typeof query.error === "string" ? ERRORS[query.error] : null;

  return (
    <TutorShell tutor={me} title="Students and families" current="students">
      {query.saved === "student" && <Notice>Student added.</Notice>}
      {query.saved === "deleted" && <Notice>Deleted.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {families?.length ? (
        <ul className="flex flex-col gap-3">
          {families.map((f) => (
            <li key={f.id} className="dash-card">
              <Link href={appHref(`/app/families/${f.id}`, locale)} className="flex items-baseline justify-between gap-3 border-b border-rule px-4 py-2.5">
                <span className="font-medium">{f.parent_name}</span>
                <span className="text-xs text-ink-soft">{LANG_LABELS[f.report_lang]} · invoices →</span>
              </Link>
              <ul className="divide-y divide-rule">
                {f.tutor_students.map((s) => (
                  <li key={s.id}>
                    <Link href={appHref(`/app/students/${s.id}`, locale)} className="flex items-baseline justify-between gap-3 px-4 py-3">
                      <span>
                        {s.first_name} {s.last_initial}.
                      </span>
                      <span className="truncate text-sm text-ink-soft">
                        {yearLabel(s.year_level)}
                        {s.subjects.length ? ` · ${s.subjects.join(", ")}` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-soft">No students yet.</p>
      )}
      <h2 id="add" className="mt-2 scroll-mt-4 text-lg font-medium">
        Add a student
      </h2>
      <AddStudentForm
        families={(families ?? []).map((f) => ({ id: f.id, parent_name: f.parent_name }))}
        defaultLang={me.tutor.report_langs.length > 1 ? "both" : me.tutor.report_langs[0]}
      />
      <p className="text-xs text-ink-faint">
        Keep student details minimal: first name, last initial, year level and subjects. Don&apos;t record dates of birth, photos,
        addresses or phone numbers.
      </p>
    </TutorShell>
  );
}
