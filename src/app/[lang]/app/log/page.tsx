import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { accessFor, requireTutor } from "@/lib/tutor/server";
import { dateKeyOf, formatInZone } from "@/lib/time";
import { shortWhen } from "@/lib/tutor/format";
import { AddStudentForm } from "../students/add-student-form";
import { Loading, TutorShell, appHref } from "../_components/shell";
import { blockedMessage } from "../_components/plan-banner";
import { LogForm, type LogStudent } from "./log-form";

export const metadata: Metadata = { title: "Log a session" };

export default function LogPage({ searchParams }: PageProps<"/[lang]/app/log">) {
  return (
    <Suspense fallback={<Loading />}>
      <Log searchParams={searchParams} />
    </Suspense>
  );
}

/** Start time default: an hour ago, rounded down to the quarter hour (the session just ended). */
function defaultStart(now: Date): string {
  const [h, m] = formatInZone(now, "HH:mm").split(":").map(Number);
  const mins = Math.max(0, Math.floor((h * 60 + m - 60) / 15) * 15);
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

async function Log({ searchParams }: Pick<PageProps<"/[lang]/app/log">, "searchParams">) {
  const [me, locale, query] = await Promise.all([requireTutor(), getLocale(), searchParams]);
  const supabase = await createClient();
  const [{ data: rows }, { data: families }, access] = await Promise.all([
    supabase
      .from("tutor_students")
      .select("id, first_name, last_initial, subjects, tutor_families(report_lang)")
      .order("first_name")
      .returns<{ id: string; first_name: string; last_initial: string; subjects: string[]; tutor_families: { report_lang: string } | null }[]>(),
    supabase.from("tutor_families").select("id, parent_name").order("parent_name"),
    accessFor(me.tutor),
  ]);
  const students: LogStudent[] = (rows ?? []).map((s) => ({
    id: s.id,
    name: `${s.first_name} ${s.last_initial}.`,
    subjects: s.subjects,
    lang: s.tutor_families?.report_lang ?? "en",
  }));
  const now = new Date();
  const studentParam = typeof query.student === "string" ? query.student : null;
  // From the dashboard calendar: log a scheduled lesson, with its student and time filled in.
  const lessonParam = typeof query.lesson === "string" && /^[0-9a-f-]{36}$/i.test(query.lesson) ? query.lesson : null;
  const { data: lesson } = lessonParam
    ? await supabase
        .from("tutor_lessons")
        .select("id, student_id, starts_at, duration_min, subjects, session_id")
        .eq("id", lessonParam)
        .is("session_id", null)
        .maybeSingle()
    : { data: null };

  return (
    <TutorShell tutor={me} title="Log a session" current="log">
      {lesson && <p className="text-sm text-ink-soft">Logging your scheduled lesson on {shortWhen(lesson.starts_at)}.</p>}
      {students.length ? (
        <LogForm
          students={students}
          defaults={
            lesson
              ? { date: dateKeyOf(lesson.starts_at), startTime: formatInZone(lesson.starts_at, "HH:mm"), durationMin: lesson.duration_min }
              : { date: dateKeyOf(now), startTime: defaultStart(now), durationMin: 60 }
          }
          initialStudentId={lesson?.student_id ?? (students.some((s) => s.id === studentParam) ? studentParam : null)}
          lessonId={lesson?.id ?? null}
          initialSubjects={lesson?.subjects.length ? lesson.subjects : null}
          reportPath={appHref("/app/reports", locale)}
          blocked={access.ok ? null : blockedMessage(access.reason)}
        />
      ) : (
        <>
          <p className="text-ink-soft">Add your first student to log a session. It takes 20 seconds.</p>
          <AddStudentForm families={families ?? []} defaultLang={me.tutor.report_langs.length > 1 ? "both" : me.tutor.report_langs[0]} next="log" />
        </>
      )}
      {students.length > 0 && (
        <p className="text-sm text-ink-soft">
          New student?{" "}
          <Link className="underline" href={appHref("/app/students", locale)}>
            Add them here
          </Link>
          .
        </p>
      )}
    </TutorShell>
  );
}
