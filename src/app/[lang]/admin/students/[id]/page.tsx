import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppShellFallback } from "@/components/app-shell";
import { ReportCards } from "@/components/report-cards";
import { localizePath } from "@/i18n/config";
import { en } from "@/i18n/dictionaries/en";
import { zh } from "@/i18n/dictionaries/zh";
import { fill } from "@/i18n/fill";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatAud } from "@/lib/money";
import { getParentReports, reportWindowStart } from "@/lib/parent-reports";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@/lib/subscription-status";
import { createClient } from "@/lib/supabase/server";
import { MELBOURNE, formatInZone } from "@/lib/time";
import { AdminFrame } from "../../admin-frame";

export const metadata: Metadata = { title: "Student" };

export default async function StudentPage({ params }: PageProps<"/[lang]/admin/students/[id]">) {
  const t = await getDictionary();
  return (
    <Suspense fallback={<AppShellFallback label={t.common.loading} />}>
      <Student params={params} />
    </Suspense>
  );
}

type StudentRecord = {
  id: string;
  first_name: string;
  last_initial: string;
  year_level: number;
  school: string | null;
  status: string;
  study_note: string | null;
  profiles: { email: string } | null;
  parent_students: {
    parent_id: string;
    profiles: { full_name: string | null; email: string; acquisition_source: string | null } | null;
  }[];
  student_subjects: { wants_help: boolean; subjects: { name: string; sort: number } | null }[];
  consents: { document: string; document_version: string; accepted_at: string }[];
};

type Subscription = {
  status: string;
  quantity: number;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  plans: { name: string; price_cents: number; includes_tutoring: boolean } | null;
};

const date = (iso: string) => formatInZone(iso, "d MMM yyyy", MELBOURNE);

