import { describe, expect, it } from "vitest";
import { awardLineage, streak, studyDays, studyDaysInWeek, weekDots, weekStart } from "./consistency";

const set = (...d: string[]) => new Set(d);

describe("studyDays", () => {
  it("counts the goal in minutes, or anything finished", () => {
    const days = studyDays(new Map([["2026-11-09", 30], ["2026-11-10", 12]]), set("2026-11-10"), 25);
    expect([...days].sort()).toEqual(["2026-11-09", "2026-11-10"]);
    expect(studyDays(new Map([["2026-11-09", 24]]), set(), 25).size).toBe(0);
  });
});

describe("weekStart", () => {
  it("is the Monday", () => {
    expect(weekStart("2026-11-11")).toBe("2026-11-09"); // Wednesday
    expect(weekStart("2026-11-15")).toBe("2026-11-09"); // Sunday
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
  });
});

describe("streak", () => {
  it("counts back from today, or from yesterday while today is still going", () => {
    expect(streak(set("2026-11-09", "2026-11-10", "2026-11-11"), "2026-11-11")).toMatchObject({ length: 3, todayCounted: true });
    expect(streak(set("2026-11-09", "2026-11-10"), "2026-11-11")).toMatchObject({ length: 2, todayCounted: false });
  });
  it("uses one rest day a week instead of breaking", () => {
    // Mon, Tue, (Wed missed), Thu: still 3, Wednesday is the rest day.
    const s = streak(set("2026-11-09", "2026-11-10", "2026-11-12"), "2026-11-12");
    expect(s.length).toBe(3);
    expect([...s.restDays]).toEqual(["2026-11-11"]);
  });
  it("ends on a second missed day in the same week", () => {
    // Mon, (Tue, Wed missed), Thu: only Thursday.
    expect(streak(set("2026-11-09", "2026-11-12"), "2026-11-12").length).toBe(1);
  });
  it("is zero with nothing recent", () => {
    expect(streak(set(), "2026-11-11").length).toBe(0);
    expect(streak(set(), "2026-11-11").restDays.size).toBe(0);
  });
});

describe("week", () => {
  it("shows Monday to Sunday and counts study days", () => {
    const days = set("2026-11-09", "2026-11-10");
    const dots = weekDots(days, set(), "2026-11-11");
    expect(dots.map((d) => d.state)).toEqual(["done", "done", "today", "future", "future", "future", "future"]);
    expect(studyDaysInWeek(days, "2026-11-11")).toBe(2);
  });
});

describe("awardLineage", () => {
  it("is a stable uuid per student, kind and day", () => {
    const a = awardLineage("p1", "study_day", "2026-11-11");
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(awardLineage("p1", "study_day", "2026-11-11")).toBe(a);
    expect(awardLineage("p1", "study_day", "2026-11-12")).not.toBe(a);
  });
});
