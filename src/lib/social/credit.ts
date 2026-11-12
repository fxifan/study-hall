import { addDaysToDateKey, dateKeyOf, dayRangeUtc } from "@/lib/time";

/**
 * Study-time credit (student social brief, "Shared daily goal and timer"; timer rule in
 * docs/ui-refresh-and-timer.md). Pure functions, so the acceptance scenarios are unit tests.
 *
 * A session is an honour-based log: time counts from Start until Pause or Finish, whatever tab or
 * app the student is in. Heartbeats only say "Edumi is open somewhere". If Edumi has been closed
 * everywhere for longer than AWAY_LIMIT_SECONDS, the time after the last heartbeat is held back
 * (not counted for groups or ranks) until the student says what to count.
 */

/** Edumi closed everywhere for up to this long still counts. Longer, the student chooses on return. */
export const AWAY_LIMIT_SECONDS = 2 * 60 * 60;
/** A session this long asks the student to confirm it at Finish. */
export const LONG_SESSION_SECONDS = 6 * 60 * 60;
/** A session nobody came back to for this long is closed at the last time Edumi was open. */
export const ABANDONED_SECONDS = 24 * 60 * 60;

export type CreditInterval = {
  profileId: string;
  startedAt: string;
  /** Null while open. */
  endedAt: string | null;
  /** The session's last heartbeat: when Edumi was last open somewhere. */
  lastBeatAt: string;
};

/** True when Edumi has been closed everywhere for longer than the away limit. */
export function awayTooLong(lastBeatAt: string, now: number): boolean {
  return now - Date.parse(lastBeatAt) > AWAY_LIMIT_SECONDS * 1000;
}

/** Where an open interval's counted time ends: now, or the last heartbeat after a long absence. */
export function openEnd(lastBeatAt: string, now: number): number {
  return awayTooLong(lastBeatAt, now) ? Date.parse(lastBeatAt) : now;
}

/** [start, end) in ms that an interval actually earned. */
export function effectiveSpan(i: CreditInterval, now: number): [number, number] {
  const start = Date.parse(i.startedAt);
  const end = i.endedAt ? Date.parse(i.endedAt) : openEnd(i.lastBeatAt, now);
  return [start, Math.max(start, end)];
}

/**
 * End a session's time at `end`: pieces that start at or after it are dropped, and any piece still
 * open or running past it is closed there. Used by Finish and by "pick when I stopped".
 */
export function trimTo(intervals: { id: string; started_at: string; ended_at: string | null }[], end: string): { drop: string[]; close: string[] } {
  const e = Date.parse(end);
  const drop: string[] = [];
  const close: string[] = [];
  for (const i of intervals) {
    if (Date.parse(i.started_at) >= e) drop.push(i.id);
    else if (!i.ended_at || Date.parse(i.ended_at) > e) close.push(i.id);
  }
  return { drop, close };
}

/** Clamp a student-picked stop time into [start, now]. */
export function clampEnd(picked: string, start: string, now: number): string {
  const t = Math.min(Math.max(Date.parse(picked), Date.parse(start)), now);
  return new Date(t).toISOString();
}

function overlapSeconds([a, b]: [number, number], [c, d]: [number, number]): number {
  return Math.max(0, Math.min(b, d) - Math.max(a, c)) / 1000;
}

/** Seconds each member earned inside [from, to). Concurrent members add up (2 × 30 min = 60 min). */
export function secondsByMember(intervals: CreditInterval[], from: Date, to: Date, now = Date.now()): Map<string, number> {
  const window: [number, number] = [from.getTime(), to.getTime()];
  const out = new Map<string, number>();
  for (const i of intervals) {
    const s = overlapSeconds(effectiveSpan(i, now), window);
    if (s > 0) out.set(i.profileId, (out.get(i.profileId) ?? 0) + s);
  }
  return out;
}

/** The group day (yyyy-MM-dd in the group's zone) an instant falls on. */
export function groupDayOf(instant: Date | number | string, timeZone: string): string {
  return dateKeyOf(instant, timeZone);
}

/** [start, end) of a local day: splitting at local midnight is just this window. */
export function dayWindow(day: string, timeZone: string): { start: Date; end: Date } {
  return dayRangeUtc(day, timeZone);
}

/** [start of the ISO week (Monday) containing `day`, end of `day`'s week). */
export function weekWindow(day: string, timeZone: string): { start: Date; end: Date; firstDay: string } {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay() || 7;
  const firstDay = addDaysToDateKey(day, 1 - weekday);
  return { start: dayRangeUtc(firstDay, timeZone).start, end: dayRangeUtc(addDaysToDateKey(firstDay, 6), timeZone).end, firstDay };
}

export type GoalProgress = { targetMinutes: number; doneMinutes: number; remainingMinutes: number; reached: boolean };

/** Remaining minutes floor at zero; contributions keep counting after the goal is reached. */
export function goalProgress(targetMinutes: number, totalSeconds: number): GoalProgress {
  const doneMinutes = Math.floor(totalSeconds / 60);
  return { targetMinutes, doneMinutes, remainingMinutes: Math.max(0, targetMinutes - doneMinutes), reached: doneMinutes >= targetMinutes };
}

/** "5 hours", "1 hour 20 minutes", "45 minutes". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hp = `${h} hour${h === 1 ? "" : "s"}`;
  const mp = `${m} minute${m === 1 ? "" : "s"}`;
  if (h && m) return `${hp} ${mp}`;
  return h ? hp : mp;
}

/** "2h 05m" for boards. */
export function shortMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export type Standing = { profileId: string; seconds: number; rank: number };

/** Highest first; ties share a rank (1, 1, 3). */
export function rank(totals: Map<string, number>): Standing[] {
  const sorted = [...totals.entries()].map(([profileId, seconds]) => ({ profileId, seconds })).sort((a, b) => b.seconds - a.seconds);
  let last = -1;
  let lastRank = 0;
  return sorted.map((s, i) => {
    const minutes = Math.floor(s.seconds / 60);
    if (minutes !== last) {
      lastRank = i + 1;
      last = minutes;
    }
    return { ...s, rank: lastRank };
  });
}

/** Day-end standout: every member tied for the most minutes, or nobody when there's no activity. */
export function standouts(totals: Map<string, number>): string[] {
  const ranked = rank(totals).filter((s) => Math.floor(s.seconds / 60) > 0);
  return ranked.filter((s) => s.rank === 1).map((s) => s.profileId);
}
