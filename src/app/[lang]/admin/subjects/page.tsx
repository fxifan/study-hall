import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShellFallback } from "@/components/app-shell";
import { getDictionary } from "@/i18n/server";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@/lib/subscription-status";
import { createClient } from "@/lib/supabase/server";
import { AdminFrame } from "../admin-frame";

export const metadata: Metadata = { title: "Subjects" };

export default async function SubjectsPage() {
  const t = await getDictionary();
  return (
    <Suspense fallback={<AppShellFallback label={t.common.loading} />}>
      <Subjects />
    </Suspense>
  );
}

type Choice = {
  student_id: string;
  wants_help: boolean;
  subjects: { name: string; stage: "junior" | "vce"; sort: number } | null;
  students: { year_level: number } | null;
};

type TutoringStudent = {
  id: string;
  first_name: string;
  last_initial: string;
  year_level: number;
  study_note: string | null;
  student_subjects: { wants_help: boolean; subjects: { name: string; sort: number } | null }[];
};

/** Subject demand across active students: what to stock and which tutors to line up. */
async function Subjects() {
  const a = (await getDictionary()).adminPages.subjects;
  const supabase = await createClient();
  // RLS scopes all of these to the admin's org.
  const [{ data: choices }, { data: tutoringSubs }, { data: links }] = await Promise.all([
    supabase
      .from("student_subjects")
      .select("student_id, wants_help, subjects(name, stage, sort), students!inner(year_level, status)")
      .eq("students.status", "active")
      .returns<Choice[]>(),
    supabase
      .from("subscriptions")
      .select("parent_id, plans!inner(includes_tutoring)")
      .in("status", [...ACTIVE_SUBSCRIPTION_STATUSES])
      .eq("plans.includes_tutoring", true),
    supabase.from("parent_students").select("parent_id, student_id"),
  ]);
  const tutoringParents = new Set((tutoringSubs ?? []).map((s) => s.parent_id));
  const tutoringIds = new Set((links ?? []).filter((l) => tutoringParents.has(l.parent_id)).map((l) => l.student_id));

  const bySubject = new Map<string, { stage: string; sort: number; taking: number; help: number; tutoring: number; years: Set<number> }>();
  for (const c of choices ?? []) {
    if (!c.subjects) continue;
    const row = bySubject.get(c.subjects.name) ?? { stage: c.subjects.stage, sort: c.subjects.sort, taking: 0, help: 0, tutoring: 0, years: new Set<number>() };
    row.taking += 1;
    if (c.wants_help) row.help += 1;
    if (tutoringIds.has(c.student_id)) row.tutoring += 1;
    if (c.students) row.years.add(c.students.year_level);
    bySubject.set(c.subjects.name, row);
  }
  const rows = [...bySubject.entries()].sort(([, x], [, y]) => x.stage.localeCompare(y.stage) || y.help - x.help || x.sort - y.sort);

  const { data: tutoringStudents } = tutoringIds.size
    ? await supabase
        .from("students")
        .select("id, first_name, last_initial, year_level, study_note, student_subjects(wants_help, subjects(name, sort))")
        .eq("status", "active")
        .in("id", [...tutoringIds])
        .order("year_level")
        .returns<TutoringStudent[]>()
    : { data: [] as TutoringStudent[] };

  return (
    <AdminFrame title={a.title} current="subjects">
      <p className="text-sm text-ink-soft">{a.intro}</p>
      {rows.length ? (
        <div className="overflow-x-auto rounded-md border border-hair bg-sheet">
          <table className="w-full text-sm" data-testid="subject-demand">
            <thead>
              <tr className="border-b border-rule text-left text-ink-soft">
                <th className="px-3 py-2 font-normal">{a.subject}</th>
                <th className="px-3 py-2 text-right font-normal">{a.taking}</th>
                <th className="px-3 py-2 text-right font-normal">{a.help}</th>
                <th className="px-3 py-2 text-right font-normal">{a.tutoring}</th>
                <th className="px-3 py-2 font-normal">{a.years}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {rows.map(([name, r]) => (
                <tr key={name}>
                  <td className="px-3 py-2">
                    {name} <span className="font-mono text-xs text-ink-faint">{a.stage[r.stage as "junior" | "vce"]}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{r.taking}</td>
                  <td className={`px-3 py-2 text-right font-mono ${r.help ? "text-pen" : ""}`}>{r.help}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.tutoring}</td>
                  <td className="px-3 py-2 font-mono text-xs">{[...r.years].sort((x, y) => x - y).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-ink-soft">{a.none}</p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-medium">{a.students}</h2>
        {tutoringStudents?.length ? (
          <ul className="divide-y divide-rule rounded-md border border-hair bg-sheet text-sm" data-testid="tutoring-students">
            {tutoringStudents.map((s) => {
              const subjects = s.student_subjects
                .filter((x) => x.subjects)
                .sort((x, y) => Number(y.wants_help) - Number(x.wants_help) || x.subjects!.sort - y.subjects!.sort);
              return (
                <li key={s.id} className="flex flex-col gap-1 px-4 py-3">
                  <span>
                    <span className="font-medium">
                      {s.first_name} {s.last_initial}.
                    </span>{" "}
                    <span className="font-mono text-xs text-ink-soft">Year {s.year_level}</span>
                  </span>
                  <span>
                    {subjects.map((x, i) => (
                      <span key={x.subjects!.name} className={x.wants_help ? "text-pen" : "text-ink-soft"}>
                        {i > 0 && ", "}
                        {x.subjects!.name}
                        {x.wants_help && "*"}
                      </span>
                    ))}
                  </span>
                  {s.study_note && (
                    <span className="text-ink-soft">
                      {a.note}: {s.study_note}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-ink-soft">{a.noTutoring}</p>
        )}
      </section>
    </AdminFrame>
  );
}
