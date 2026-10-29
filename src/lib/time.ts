/**
 * The one place dates and times are handled (spec §10). Store instants in UTC; show them in
 * Australia/Melbourne. Every function takes an optional IANA zone so a schedule's own `timezone`
 * column can be passed through, but nothing else should need it.
 *
 * DST rules, inherited from @date-fns/tz and pinned by tests in time.test.ts:
 *  - a wall-clock time that doesn't exist (02:00–02:59 on the first Sunday of October) moves forward
 *    an hour, e.g. 02:30 becomes 03:30 AEDT;
 *  - a wall-clock time that happens twice (02:00–02:59 on the first Sunday of April) resolves to the
 *    first occurrence, still in AEDT.
 *
 * "Date keys" are calendar dates as 'yyyy-MM-dd' strings in the zone, e.g. '2026-10-29'.
 */
import { TZDate } from "@date-fns/tz";
import { format, parseISO, type Locale } from "date-fns";

export const MELBOURNE = "Australia/Melbourne";

export type Instant = Date | string | number;

function toDate(instant: Instant): Date {
  return typeof instant === "string" ? parseISO(instant) : new Date(instant);
}

function parseDateKey(dateKey: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error(`Expected a yyyy-MM-dd date, got "${dateKey}"`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function parseTime(time: string): [number, number, number] {
  // Accepts 'HH:mm' and Postgres `time` values like '16:00:00'.
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!match) throw new Error(`Expected an HH:mm time, got "${time}"`);
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

/** The given instant as a zoned date (defaults to now). Use it with date-fns functions. */
export function inZone(instant: Instant = Date.now(), timeZone = MELBOURNE): TZDate {
  return new TZDate(toDate(instant).getTime(), timeZone);
}

/**
 * Format an instant in Melbourne time using a date-fns pattern, e.g. 'EEE d MMM' or 'h:mmaaa'.
 * Pass a date-fns locale (getDateLocale() in src/i18n/server.ts) for translated day and month names.
 */
export function formatInZone(instant: Instant, pattern: string, timeZone = MELBOURNE, locale?: Locale): string {
  return format(inZone(instant, timeZone), pattern, { locale });
}

/**
 * "30 October 2026" in Melbourne. Uses Intl rather than TZDate (which reads the clock internally),
 * so it's safe on prerendered pages such as /legal/*.
 */
export function formatLongDate(instant: Instant, timeZone = MELBOURNE): string {
  return new Intl.DateTimeFormat("en-AU", { timeZone, day: "numeric", month: "long", year: "numeric" }).format(
    new Date(instant),
  );
}

/** The Melbourne calendar date an instant falls on. */
export function dateKeyOf(instant: Instant = Date.now(), timeZone = MELBOURNE): string {
  return formatInZone(instant, "yyyy-MM-dd", timeZone);
}

/** ISO weekday (1 = Monday … 7 = Sunday) of an instant in Melbourne, matching schedules.days_of_week. */
export function isoWeekdayOf(instant: Instant, timeZone = MELBOURNE): number {
  return Number(formatInZone(instant, "i", timeZone));
}

/** ISO weekday of a calendar date. Doesn't depend on any zone. */
export function isoWeekdayOfDateKey(dateKey: string): number {
  const [y, m, d] = parseDateKey(dateKey);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Calendar arithmetic on date keys: '2026-10-03' + 1 = '2026-10-04', whatever DST does. */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = parseDateKey(dateKey);
  // UTC has no DST, so this is pure calendar arithmetic regardless of the server's zone.
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The UTC instant of a wall-clock time on a calendar date in the zone. This is how a schedule rule
 * (Mon–Thu, 16:00–20:00 Melbourne) becomes session starts_at/ends_at across DST changes.
 */
export function zonedDateTimeToUtc(dateKey: string, time: string, timeZone = MELBOURNE): Date {
  const [y, m, d] = parseDateKey(dateKey);
  const [hh, mm, ss] = parseTime(time);
  return new Date(new TZDate(y, m - 1, d, hh, mm, ss, timeZone).getTime());
}

/**
 * [start, end) of a Melbourne calendar day as UTC instants, for "today's sessions" queries.
 * Not always 24 hours: the DST days are 23 and 25 hours long.
 */
export function dayRangeUtc(dateKey: string, timeZone = MELBOURNE): { start: Date; end: Date } {
  return {
    start: zonedDateTimeToUtc(dateKey, "00:00", timeZone),
    end: zonedDateTimeToUtc(addDaysToDateKey(dateKey, 1), "00:00", timeZone),
  };
}
