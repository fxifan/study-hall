import { addDaysToDateKey, dateKeyOf, dayRangeUtc } from "@/lib/time";

/**
 * Study-time credit (student social brief, "Shared daily goal and timer"). Pure functions, so the
 * acceptance scenarios are unit tests (credit.test.ts). The server stores credited intervals; an
 * open interval's end is bounded by the session's last valid heartbeat, never by "now", so a
 * device that disappears earns nothing past its last proof of activity.
 */

/** A heartbeat must arrive within this many seconds or the open interval is closed at the last one. */
export const BEAT_GRACE_SECONDS = 75;
/** A live session with no heartbeat for this long is stopped (timeout) by the next read or cron. */
export const STALE_SECONDS = 10 * 60;

export type CreditInterval = {
  profileId: string;
  startedAt: string;
  /** Null while open. */
  endedAt: string | null;
  /** The session's last heartbeat: bounds an open interval. */
  lastBeatAt: string;
};

/** [start, end) in ms that an interval actually earned. Open intervals end at the last heartbeat. */
export function effectiveSpan(i: CreditInterval, now: number): [number, number] {
  const start = Date.parse(i.startedAt);
  const end = i.endedAt ? Date.parse(i.endedAt) : Math.min(Date.parse(i.lastBeatAt), now);
  return [start, Math.max(start, end)];
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

/**
 * The heartbeat state machine, as a plan of writes (server.ts applies it). Given the session's
 * current open interval and last beat, decide what to close and open.
 *  - A gap longer than the grace closes the open interval at the last beat (no credit for the gap).
 *  - active: make sure an interval is open (from now).
 *  - inactive (hidden, idle, paused): close the open interval at now.
 */
export type BeatPlan = { closeAt: string | null; openAt: string | null; state: "running" | "paused" };

export function planBeat(input: { hasOpen: boolean; lastBeatAt: string; now: Date; active: boolean }): BeatPlan {
  const nowIso = input.now.toISOString();
  const gap = (input.now.getTime() - Date.parse(input.lastBeatAt)) / 1000;
  let open = input.hasOpen;
  let closeAt: string | null = null;
  if (open && gap > BEAT_GRACE_SECONDS) {
    closeAt = input.lastBeatAt;
    open = false;
  }
  if (input.active) return { closeAt, openAt: open ? null : nowIso, state: "running" };
  if (open) closeAt = nowIso;
  return { closeAt, openAt: null, state: "paused" };
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
