import { zhCN } from "date-fns/locale";
import { describe, expect, it } from "vitest";
import {
  MELBOURNE,
  addDaysToDateKey,
  dateKeyOf,
  dayRangeUtc,
  formatInZone,
  isoWeekdayOf,
  isoWeekdayOfDateKey,
  zonedDateTimeToUtc,
} from "./time";

// 2026 Melbourne DST: ends Sun 5 April (03:00 AEDT -> 02:00 AEST), starts Sun 4 October
// (02:00 AEST -> 03:00 AEDT).

describe("zonedDateTimeToUtc", () => {
  it("uses AEDT (+11) in summer and AEST (+10) in winter", () => {
    expect(zonedDateTimeToUtc("2026-10-29", "16:00").toISOString()).toBe("2026-10-29T05:00:00.000Z");
    expect(zonedDateTimeToUtc("2026-06-15", "16:00").toISOString()).toBe("2026-06-15T06:00:00.000Z");
  });

  it("keeps a weekly 4pm session at 4pm local across the October change", () => {
    expect(zonedDateTimeToUtc("2026-09-28", "16:00").toISOString()).toBe("2026-09-28T06:00:00.000Z");
    expect(zonedDateTimeToUtc("2026-10-05", "16:00").toISOString()).toBe("2026-10-05T05:00:00.000Z");
  });

  it("keeps a weekly 4pm session at 4pm local across the April change", () => {
    expect(zonedDateTimeToUtc("2026-03-30", "16:00").toISOString()).toBe("2026-03-30T05:00:00.000Z");
    expect(zonedDateTimeToUtc("2026-04-06", "16:00").toISOString()).toBe("2026-04-06T06:00:00.000Z");
  });

  it("moves a time in the spring-forward gap forward an hour", () => {
    // 02:30 on 4 Oct doesn't exist; it becomes 03:30 AEDT.
    expect(zonedDateTimeToUtc("2026-10-04", "02:30").toISOString()).toBe("2026-10-03T16:30:00.000Z");
  });

  it("resolves a repeated fall-back time to its first occurrence", () => {
    // 02:30 on 5 Apr happens twice; the first is still AEDT.
    expect(zonedDateTimeToUtc("2026-04-05", "02:30").toISOString()).toBe("2026-04-04T15:30:00.000Z");
  });

  it("accepts Postgres time values with seconds", () => {
    expect(zonedDateTimeToUtc("2026-10-29", "20:00:00").toISOString()).toBe("2026-10-29T09:00:00.000Z");
  });

  it("rejects malformed input", () => {
    expect(() => zonedDateTimeToUtc("29/10/2026", "16:00")).toThrow();
    expect(() => zonedDateTimeToUtc("2026-10-29", "4pm")).toThrow();
  });
});

describe("formatting and calendar dates", () => {
  it("formats instants in Melbourne time", () => {
    expect(formatInZone("2026-10-29T05:02:00Z", "EEE d MMM, h:mmaaa")).toBe("Thu 29 Oct, 4:02pm");
  });

  it("formats in Chinese when given the zh-CN locale", () => {
    expect(formatInZone("2026-10-29T05:02:00Z", "M月d日 EEEE HH:mm", MELBOURNE, zhCN)).toBe("10月29日 星期四 16:02");
  });

  it("puts a late-UTC instant on the next Melbourne day", () => {
    expect(dateKeyOf("2026-10-29T13:30:00Z")).toBe("2026-10-30");
    expect(isoWeekdayOf("2026-10-29T13:30:00Z")).toBe(5);
  });

  it("numbers weekdays the ISO way, matching schedules.days_of_week", () => {
    expect(isoWeekdayOfDateKey("2026-10-26")).toBe(1); // Monday
    expect(isoWeekdayOfDateKey("2026-10-29")).toBe(4); // Thursday
    expect(isoWeekdayOfDateKey("2026-11-01")).toBe(7); // Sunday
  });

  it("adds calendar days across DST and month ends", () => {
    expect(addDaysToDateKey("2026-10-03", 1)).toBe("2026-10-04");
    expect(addDaysToDateKey("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysToDateKey("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("gives 23- and 25-hour day ranges on DST days", () => {
    const spring = dayRangeUtc("2026-10-04");
    expect(spring.start.toISOString()).toBe("2026-10-03T14:00:00.000Z");
    expect(spring.end.toISOString()).toBe("2026-10-04T13:00:00.000Z");

    const autumn = dayRangeUtc("2026-04-05");
    expect((autumn.end.getTime() - autumn.start.getTime()) / 3_600_000).toBe(25);
  });
});
