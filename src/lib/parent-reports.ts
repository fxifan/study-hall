import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enAU, zhCN } from "date-fns/locale";
import { en } from "@/i18n/dictionaries/en";
import { zh } from "@/i18n/dictionaries/zh";
import type { Outcome, ReportCardData, ReportLang } from "./report-card";
import { MELBOURNE, formatInZone } from "./time";

export const REPORT_WINDOW_DAYS = 14;

const FORMATS: Record<ReportLang, { date: string; time: string; locale: typeof enAU }> = {
  en: { date: en.reportCard.dateFormat, time: en.reportCard.timeFormat, locale: enAU },
  zh: { date: zh.reportCard.dateFormat, time: zh.reportCard.timeFormat, locale: zhCN },
};

function both(format: (lang: ReportLang) => string): Record<ReportLang, string> {
  return { en: format("en"), zh: format("zh") };
}
const date = (iso: string) => both((l) => formatInZone(iso, FORMATS[l].date, MELBOURNE, FORMATS[l].locale));
const time = (iso: string) => both((l) => formatInZone(iso, FORMATS[l].time, MELBOURNE, FORMATS[l].locale));
const minutesBetween = (from: number, to: number) => Math.max(0, Math.round((to - from) / 60_000));

type Enrolment = {
  session_id: string;
  student_id: string;
  students: { first_name: string; last_initial: string } | null;
  sessions: { starts_at: string; ends_at: string } | null;
};

/**
 * Session reports for the signed-in parent's children, built from what was recorded: attendance
 * (check-in and check-out) and the goals the student set and marked, plus the supervisor's comment
 * once a report has been approved. Sessions that ended in the last two weeks and have an attendance
 * record. RLS limits every query to the parent's own children. The supervisor's focus flags join
 * these when the report approval workflow exists (spec Phase 2).
 */
export async function getParentReports(supabase: SupabaseClient, now = new Date()): Promise<ReportCardData[]> {
  const since = new Date(now.getTime() - REPORT_WINDOW_DAYS * 86_400_000);
  const { data: enrolments, error } = await supabase
    .from("enrolments")
    .select("session_id, student_id, students(first_name, last_initial), sessions!inner(starts_at, ends_at)")
    .gte("sessions.starts_at", since.toISOString())
    .lt("sessions.ends_at", now.toISOString())
    .neq("sessions.status", "cancelled")
    .returns<Enrolment[]>();
  if (error) throw error;
  if (!enrolments?.length) return [];

  const sessionIds = [...new Set(enrolments.map((e) => e.session_id))];
  const [attendance, goals, reports] = await Promise.all([
    supabase.from("attendance").select("session_id, student_id, check_in_at, check_out_at, status").in("session_id", sessionIds),
    supabase.from("goals").select("session_id, student_id, position, text, outcome").in("session_id", sessionIds).order("position"),
    supabase
      .from("reports")
      .select("session_id, student_id, proctor_comment")
      .in("session_id", sessionIds)
      .in("status", ["approved", "sent"]),
  ]);
  for (const result of [attendance, goals, reports]) if (result.error) throw result.error;
  const key = (row: { session_id: string; student_id: string }) => `${row.session_id}:${row.student_id}`;

  return enrolments
    .toSorted((a, b) => Date.parse(b.sessions?.starts_at ?? "") - Date.parse(a.sessions?.starts_at ?? "")) // newest first
    .flatMap((e): ReportCardData[] => {
      const record = attendance.data!.find((a) => key(a) === key(e));
      if (!record || !e.sessions || !e.students) return [];
      const start = Date.parse(e.sessions.starts_at);
      const end = Date.parse(e.sessions.ends_at);
      const checkIn = record.check_in_at ? Date.parse(record.check_in_at) : null;
      const from = checkIn === null ? null : Math.max(checkIn, start);
      const to = Math.min(record.check_out_at ? Date.parse(record.check_out_at) : end, end);
      return [
        {
          id: key(e),
          student: `${e.students.first_name} ${e.students.last_initial}.`,
          date: date(e.sessions.starts_at),
          session: both((l) => `${time(e.sessions!.starts_at)[l]}–${time(e.sessions!.ends_at)[l]}`),
          attendance:
            from === null || record.status === "absent"
              ? { attended: false }
              : {
                  attended: true,
                  from: time(new Date(from).toISOString()),
                  to: time(new Date(to).toISOString()),
                  minutes: minutesBetween(from, to),
                  total: minutesBetween(start, end),
                },
          goals: goals
            .data!.filter((g) => key(g) === key(e))
            .map((g) => ({ text: g.text as string, outcome: g.outcome as Outcome | null })),
          observations: [],
          comment: reports.data!.find((r) => key(r) === key(e))?.proctor_comment ?? null,
        },
      ];
    });
}
