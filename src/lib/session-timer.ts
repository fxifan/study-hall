/**
 * Where a session is on its block timer (spec §4.2: default 50 min study / 10 min break). The session
 * is a run of (study + break) cycles; the last cycle's break is the wrap-up when goals get marked.
 * Pure, so it runs in the browser and in tests.
 */
export type TimerPhase =
  | { kind: "before"; remainingMs: number }
  | { kind: "study"; block: number; totalBlocks: number; remainingMs: number }
  | { kind: "break"; remainingMs: number }
  | { kind: "wrapup"; remainingMs: number }
  | { kind: "ended" };

export function timerPhase(
  nowMs: number,
  startsAtMs: number,
  endsAtMs: number,
  blockMinutes = 50,
  breakMinutes = 10,
): TimerPhase {
  if (nowMs < startsAtMs) return { kind: "before", remainingMs: startsAtMs - nowMs };
  if (nowMs >= endsAtMs) return { kind: "ended" };

  const block = blockMinutes * 60_000;
  const cycle = (blockMinutes + breakMinutes) * 60_000;
  const totalBlocks = Math.max(1, Math.floor((endsAtMs - startsAtMs) / cycle));
  const elapsed = nowMs - startsAtMs;
  const index = Math.min(Math.floor(elapsed / cycle), totalBlocks - 1);
  const within = elapsed - index * cycle;

  if (within < block) return { kind: "study", block: index + 1, totalBlocks, remainingMs: block - within };
  if (index === totalBlocks - 1) return { kind: "wrapup", remainingMs: endsAtMs - nowMs };
  return { kind: "break", remainingMs: cycle - within };
}

/** Doors open this long before the start (matches public.check_in). */
export const DOORS_OPEN_MS = 10 * 60_000;

/** Whether a session can be joined now, and whether it hasn't started yet. */
export function sessionWindow(startsAt: string, endsAt: string, nowMs = Date.now()) {
  const startsMs = Date.parse(startsAt);
  const endsMs = Date.parse(endsAt);
  return {
    open: nowMs >= startsMs - DOORS_OPEN_MS && nowMs < endsMs,
    upcoming: nowMs < startsMs - DOORS_OPEN_MS,
    doorsAt: new Date(startsMs - DOORS_OPEN_MS).toISOString(),
  };
}

/** 83_000 -> "1:23"; 3_723_000 -> "1:02:03". */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