/** One student's profile for admins: family, plan, subjects, consents, recent reports and help. */
async function Student({ params }: Pick<PageProps<"/[lang]/admin/students/[id]">, "params">) {
  const [t, locale, { id }] = await Promise.all([getDictionary(), getLocale(), params]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const s = t.adminPages.students;
  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select(
      "id, first_name, last_initial, year_level, school, status, study_note, profiles!students_profile_id_fkey(email), parent_students(parent_id, profiles(full_name, email, acquisition_source)), student_subjects(wants_help, subjects(name, sort)), consents(document, document_version, accepted_at)",
    )
    .eq("id", id)
    .maybeSingle<StudentRecord>();
  if (!student) notFound();

  const since = reportWindowStart();
  const [{ data: subscriptions }, reports, { data: help }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("status, quantity, current_period_end, cancel_at_period_end, plans(name, price_cents, includes_tutoring)")
      .in("parent_id", student.parent_students.map((p) => p.parent_id))
      .in("status", [...ACTIVE_SUBSCRIPTION_STATUSES])
      .returns<Subscription[]>(),
    getParentReports(supabase, { studentId: id }),
    supabase
      .from("help_requests")
      .select("id, subject, description, status, priority, created_at")
      .eq("student_id", id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const subjects = student.student_subjects
    .filter((x) => x.subjects)
    .sort((a, b) => Number(b.wants_help) - Number(a.wants_help) || a.subjects!.sort - b.subjects!.sort);
  const sources = t.onboarding.details.sources;
  const section = "flex flex-col gap-2 rounded-md border border-hair bg-sheet px-4 py-3";
  const heading = "font-mono text-xs tracking-widest text-ink-soft uppercase";

  return (
    <AdminFrame title={`${student.first_name} ${student.last_initial}. · Year ${student.year_level}`} current="students">
      <Link href={localizePath("/admin/students", locale)} className="text-sm text-ink-soft underline-offset-4 hover:underline">
        ← {s.back}
      </Link>

      <div className="grid gap-3 md:grid-cols-2">
        <section className={section} data-testid="student-profile">
          <h2 className={heading}>{s.profile}</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-ink-soft">{s.status}</dt>
            <dd>{t.studentStatus[student.status as keyof typeof t.studentStatus] ?? student.status}</dd>
            <dt className="text-ink-soft">{s.school}</dt>
            <dd>{student.school ?? <span className="text-ink-faint">{s.notGiven}</span>}</dd>
            <dt className="text-ink-soft">{s.loginEmail}</dt>
            <dd className="break-all">{student.profiles?.email}</dd>
          </dl>
        </section>

        <section className={section} data-testid="student-family">
          <h2 className={heading}>{s.family}</h2>
          {student.parent_students.map((p) => (
            <div key={p.parent_id} className="text-sm">
              <div>{p.profiles?.full_name || p.profiles?.email}</div>
              <div className="break-all text-ink-soft">{p.profiles?.email}</div>
              {p.profiles?.acquisition_source && (
                <div className="text-xs text-ink-soft">
                  {s.heardFrom}: {sources[p.profiles.acquisition_source as keyof typeof sources] ?? p.profiles.acquisition_source}
                </div>
              )}
            </div>
          ))}
          <h3 className={`${heading} mt-2`}>{s.billing}</h3>
          {subscriptions?.length ? (
            subscriptions.map((sub, i) => (
              <p key={i} className="text-sm">
                {sub.plans?.name} · {sub.quantity} × {formatAud(sub.plans?.price_cents ?? 0)}
                {sub.plans?.includes_tutoring && <span className="ml-2 font-mono text-xs text-pen uppercase">{s.tutoring}</span>}
                {sub.current_period_end && (
                  <span className="text-ink-soft">
                    {" · "}
                    {fill(sub.cancel_at_period_end ? s.ends : s.renews, { date: date(sub.current_period_end) })}
                  </span>
                )}
              </p>
            ))
          ) : (
            <p className="text-sm text-ink-faint">{s.noPlan}</p>
          )}
        </section>

        <section className={section} data-testid="student-subjects">
          <h2 className={heading}>{s.subjects}</h2>
          {subjects.length ? (
            <ul className="flex flex-wrap gap-1.5 text-sm">
              {subjects.map((x) => (
                <li
                  key={x.subjects!.name}
                  className={`rounded-md border px-2 py-0.5 ${x.wants_help ? "border-pen-faint text-pen" : "border-hair text-ink-soft"}`}
                >
                  {x.subjects!.name}
                  {x.wants_help && <span className="ml-1 font-mono text-xs">· {s.wantsHelp}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-faint">{s.noSubjects}</p>
          )}
          {student.study_note && (
            <p className="text-sm">
              <span className="text-ink-soft">{s.note}:</span> {student.study_note}
            </p>
          )}
        </section>

        <section className={section} data-testid="student-consents">
          <h2 className={heading}>{s.consents}</h2>
          {student.consents.length ? (
            <ul className="text-sm">
              {student.consents.map((c) => (
                <li key={`${c.document}-${c.document_version}`}>
                  {c.document === "house_rules" ? "House rules" : "Privacy & child safety"} {c.document_version}
                  <span className="text-ink-soft"> · {date(c.accepted_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-faint">{s.noConsents}</p>
          )}
        </section>
      </div>

      <section className="flex flex-col gap-3" data-testid="student-reports">
        <h2 className={heading}>{s.reports}</h2>
        {reports.length ? (
          <ReportCards reports={reports} labels={{ en: en.reportCard, zh: zh.reportCard }} initialLang={locale} />
        ) : (
          <p className="text-sm text-ink-faint">{s.noReports}</p>
        )}
      </section>

      <section className="flex flex-col gap-2" data-testid="student-help">
        <h2 className={heading}>{s.help}</h2>
        {help?.length ? (
          <ul className="divide-y divide-rule rounded-md border border-hair bg-sheet text-sm">
            {help.map((h) => (
              <li key={h.id} className="flex flex-col gap-0.5 px-4 py-2">
                <span>
                  <span className="font-medium">{h.subject}</span>{" "}
                  <span className="font-mono text-xs text-ink-soft">
                    {t.student.help.status[h.status as keyof typeof t.student.help.status] ?? h.status} · {date(h.created_at)}
                  </span>
                </span>
                <span className="text-ink-soft">{h.description}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-faint">{s.noHelp}</p>
        )}
      </section>
    </AdminFrame>
  );
}
