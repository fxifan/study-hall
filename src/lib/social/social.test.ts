import { describe, expect, it } from "vitest";
import { ageFrom, canSelfSignUp } from "./age";
import { dayWindow, goalProgress, planBeat, rank, secondsByMember, standouts, weekWindow, type CreditInterval } from "./credit";
import { awardsFor, grade, milestonesFor, tierFor } from "./points";

const TZ = "Australia/Melbourne";
const at = (iso: string) => new Date(iso).toISOString();
const closed = (profileId: string, startedAt: string, endedAt: string): CreditInterval => ({ profileId, startedAt: at(startedAt), endedAt: at(endedAt), lastBeatAt: at(endedAt) });

describe("shared daily goal", () => {
  // 7 Nov 2026 in Melbourne (AEDT, UTC+11): 00:00 local = 13:00Z on 6 Nov.
  const day = "2026-11-07";
  const { start, end } = dayWindow(day, TZ);
  const now = end.getTime();

  it("a confirmed 60-minute session leaves five hours of a six-hour goal", () => {
    const totals = secondsByMember([closed("a", "2026-11-07T01:00:00Z", "2026-11-07T02:00:00Z")], start, end, now);
    const total = [...totals.values()].reduce((s, x) => s + x, 0);
    expect(goalProgress(360, total)).toMatchObject({ doneMinutes: 60, remainingMinutes: 300, reached: false });
  });

  it("two simultaneous 30-minute sessions from different members leave four hours after the first hour", () => {
    const intervals = [
      closed("a", "2026-11-07T01:00:00Z", "2026-11-07T02:00:00Z"),
      closed("b", "2026-11-07T03:00:00Z", "2026-11-07T03:30:00Z"),
      closed("c", "2026-11-07T03:00:00Z", "2026-11-07T03:30:00Z"),
    ];
    const total = [...secondsByMember(intervals, start, end, now).values()].reduce((s, x) => s + x, 0);
    expect(goalProgress(360, total).remainingMinutes).toBe(240);
  });

  it("floors remaining at zero and keeps counting after the goal", () => {
    expect(goalProgress(60, 90 * 60)).toEqual({ targetMinutes: 60, doneMinutes: 90, remainingMinutes: 0, reached: true });
  });

  it("splits a session crossing local midnight between both days", () => {
    // 23:30 → 00:45 Melbourne on 7/8 Nov = 12:30Z → 13:45Z on 7 Nov.
    const i = closed("a", "2026-11-07T12:30:00Z", "2026-11-07T13:45:00Z");
    const d1 = secondsByMember([i], start, end, now).get("a");
    const w2 = dayWindow("2026-11-08", TZ);
    const d2 = secondsByMember([i], w2.start, w2.end, w2.end.getTime()).get("a");
    expect(d1).toBe(30 * 60);
    expect(d2).toBe(45 * 60);
  });

  it("bounds an open interval at the last heartbeat, not now", () => {
    const open: CreditInterval = { profileId: "a", startedAt: at("2026-11-07T01:00:00Z"), endedAt: null, lastBeatAt: at("2026-11-07T01:20:00Z") };
    expect(secondsByMember([open], start, end, Date.parse("2026-11-07T05:00:00Z")).get("a")).toBe(20 * 60);
  });

  it("weeks start on Monday", () => {
    expect(weekWindow("2026-11-07", TZ).firstDay).toBe("2026-11-02");
    expect(weekWindow("2026-11-02", TZ).firstDay).toBe("2026-11-02");
  });
});

