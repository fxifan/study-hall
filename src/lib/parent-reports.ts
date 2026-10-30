import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enAU, zhCN } from "date-fns/locale";
import { en } from "@/i18n/dictionaries/en";
import { zh } from "@/i18n/dictionaries/zh";
import { fill } from "@/i18n/fill";
import { FLAG_TYPES, type Localized, type Outcome, type ReportCardData, type ReportLang } from "./report-card";
import { MELBOURNE, formatInZone } from "./time";

export const REPORT_WINDOW_DAYS = 14;

/** The start of the report window (two weeks ago), as an ISO timestamp. */
export function reportWindowStart(now = new Date()): string {
  return new Date(now.getTime() - REPORT_WINDOW_DAYS * 86_400_000).toISOString();
}

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

const RELEASE_AFTER_MS = 60 * 60_000;

/** "Phone visible 2×" in both languages, plus any note as written. */
function flagLines(rows: { type: string; note: string | null }[]): Localized[] {
  const lines: Localized[] = [];
  for (const type of FLAG_TYPES) {
    const count = rows.filter((f) => f.type === type).length;
    if (count) lines.push({ en: fill(en.reportCard.flags[type], { n: count }), zh: fill(zh.reportCard.flags[type], { n: count }) });
  }
  return [...lines, ...rows.flatMap((f) => (f.note ? [f.note] : []))];
}

type Enrolment = {
  session_id: string;
  student_id: string;
  students: { first_name: string; last_initial: string } | null;
  sessions: { starts_at: string; ends_at: string } | null;
};

/**
 * Session reports for the signed-in parent's children (or, for an admin, one student with
 * `studentId`), built from what was recorded: attendance (check-in and check-out), the session plan
 * the student set and marked (self-reported), any work they uploaded, the supervisor's check-ins,
 * and the supervisor's comment once a report has been approved. Sessions that ended in the last two
 * weeks and have an attendance record. RLS limits every query to the parent's own children.
 */
export async function getParentReports(
  supabase: SupabaseClient,
  {
    now = new Date(),
    studentId,
    sessionId,
    includeUnreleased = false,
  }: { now?: Date; studentId?: string; sessionId?: string; includeUnreleased?: boolean } = {},
): Promise<ReportCardData[]> {
  const since = new Date(now.getTime() - REPORT_WINDOW_DAYS * 86_400_000);
  let query = supabase
    .from("enrolments")
    .select("session_id, student_id, students(first_name, last_initial), sessions!inner(starts_at, ends_at)")
    .neq("sessions.status", "cancelled");
  if (sessionId) query = query.eq("session_id", sessionId);
  else query = query.gte("sessions.starts_at", since.toISOString()).lt("sessions.ends_at", now.toISOString());
  if (studentId) query = query.eq("student_id", studentId);
  const { data: enrolments, error } = await query.returns<Enrolment[]>();
  if (error) throw error;
  if (!enrolments?.length) return [];

  const sessionIds = [...new Set(enrolments.map((e) => e.session_id))];
  const [attendance, goals, reports, checkIns, flags] = await Promise.all([
    supabase.from("attendance").select("session_id, student_id, check_in_at, check_out_at, status").in("session_id", sessionIds),
    supabase
      .from("goals")
      .select("session_id, student_id, position, text, subject, expected_output, outcome, result, note, goal_evidence(id, file_name)")
      .in("session_id", sessionIds)
      .order("position"),
    supabase
      .from("reports")
      .select("session_id, student_id, proctor_comment")
      .in("session_id", sessionIds)
      .in("status", ["approved", "sent"]),
    supabase
      .from("session_checkins")
      .select("session_id, student_id, template_en, template_zh, note")
      .in("session_id", sessionIds)
      .order("created_at"),
    supabase.from("focus_flags").select("session_id, student_id, type, note").in("session_id", sessionIds).order("created_at"),
  ]);
  for (const result of [attendance, goals, reports, checkIns, flags]) if (result.error) throw result.error;
  const key = (row: { session_id: string; student_id: string }) => `${row.session_id}:${row.student_id}`;

  return enrolments
    .toSorted((a, b) => Date.parse(b.sessions?.starts_at ?? "") - Date.parse(a.sessions?.starts_at ?? "")) // newest first
    .flatMap((e): ReportCardData[] => {
      const record = attendance.data!.find((a) => key(a) === key(e));
      if (!record || !e.sessions || !e.students) return [];
      const start = Date.parse(e.sessions.starts_at);
      const end = Date.parse(e.sessions.ends_at);
      // Parents see a report once it's approved, or 60 minutes after the session ends.
      const approved = reports.data!.find((r) => key(r) === key(e));
      if (!includeUnreleased && !approved && end + RELEASE_AFTER_MS > now.getTime()) return [];
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
            .map((g) => ({
              text: g.text as string,
              outcome: g.outcome as Outcome | null,
              subject: g.subject,
              expected: g.expected_output,
              result: g.result,
              note: g.note,
              evidence: (g.goal_evidence as { id: string; file_name: string }[]).map((x) => ({ id: x.id, name: x.file_name })),
            })),
          // Check-ins from a template read in either language; typed notes stay as written.
          observations: [
            ...flagLines(flags.data!.filter((f) => key(f) === key(e))),
            ...checkIns
              .data!.filter((c) => key(c) === key(e))
              .flatMap((c): Localized[] => [
                ...(c.template_en ? [{ en: c.template_en as string, zh: c.template_zh as string }] : []),
                ...(c.note ? [c.note as string] : []),
              ]),
          ],
          comment: approved?.proctor_comment ?? null,
        },
      ];
    });
}
