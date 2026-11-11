import { createHash } from "node:crypto";
import { addDaysToDateKey } from "@/lib/time";

/**
 * Rewarding consistency (docs/consistency-and-solo.md). Pure, so it's unit-tested; the server side
 * (consistency-server.ts) loads the inputs. Days are Melbourne date keys ("2026-11-11").
 *
 * - A study day counts when the student reaches their daily goal in verified minutes, or finishes
 *   one thing (a quiz, notes or flashcards, a tutor's next step, or a solo task).
 * - A streak is the run of study days up to today. Today doesn't break it while it's still going.
 *   One missed day a week (Monday–Sunday) is used as a rest day instead of ending the streak.
 * - Points: +5 a study day, +15 for 5 study days in a week. Both sit outside the daily practice cap.
 */

export const GOAL_CHOICES = [15, 25, 45, 60] as const;
export const DEFAULT_GOAL_MINUTES = 25;
export const STUDY_DAY_POINTS = 5;
export const FULL_WEEK_POINTS = 15;
export const FULL_WEEK_DAYS = 5;
/** How far back a streak is counted. */
export const STREAK_LOOKBACK_DAYS = 120;

/** Days that count: goal minutes reached, or something finished. */
export function studyDays(minutesByDay: Map<string, number>, finishedDays: Set<string>, goalMinutes: number): Set<string> {
  const days = new Set(finishedDays);
  for (const [day, minutes] of minutesByDay) if (minutes >= goalMinutes) days.add(day);
  return days;
}

/** Monday of the week containing `day`. */
export function weekStart(day: string): string {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDaysToDateKey(day, -((dow + 6) % 7));
}

export type Streak = { length: number; restDays: Set<string>; todayCounted: boolean };

/**
 * The current streak. Counting back from today (or from yesterday, if today hasn't counted yet):
 * each study day adds one; the first missed day in a Monday–Sunday week is a rest day; a second
 * missed day in the same week, or reaching the lookback, ends it. Rest days don't add to the length.
 */
export function streak(days: Set<string>, today: string, lookback = STREAK_LOOKBACK_DAYS): Streak {
  const todayCounted = days.has(today);
  const restDays = new Set<string>();
  const restWeeks = new Set<string>();
  let length = 0;
  let day = todayCounted ? today : addDaysToDateKey(today, -1);
  for (let i = 0; i < lookback; i++, day = addDaysToDateKey(day, -1)) {
    if (days.has(day)) {
      length += 1;
      continue;
    }
    const week = weekStart(day);
    if (restWeeks.has(week)) break;
    restWeeks.add(week);
    restDays.add(day);
  }
  // A rest day only counts between study days: drop trailing ones the run never reached past.
  for (const rest of [...restDays]) {
    const earlier = [...days].some((d) => d < rest && d >= addDaysToDateKey(rest, -7));
    if (!earlier) restDays.delete(rest);
  }
  return { length, restDays, todayCounted };
}

export type DayDot = { day: string; label: string; state: "done" | "rest" | "today" | "missed" | "future" };

/** This week's seven dots, Monday to Sunday. */
export function weekDots(days: Set<string>, restDays: Set<string>, today: string): DayDot[] {
  const monday = weekStart(today);
  return ["M", "T", "W", "T", "F", "S", "S"].map((label, i) => {
    const day = addDaysToDateKey(monday, i);
    const state = days.has(day) ? "done" : restDays.has(day) ? "rest" : day === today ? "today" : day > today ? "future" : "missed";
    return { day, label, state };
  });
}

export function studyDaysInWeek(days: Set<string>, today: string): number {
  const monday = weekStart(today);
  return Array.from({ length: 7 }, (_, i) => addDaysToDateKey(monday, i)).filter((d) => days.has(d)).length;
}

/** A stable id per student and day (or week), so each consistency award is made once. */
export function awardLineage(profileId: string, kind: "study_day" | "full_week", key: string): string {
  const h = createHash("sha256").update(`${profileId}:${kind}:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
