/**
 * The weekly timetable as the public sees it: one or more session blocks, read from active
 * `schedules` (src/lib/public-timetable.ts). Pure functions, safe in Server and Client Components.
 * The owner is trialling shorter blocks (e.g. 4:00–6:00pm and 7:00–9:00pm); everything shown to
 * families is built from this, so changing the schedule in /admin/schedule changes the copy.
 */
export type TimetableBlock = {
  /** ISO weekdays, 1 = Monday. */
  days: number[];
  /** "HH:MM", Melbourne time. */
  start: string;
  end: string;
  blockMinutes: number;
  breakMinutes: number;
};
export type Lang = "en" | "zh";

/** Used until a schedule exists (and on the very first build). Matches scripts/seed.ts. */
export const DEFAULT_TIMETABLE: TimetableBlock[] = [{ days: [1, 2, 3, 4], start: "16:00", end: "20:00", blockMinutes: 50, breakMinutes: 10 }];
export const DOORS_OPEN_MINUTES = 10; // goals open this long before the start
const WRAP_UP_MINUTES = 10;

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** 16:00 -> "4:00pm" (en) or "16:00" (zh). */
export function formatClock(minutes: number, lang: Lang, { suffix = true } = {}): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = String(minutes % 60).padStart(2, "0");
  if (lang === "zh") return `${String(h).padStart(2, "0")}:${m}`;
  return `${h % 12 || 12}:${m}${suffix ? (h < 12 ? "am" : "pm") : ""}`;
}

/** "4:00–6:00pm" / "11:30am–1:00pm" (en), "16:00–18:00" (zh). */
export function formatRange(start: number, end: number, lang: Lang): string {
  const sameHalf = Math.floor(start / 720) === Math.floor(end / 720);
  return `${formatClock(start, lang, { suffix: !sameHalf })}–${formatClock(end, lang)}`;
}

/** Distinct blocks in time order, merging rooms that share a time. */
export function distinctBlocks(blocks: TimetableBlock[]): TimetableBlock[] {
  const seen = new Map<string, TimetableBlock>();
  for (const b of [...blocks].sort((x, y) => toMinutes(x.start) - toMinutes(y.start))) {
    const key = `${b.start}-${b.end}`;
    const prev = seen.get(key);
    seen.set(key, prev ? { ...prev, days: [...new Set([...prev.days, ...b.days])].sort() } : b);
  }
  return [...seen.values()];
}

const list = (items: string[], lang: Lang) =>
  new Intl.ListFormat(lang === "zh" ? "zh-CN" : "en-AU", { type: "conjunction" }).format(items);

/** "4:00–6:00pm and 7:00–9:00pm". */
export function timesSummary(blocks: TimetableBlock[], lang: Lang): string {
  return list(distinctBlocks(blocks).map((b) => formatRange(toMinutes(b.start), toMinutes(b.end), lang)), lang);
}

const DAY_NAMES: Record<Lang, string[]> = {
  en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  zh: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
};

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "Monday to Thursday" ("Mon–Thu" with short) for a run of 3+ days, otherwise a list. */
export function daysSummary(blocks: TimetableBlock[], lang: Lang, { short = false } = {}): string {
  const days = [...new Set(blocks.flatMap((b) => b.days))].sort();
  if (!days.length) return "";
  const names = days.map((d) => (short && lang === "en" ? DAY_SHORT : DAY_NAMES[lang])[d - 1]);
  const run = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  if (run && days.length >= 3) {
    if (lang === "zh") return `${names[0]}至${names.at(-1)}`;
    return short ? `${names[0]}–${names.at(-1)}` : `${names[0]} to ${names.at(-1)}`;
  }
  return short && lang === "en" ? names.join(", ") : list(names, lang);
}

export type Segment = { kind: "doors" | "study" | "break" | "wrapup"; from: number; to: number };

/** Doors open, study blocks with breaks, then wrap-up: the shared timer for one block. */
export function sessionSegments(block: TimetableBlock): Segment[] {
  const start = toMinutes(block.start);
  const end = toMinutes(block.end);
  const studyEnd = end - WRAP_UP_MINUTES;
  const segments: Segment[] = [{ kind: "doors", from: start - DOORS_OPEN_MINUTES, to: start }];
  let t = start;
  while (t < studyEnd) {
    const to = Math.min(t + block.blockMinutes, studyEnd);
    segments.push({ kind: "study", from: t, to });
    t = to;
    if (t + block.breakMinutes + 1 > studyEnd) break;
    segments.push({ kind: "break", from: t, to: t + block.breakMinutes });
    t += block.breakMinutes;
  }
  segments.push({ kind: "wrapup", from: t, to: end });
  return segments;
}

export type TimetableStatus =
  | { kind: "today"; start: number; minutesToDoors: number }
  | { kind: "doors"; start: number }
  | { kind: "live"; end: number }
  | { kind: "later"; start: number; inDays: number }
  | { kind: "none" };

/** Where we are relative to the next block, given Melbourne's weekday (1–7) and minute of day. */
export function timetableStatus(blocks: TimetableBlock[], isoDay: number, minutes: number): TimetableStatus {
  const ordered = distinctBlocks(blocks);
  for (const b of ordered.filter((b) => b.days.includes(isoDay))) {
    const start = toMinutes(b.start);
    const end = toMinutes(b.end);
    if (minutes < start - DOORS_OPEN_MINUTES) return { kind: "today", start, minutesToDoors: start - DOORS_OPEN_MINUTES - minutes };
    if (minutes < start) return { kind: "doors", start };
    if (minutes < end) return { kind: "live", end };
  }
  for (let k = 1; k <= 7; k++) {
    const day = ((isoDay - 1 + k) % 7) + 1;
    const first = ordered.find((b) => b.days.includes(day));
    if (first) return { kind: "later", start: toMinutes(first.start), inDays: k };
  }
  return { kind: "none" };
}
