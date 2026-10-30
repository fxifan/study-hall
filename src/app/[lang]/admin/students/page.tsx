import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppShellFallback } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localizePath } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@/lib/subscription-status";
import { createClient } from "@/lib/supabase/server";
import { MELBOURNE, formatInZone } from "@/lib/time";
import { AdminFrame, fieldClass } from "../admin-frame";

export const metadata: Metadata = { title: "Students" };

export default async function StudentsPage({ searchParams }: PageProps<"/[lang]/admin/students">) {
  const t = await getDictionary();
  return (
    <Suspense fallback={<AppShellFallback label={t.common.loading} />}>
      <Students searchParams={searchParams} />
    </Suspense>
  );
}

type Row = {
  id: string;
  first_name: string;
  last_initial: string;
  year_level: number;
  school: string | null;
  status: string;
  created_at: string;
  profiles: { email: string } | null;
  parent_students: { parent_id: string; profiles: { full_name: string | null; email: string } | null }[];
  student_subjects: { wants_help: boolean }[];
};

type ActivePlan = { parent_id: string; plans: { name: string; includes_tutoring: boolean } | null };

/** Every student in the org with their family and plan (admin RLS). */
async function Students({ searchParams }: Pick<PageProps<"/[lang]/admin/students">, "searchParams">) {
  const [t, locale, query] = await Promise.all([getDictionary(), getLocale(), searchParams]);
  const s = t.adminPages.students;
  const supabase = await createClient();
  const [{ data: students }, { data: plans }] = await Promise.all([
    supabase
      .from("students")
      .select(
        "id, first_name, last_initial, year_level, school, status, created_at, profiles!students_profile_id_fkey(email), parent_students(parent_id, profiles(full_name, email)), student_subjects(wants_help)",
      )
      .order("created_at", { ascending: false })
      .returns<Row[]>(),
    supabase
      .from("subscriptions")
      .select("parent_id, plans(name, includes_tutoring)")
      .in("status", [...ACTIVE_SUBSCRIPTION_STATUSES])
      .returns<ActivePlan[]>(),
  ]);
  const planOf = new Map((plans ?? []).map((p) => [p.parent_id, p.plans]));
  const q = typeof query.q === "string" ? query.q.trim().toLowerCase() : "";
  const status = typeof query.status === "string" ? query.status : "";
  const rows = (students ?? []).filter((row) => {
    if (status && row.status !== status) return false;
    if (!q) return true;
    const haystack = [
      `${row.first_name} ${row.last_initial}.`,
      row.school ?? "",
      row.profiles?.email ?? "",
      ...row.parent_students.flatMap((p) => [p.profiles?.full_name ?? "", p.profiles?.email ?? ""]),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  return (
    <AdminFrame title={s.title} current="students">
      <p className="text-sm text-ink-soft">{s.intro}</p>
      <form className="flex flex-wrap items-end gap-2 text-sm" role="search">
        <label className="flex flex-col gap-1">
          {s.search}
          <Input name="q" defaultValue={q} className="w-64" />
        </label>
        <label className="flex flex-col gap-1">
          {s.status}
          <select name="status" defaultValue={status} className={fieldClass}>
            <option value="">{s.allStatuses}</option>
            {Object.entries(t.studentStatus).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          {s.filter}
        </Button>
      </form>
      {rows.length ? (
        <div className="overflow-x-auto rounded-md border border-hair bg-sheet">
          <table className="w-full text-sm" data-testid="students">
            <thead>
              <tr className="border-b border-rule text-left text-ink-soft">
                <th className="px-3 py-2 font-normal">{s.student}</th>
                <th className="px-3 py-2 font-normal">{s.status}</th>
                <th className="px-3 py-2 font-normal">{s.parent}</th>
                <th className="px-3 py-2 font-normal">{s.plan}</th>
                <th className="px-3 py-2 font-normal">{s.subjects}</th>
                <th className="px-3 py-2 font-normal">{s.added}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {rows.map((row) => {
                const plan = row.parent_students.map((p) => planOf.get(p.parent_id)).find(Boolean);
                const help = row.student_subjects.filter((x) => x.wants_help).length;
                return (
                  <tr key={row.id}>
                    <td className="px-3 py-2">
                      <Link className="font-medium underline-offset-4 hover:underline" href={localizePath(`/admin/students/${row.id}`, locale)}>
                        {row.first_name} {row.last_initial}.
                      </Link>{" "}
                      <span className="font-mono text-xs text-ink-soft">Year {row.year_level}</span>
                      {row.school && <div className="text-xs text-ink-soft">{row.school}</div>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{t.studentStatus[row.status as keyof typeof t.studentStatus] ?? row.status}</td>
                    <td className="px-3 py-2">
                      {row.parent_students.map((p) => (
                        <div key={p.parent_id}>
                          {p.profiles?.full_name || p.profiles?.email}
                          {p.profiles?.full_name && <div className="text-xs text-ink-soft">{p.profiles.email}</div>}
                        </div>
                      ))}
                    </td>
                    <td className="px-3 py-2">
                      {plan ? (
                        <>
                          {plan.name}
                          {plan.includes_tutoring && <span className="ml-2 font-mono text-xs text-pen uppercase">{s.tutoring}</span>}
                        </>
                      ) : (
                        <span className="text-ink-faint">{s.noPlan}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {row.student_subjects.length}
                      {help > 0 && <span className="text-pen"> ({help} help)</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{formatInZone(row.created_at, "d MMM yyyy", MELBOURNE)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-ink-soft">{s.none}</p>
      )}
    </AdminFrame>
  );
}
