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
  /** Logged sessions that have started this week (delivered, not booked). */
  lessonsCompletedThisWeek: number;
  lessonsCompletedLastWeek: number;
  /** Last week had logged sessions, so a comparison means something. */
  hasLastWeek: boolean;
  upcomingLessons: number;
  /** Monday and Sunday of this week (Melbourne date keys), for labels. */
  weekStartKey: string;
  weekEndKey: string;
};

/**
 * - Active students: taught (logged session) in the last 30 days, or with a lesson booked from now on.
 * - Earnings this week: logged sessions this week (Mon–Sun) at their rate (what goes on invoices),
 *   not payments received.
 * - Lessons completed: logged sessions this week that have started. A booked lesson never counts
 *   until it's logged.
 * - Upcoming lessons: scheduled, not logged, starting from now, in the next 7 days.
 * - Comparisons with last week only when last week has logged sessions (hasLastWeek).
 */
export function computeMetrics(lessons: LessonRow[], sessions: SessionRow[], now = new Date()): Metrics {
  const today = dateKeyOf(now);
  const thisWeek = weekRange(today);
  const lastWeek = weekRange(addDaysToDateKey(today, -7));
  const t = (iso: string) => Date.parse(iso);
  const inRange = (iso: string, r: { start: Date; end: Date }) => t(iso) >= r.start.getTime() && t(iso) < r.end.getTime();
  const open = lessons.filter((l) => l.status === "scheduled" && !l.session_id);
  const delivered = (r: { start: Date; end: Date }) => sessions.filter((s) => inRange(s.starts_at, r) && t(s.starts_at) <= now.getTime());
  const earnings = (r: { start: Date; end: Date }) =>
    sessions.filter((s) => inRange(s.starts_at, r)).reduce((sum, s) => sum + sessionCharge(s.duration_min, s.rate_cents), 0);
  const monthAgo = now.getTime() - 30 * 86_400_000;
  const active = new Set([
    ...sessions.filter((s) => t(s.starts_at) >= monthAgo).map((s) => s.student_id),
    ...open.filter((l) => t(l.starts_at) >= now.getTime()).map((l) => l.student_id),
  ]);
  const weekAhead = now.getTime() + 7 * 86_400_000;
  const lastWeekSessions = delivered(lastWeek);
  return {
    activeStudents: active.size,
    earningsThisWeekCents: earnings(thisWeek),
    earningsLastWeekCents: earnings(lastWeek),
    lessonsCompletedThisWeek: delivered(thisWeek).length,
    lessonsCompletedLastWeek: lastWeekSessions.length,
    hasLastWeek: lastWeekSessions.length > 0,
    upcomingLessons: open.filter((l) => t(l.starts_at) >= now.getTime() && t(l.starts_at) < weekAhead).length,
    weekStartKey: thisWeek.startKey,
    weekEndKey: addDaysToDateKey(thisWeek.startKey, 6),
  };
}

export type NextAction =
  | { kind: "add_student" }
  | { kind: "open_class"; lessonId: string; studentName: string; url: string; startsAt: string }
  | { kind: "log_session"; count: number }
  | { kind: "schedule_lesson" }
  | { kind: "create_invoice"; cents: number }
  | { kind: "default" };

/**
 * The one action the dashboard puts first (dashboard review §2), in order of urgency:
 * no students → add one; a lesson with a class link starting within 15 minutes or under way → open
 * the class; past lessons not logged → log them; nothing booked ahead → schedule; logged work not
 * invoiced → create an invoice. Everything else stays reachable as a secondary action.
 */
export function nextAction(input: {
  studentCount: number;
  lessons: LessonRow[];
  linkUrl: (lesson: LessonRow) => string | null;
  names: Map<string, string>;
  unloggedCount: number;
  unbilledCents: number;
  now?: Date;
}): NextAction {
  const now = (input.now ?? new Date()).getTime();
  if (input.studentCount === 0) return { kind: "add_student" };
  const open = input.lessons.filter((l) => l.status === "scheduled" && !l.session_id);
  const live = open.find((l) => {
    const start = Date.parse(l.starts_at);
    return start - 15 * 60_000 <= now && now < start + l.duration_min * 60_000 && input.linkUrl(l);
  });
  if (live) return { kind: "open_class", lessonId: live.id, studentName: input.names.get(live.student_id) ?? "your student", url: input.linkUrl(live)!, startsAt: live.starts_at };
  if (input.unloggedCount > 0) return { kind: "log_session", count: input.unloggedCount };
  if (!open.some((l) => Date.parse(l.starts_at) >= now)) return { kind: "schedule_lesson" };
  if (input.unbilledCents > 0) return { kind: "create_invoice", cents: input.unbilledCents };
  return { kind: "default" };
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
