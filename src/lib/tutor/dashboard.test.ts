import { describe, expect, it } from "vitest";
import { calendarItems, checkZoomUrl, computeMetrics, monthGridStart, weekStartKey, type LessonRow, type SessionRow } from "./dashboard";
import { buildIcs, foldLine } from "./ics";

// Wednesday 4 Nov 2026, 10:00 in Melbourne (AEDT, UTC+11).
const now = new Date("2026-11-03T23:00:00Z");
const at = (key: string, time: string) => new Date(`${key}T${time}:00+11:00`).toISOString();
const lesson = (id: string, starts: string, extra: Partial<LessonRow> = {}): LessonRow => ({
  id, student_id: "ava", starts_at: starts, duration_min: 60, subjects: ["Methods"], notes: null, meeting_link_id: null, status: "scheduled", session_id: null, ...extra,
});
const session = (id: string, starts: string, extra: Partial<SessionRow> = {}): SessionRow => ({
  id, student_id: "ava", starts_at: starts, duration_min: 60, rate_cents: 6000, subjects: ["Methods"], report_id: null, ...extra,
});

describe("weeks", () => {
  it("start on Monday, Melbourne time", () => {
    expect(weekStartKey("2026-11-04")).toBe("2026-11-02");
    expect(weekStartKey("2026-11-08")).toBe("2026-11-02"); // Sunday
    expect(weekStartKey("2026-11-09")).toBe("2026-11-09");
    expect(monthGridStart("2026-11-18")).toBe("2026-10-26"); // 1 Nov is a Sunday
  });
});

describe("metrics", () => {
  it("counts this week's and last week's lessons and earnings, and what's coming up", () => {
    const lessons = [
      lesson("l1", at("2026-11-05", "16:00")), // this week, upcoming
      lesson("l2", at("2026-11-10", "16:00"), { student_id: "leo" }), // next week, within 7 days
      lesson("l3", at("2026-11-06", "16:00"), { status: "cancelled" }), // ignored
      lesson("l4", at("2026-11-02", "16:00"), { session_id: "s1" }), // logged: counted via s1
      lesson("l5", at("2026-11-20", "16:00"), { student_id: "mia" }), // beyond 7 days, but makes Mia active
    ];
    const sessions = [
      session("s1", at("2026-11-02", "16:00")),
      session("s2", at("2026-11-03", "17:00"), { duration_min: 90 }),
      session("s3", at("2026-10-28", "16:00"), { rate_cents: 7000 }), // last week
      session("s4", at("2026-09-01", "16:00"), { student_id: "old" }), // > 30 days: not active
    ];
    expect(computeMetrics(lessons, sessions, now)).toEqual({
      activeStudents: 3, // ava, leo, mia
      earningsThisWeekCents: 6000 + 9000,
      earningsLastWeekCents: 7000,
      lessonsThisWeek: 3, // s1, s2, l1
      lessonsLastWeek: 1,
      upcomingLessons: 2, // l1, l2
    });
  });

  it("is all zeros for a new tutor", () => {
    expect(computeMetrics([], [], now)).toEqual({ activeStudents: 0, earningsThisWeekCents: 0, earningsLastWeekCents: 0, lessonsThisWeek: 0, lessonsLastWeek: 0, upcomingLessons: 0 });
  });
});

describe("calendar items", () => {
  it("shows a logged lesson once, as done, with its report", () => {
    const items = calendarItems(
      [lesson("l1", at("2026-11-02", "16:00"), { session_id: "s1" }), lesson("l2", at("2026-11-05", "16:00"))],
      [session("s1", at("2026-11-02", "16:00"), { report_id: "r1" }), session("s9", at("2026-11-03", "09:00"))],
      new Map([["ava", "Ava C."]]),
    );
    expect(items.map((i) => [i.id, i.status, i.reportId])).toEqual([
      ["lesson:l1", "done", "r1"],
      ["session:s9", "done", null],
      ["lesson:l2", "scheduled", null],
    ]);
    expect(items[0].studentName).toBe("Ava C.");
  });
});

describe("Zoom links", () => {
  it("accepts meeting, personal-room and regional links", () => {
    for (const url of ["https://zoom.us/j/1234567890", "https://us02web.zoom.us/j/81234567890?pwd=abc", "https://zoom.us/my/ms.lee", "https://acme.zoom.com/j/123456789", " https://zoom.us/wc/join/1234567890 "]) {
      expect(checkZoomUrl(url).ok, url).toBe(true);
    }
  });
  it("refuses other links, plain http and non-meeting Zoom pages", () => {
    expect(checkZoomUrl("https://meet.google.com/abc-defg-hij")).toEqual({ ok: false, error: "Only Zoom links (zoom.us) can be saved for now." });
    expect(checkZoomUrl("http://zoom.us/j/1234567890").ok).toBe(false);
    expect(checkZoomUrl("https://zoom.us/pricing").ok).toBe(false);
    expect(checkZoomUrl("https://zoom.us.evil.com/j/1234567890").ok).toBe(false);
    expect(checkZoomUrl("zoom.us/j/123").ok).toBe(false);
  });
});

describe("calendar feed", () => {
  const ics = buildIcs("Tutoring, Jamie", [
    { id: "l1", startsAt: at("2026-11-05", "16:00"), durationMin: 90, title: "Tutoring: Ava C., Methods", description: "Notes; with, commas\nline 2", url: "https://zoom.us/j/1234567890", cancelled: false, updatedAt: now.toISOString() },
    { id: "l2", startsAt: at("2026-11-06", "16:00"), durationMin: 60, title: "Tutoring: Leo", description: "", url: null, cancelled: true, updatedAt: now.toISOString() },
  ], now);

  it("is valid iCalendar with stable UIDs, UTC times and cancellations", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:lesson-l1@studyhall");
    expect(ics).toContain("DTSTART:20261105T050000Z");
    expect(ics).toContain("DTEND:20261105T063000Z");
    expect(ics).toContain("DESCRIPTION:Notes\; with\\, commas\\nline 2");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });

  it("folds long lines without splitting characters", () => {
    const folded = foldLine(`SUMMARY:${"链式法则".repeat(20)}`);
    expect(folded.split("\r\n ").join("")).toBe(`SUMMARY:${"链式法则".repeat(20)}`);
    expect(folded.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });
});