describe("heartbeat state machine", () => {
  const now = new Date("2026-11-07T01:00:00Z");
  it("opens an interval on the first active beat", () => {
    expect(planBeat({ hasOpen: false, lastBeatAt: now.toISOString(), now, active: true })).toEqual({ closeAt: null, openAt: now.toISOString(), state: "running" });
  });
  it("keeps an open interval going on a timely beat", () => {
    expect(planBeat({ hasOpen: true, lastBeatAt: "2026-11-07T00:59:30Z", now, active: true })).toEqual({ closeAt: null, openAt: null, state: "running" });
  });
  it("closes at the last beat after a gap, then reopens from now", () => {
    expect(planBeat({ hasOpen: true, lastBeatAt: "2026-11-07T00:50:00Z", now, active: true })).toEqual({
      closeAt: "2026-11-07T00:50:00Z",
      openAt: now.toISOString(),
      state: "running",
    });
  });
  it("leaving the study screen pauses credit", () => {
    expect(planBeat({ hasOpen: true, lastBeatAt: "2026-11-07T00:59:30Z", now, active: false })).toEqual({ closeAt: now.toISOString(), openAt: null, state: "paused" });
  });
  it("a repeated inactive beat (retried stop) closes nothing new", () => {
    expect(planBeat({ hasOpen: false, lastBeatAt: "2026-11-07T00:59:30Z", now, active: false })).toEqual({ closeAt: null, openAt: null, state: "paused" });
  });
});

describe("boards and recap", () => {
  it("tied members share a rank", () => {
    const r = rank(new Map([["a", 3600], ["b", 3600], ["c", 600]]));
    expect(r.map((x) => x.rank)).toEqual([1, 1, 3]);
  });
  it("announces joint leaders and omits the award without activity", () => {
    expect(standouts(new Map([["a", 3600], ["b", 3600], ["c", 60]])).sort()).toEqual(["a", "b"]);
    expect(standouts(new Map())).toEqual([]);
    expect(standouts(new Map([["a", 20]]))).toEqual([]);
  });
});

describe("points", () => {
  it("75% on an eligible quiz grants completion and 70% once; a later 95% adds only 90%", () => {
    const first = awardsFor({ reached: milestonesFor({ scorePct: 75, scoredEligible: true, completed: true }), held: [], pointsToday: 0 });
    expect(first).toEqual([{ kind: "completion", points: 10 }, { kind: "score70", points: 5 }]);
    const second = awardsFor({
      reached: milestonesFor({ scorePct: 95, scoredEligible: true, completed: true }),
      held: first.map((a) => a.kind),
      pointsToday: 15,
    });
    expect(second).toEqual([{ kind: "score90", points: 5 }]);
  });
  it("AI-generated quizzes earn completion only", () => {
    expect(milestonesFor({ scorePct: 100, scoredEligible: false, completed: true })).toEqual(["completion"]);
  });
  it("respects the daily cap", () => {
    expect(awardsFor({ reached: ["completion", "score70"], held: [], pointsToday: 52 })).toEqual([{ kind: "score70", points: 5 }]);
    expect(awardsFor({ reached: ["completion"], held: [], pointsToday: 60 })).toEqual([]);
  });
  it("grades on the server and needs every answer for completion", () => {
    expect(grade([0, 1, 2, 3], [0, 1, 2, 0])).toEqual({ correct: 3, total: 4, pct: 75, complete: true });
    expect(grade([0, null], [0, 1]).complete).toBe(false);
  });
  it("tiers", () => {
    expect(tierFor(0).name).toBe("Starter");
    expect(tierFor(150)).toMatchObject({ name: "Silver", next: { name: "Gold" } });
    expect(tierFor(5000).next).toBeNull();
  });
});

describe("age gate", () => {
  const today = new Date("2026-11-06T00:00:00Z");
  it("turns 13 only after the end of the birth month", () => {
    expect(ageFrom(2013, 11, today)).toBe(12);
    expect(ageFrom(2013, 10, today)).toBe(13);
    expect(canSelfSignUp(2013, 10, today)).toBe(true);
    expect(canSelfSignUp(2014, 1, today)).toBe(false);
  });
});

describe("practice prompts", () => {
  it("pitches university and TAFE students at their own level", async () => {
    const { resourcePrompt } = await import("./resources");
    expect(resourcePrompt({ kind: "quiz", topic: "Organic chemistry", notes: "", yearLevel: 13 }).system).toContain("university or TAFE");
    expect(resourcePrompt({ kind: "quiz", topic: "Fractions", notes: "", yearLevel: 8 }).system).toContain("Year 8");
  });
  it("lets adults sign themselves up", () => {
    expect(canSelfSignUp(1985, 6)).toBe(true);
  });
});
