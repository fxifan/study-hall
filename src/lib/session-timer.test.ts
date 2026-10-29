import { describe, expect, it } from "vitest";
import { formatCountdown, timerPhase } from "./session-timer";

const start = Date.parse("2026-10-29T05:00:00Z"); // 4:00pm Melbourne
const end = start + 4 * 3600_000; // 8:00pm
const at = (minutes: number) => start + minutes * 60_000;

describe("timerPhase (50/10, 4 hours)", () => {
  it("counts down to the start", () => {
    expect(timerPhase(at(-10), start, end)).toEqual({ kind: "before", remainingMs: 10 * 60_000 });
  });

  it("runs four study blocks with breaks between them", () => {
    expect(timerPhase(at(0), start, end)).toEqual({ kind: "study", block: 1, totalBlocks: 4, remainingMs: 50 * 60_000 });
    expect(timerPhase(at(55), start, end)).toEqual({ kind: "break", remainingMs: 5 * 60_000 });
    expect(timerPhase(at(125), start, end)).toMatchObject({ kind: "study", block: 3, remainingMs: 45 * 60_000 });
  });

  it("makes the last 10 minutes the wrap-up, then ends", () => {
    expect(timerPhase(at(230), start, end)).toEqual({ kind: "wrapup", remainingMs: 10 * 60_000 });
    expect(timerPhase(at(240), start, end)).toEqual({ kind: "ended" });
  });

  it("supports other block lengths", () => {
    expect(timerPhase(at(27), start, end, 25, 5)).toEqual({ kind: "break", remainingMs: 3 * 60_000 });
    expect(timerPhase(at(30), start, end, 25, 5)).toMatchObject({ kind: "study", block: 2, totalBlocks: 8 });
  });
});

describe("formatCountdown", () => {
  it("formats minutes and hours", () => {
    expect(formatCountdown(83_000)).toBe("1:23");
    expect(formatCountdown(3_723_000)).toBe("1:02:03");
    expect(formatCountdown(-5)).toBe("0:00");
  });
});
