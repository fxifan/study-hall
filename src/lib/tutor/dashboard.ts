import { addDaysToDateKey, dateKeyOf, isoWeekdayOfDateKey, zonedDateTimeToUtc } from "@/lib/time";
import { sessionCharge } from "./invoice-math";

/**
 * Dashboard data shapes and maths (tutor dashboard brief). Pure functions: the page loads rows,
 * these turn them into metrics and calendar items. Weeks run Monday to Sunday, Melbourne time.
 */

export type LessonRow = {
  id: string;
  student_id: string;
  starts_at: string;
  duration_min: number;
  subjects: string[];
  notes: string | null;
  meeting_link_id: string | null;
  status: "scheduled" | "cancelled";
  session_id: string | null;
};
export type SessionRow = { id: string; student_id: string; starts_at: string; duration_min: number; rate_cents: number; subjects: string[]; report_id: string | null };

export type CalendarItem = {
  id: string;
  kind: "lesson" | "session";
  studentId: string;
  studentName: string;
  startsAt: string;
  durationMin: number;
  subjects: string[];
  /** scheduled: still to happen (or not logged yet); done: logged; cancelled. */
  status: "scheduled" | "done" | "cancelled";
  notes: string | null;
  meetingLinkId: string | null;
  lessonId: string | null;
  reportId: string | null;
};

/** Monday of the week containing dateKey. */
export function weekStartKey(dateKey: string): string {
  return addDaysToDateKey(dateKey, 1 - isoWeekdayOfDateKey(dateKey));
}

export function weekRange(dateKey: string): { startKey: string; start: Date; end: Date } {
  const startKey = weekStartKey(dateKey);
  return { startKey, start: zonedDateTimeToUtc(startKey, "00:00"), end: zonedDateTimeToUtc(addDaysToDateKey(startKey, 7), "00:00") };
}

/** First day of the month grid: the Monday on or before the 1st. */
export function monthGridStart(dateKey: string): string {
  return weekStartKey(`${dateKey.slice(0, 7)}-01`);
}

/**
 * Lessons and logged sessions as one list. A logged session that came from a lesson shows once,
 * as the lesson marked done. Sessions logged without a lesson show as done.
 */
export function calendarItems(lessons: LessonRow[], sessions: SessionRow[], names: Map<string, string>): CalendarItem[] {
  const fromLesson = new Set(lessons.flatMap((l) => (l.session_id ? [l.session_id] : [])));
  const reportBySession = new Map(sessions.map((s) => [s.id, s.report_id]));
  return [
    ...lessons.map(
      (l): CalendarItem => ({
        id: `lesson:${l.id}`,
        kind: "lesson",
        studentId: l.student_id,
        studentName: names.get(l.student_id) ?? "Student",
        startsAt: l.starts_at,
        durationMin: l.duration_min,
        subjects: l.subjects,
        status: l.status === "cancelled" ? "cancelled" : l.session_id ? "done" : "scheduled",
        notes: l.notes,
        meetingLinkId: l.meeting_link_id,
        lessonId: l.id,
        reportId: l.session_id ? (reportBySession.get(l.session_id) ?? null) : null,
      }),
    ),
    ...sessions
      .filter((s) => !fromLesson.has(s.id))
      .map(
        (s): CalendarItem => ({
          id: `session:${s.id}`,
          kind: "session",
          studentId: s.student_id,
          studentName: names.get(s.student_id) ?? "Student",
          startsAt: s.starts_at,
          durationMin: s.duration_min,
          subjects: s.subjects,
          status: "done",
          notes: null,
          meetingLinkId: null,
          lessonId: null,
          reportId: s.report_id,
        }),
      ),
  ].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export type Metrics = {
  activeStudents: number;
  earningsThisWeekCents: number;
  earningsLastWeekCents: number;
  lessonsThisWeek: number;
  lessonsLastWeek: number;
  upcomingLessons: number;
};

/**
 * - Active students: taught (logged session) in the last 30 days, or with a lesson booked from now on.
 * - Earnings this week: logged sessions this week at their rate (what goes on invoices), not payments.
 * - Lessons this week: logged sessions plus scheduled lessons not yet logged, cancelled ones excluded.
 * - Upcoming lessons: scheduled, not logged, starting from now, in the next 7 days.
 */
export function computeMetrics(lessons: LessonRow[], sessions: SessionRow[], now = new Date()): Metrics {
  const today = dateKeyOf(now);
  const thisWeek = weekRange(today);
  const lastWeek = weekRange(addDaysToDateKey(today, -7));
  const t = (iso: string) => Date.parse(iso);
  const inRange = (iso: string, r: { start: Date; end: Date }) => t(iso) >= r.start.getTime() && t(iso) < r.end.getTime();
  const open = lessons.filter((l) => l.status === "scheduled" && !l.session_id);
  const earnings = (r: { start: Date; end: Date }) =>
    sessions.filter((s) => inRange(s.starts_at, r)).reduce((sum, s) => sum + sessionCharge(s.duration_min, s.rate_cents), 0);
  const lessonCount = (r: { start: Date; end: Date }) =>
    sessions.filter((s) => inRange(s.starts_at, r)).length + open.filter((l) => inRange(l.starts_at, r)).length;
  const monthAgo = now.getTime() - 30 * 86_400_000;
  const active = new Set([
    ...sessions.filter((s) => t(s.starts_at) >= monthAgo).map((s) => s.student_id),
    ...open.filter((l) => t(l.starts_at) >= now.getTime()).map((l) => l.student_id),
  ]);
  const weekAhead = now.getTime() + 7 * 86_400_000;
  return {
    activeStudents: active.size,
    earningsThisWeekCents: earnings(thisWeek),
    earningsLastWeekCents: earnings(lastWeek),
    lessonsThisWeek: lessonCount(thisWeek),
    lessonsLastWeek: lessonCount(lastWeek),
    upcomingLessons: open.filter((l) => t(l.starts_at) >= now.getTime() && t(l.starts_at) < weekAhead).length,
  };
}

/**
 * A plausible Zoom meeting link: https on zoom.us / zoom.com (including company and regional
 * subdomains such as us02web.zoom.us), pointing at a meeting (/j/123…), a personal room (/my/name)
 * or a web-client join. Returns the cleaned URL or an error message.
 */
export function checkZoomUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "That doesn't look like a link. Paste the full Zoom link, starting with https://" };
  }
  if (url.protocol !== "https:") return { ok: false, error: "Zoom links start with https://" };
  const host = url.hostname.toLowerCase();
  if (!/(^|\.)zoom\.(us|com)$/.test(host)) return { ok: false, error: "Only Zoom links (zoom.us) can be saved for now." };
  if (!/^\/(j\/\d{9,12}|my\/[\w.-]+|s\/\d{9,12}|wc\/(join\/)?\d{9,12})\/?/.test(url.pathname)) {
    return { ok: false, error: "That's a Zoom address but not a meeting link. Copy the invite link, e.g. https://zoom.us/j/1234567890" };
  }
  return { ok: true, url: url.toString() };
}
