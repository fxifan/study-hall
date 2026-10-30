import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMETABLE,
  daysSummary,
  formatRange,
  sessionSegments,
  timesSummary,
  timetableStatus,
  type TimetableBlock,
} from "./timetable";

const TWO_BLOCKS: TimetableBlock[] = [
  { days: [1, 2, 3, 4], start: "19:00", end: "21:00", blockMinutes: 50, breakMinutes: 10 },
  { days: [1, 2, 3, 4], start: "16:00", end: "18:00", blockMinutes: 50, breakMinutes: 10 },
];

describe("timetable", () => {
  it("describes the current four-hour block", () => {
    expect(timesSummary(DEFAULT_TIMETABLE, "en")).toBe("4:00–8:00pm");
    expect(timesSummary(DEFAULT_TIMETABLE, "zh")).toBe("16:00–20:00");
    expect(daysSummary(DEFAULT_TIMETABLE, "en")).toBe("Monday to Thursday");
    expect(daysSummary(DEFAULT_TIMETABLE, "zh")).toBe("周一至周四");
    expect(daysSummary(DEFAULT_TIMETABLE, "en", { short: true })).toBe("Mon–Thu");
    expect(formatRange(11 * 60 + 30, 13 * 60, "en")).toBe("11:30am–1:00pm");
  });

  it("describes two-hour blocks with the gap kept", () => {
    expect(timesSummary(TWO_BLOCKS, "en")).toBe("4:00–6:00pm and 7:00–9:00pm");
    expect(timesSummary(TWO_BLOCKS, "zh")).toBe("16:00–18:00和19:00–21:00");
  });

  it("splits a block into doors, study, breaks and wrap-up", () => {
    const four = sessionSegments(DEFAULT_TIMETABLE[0]);
    expect(four.map((s) => s.kind)).toEqual(["doors", "study", "break", "study", "break", "study", "break", "study", "wrapup"]);
    expect(four.at(-1)).toEqual({ kind: "wrapup", from: 19 * 60 + 50, to: 20 * 60 });
    const two = sessionSegments(TWO_BLOCKS[1]);
    expect(two.map((s) => [s.kind, s.to - s.from])).toEqual([
      ["doors", 10],
      ["study", 50],
      ["break", 10],
      ["study", 50],
      ["wrapup", 10],
    ]);
  });

  it("finds the next block, including the second block on the same evening", () => {
    const mon = 1;
    expect(timetableStatus(TWO_BLOCKS, mon, 15 * 60)).toEqual({ kind: "today", start: 16 * 60, minutesToDoors: 50 });
    expect(timetableStatus(TWO_BLOCKS, mon, 15 * 60 + 55)).toEqual({ kind: "doors", start: 16 * 60 });
    expect(timetableStatus(TWO_BLOCKS, mon, 17 * 60)).toEqual({ kind: "live", end: 18 * 60 });
    expect(timetableStatus(TWO_BLOCKS, mon, 18 * 60 + 15)).toEqual({ kind: "today", start: 19 * 60, minutesToDoors: 35 });
    expect(timetableStatus(TWO_BLOCKS, mon, 21 * 60 + 5)).toEqual({ kind: "later", start: 16 * 60, inDays: 1 });
    expect(timetableStatus(TWO_BLOCKS, 4, 22 * 60)).toEqual({ kind: "later", start: 16 * 60, inDays: 4 });
  });
});
