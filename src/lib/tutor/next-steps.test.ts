import { describe, expect, it } from "vitest";
import { currentTasks, nextStudents, startHere, startsIn, type TaskRow } from "./next-steps";

const task = (over: Partial<TaskRow>): TaskRow => ({
  id: "t",
  student_id: "s1",
  body: "Three chain-rule questions",
  due_on: null,
  status: "not_started",
  note: null,
  created_at: "2026-11-04T00:00:00Z",
  ...over,
});

describe("startHere", () => {
  it("has nothing to say without a task", () => {
    expect(startHere(null)).toBeNull();
  });
  it("starts with where they got stuck", () => {
    expect(startHere(task({ status: "stuck", note: "inner function in Q3" }))).toBe("Go over “inner function in Q3” together.");
    expect(startHere(task({ status: "stuck", note: "  " }))).toMatch(/^Ask where they got stuck/);
  });
  it("covers every other status", () => {
    expect(startHere(task({ status: "done" }))).toBe("Check their work, then move on.");
    expect(startHere(task({ status: "started", note: "Q2" }))).toBe("Pick up from: Q2");
    expect(startHere(task({ status: "not_started" }))).toMatch(/first part together/);
  });
});

describe("currentTasks", () => {
  it("keeps the newest task per student", () => {
    const map = currentTasks([
      task({ id: "new", created_at: "2026-11-06T00:00:00Z" }),
      task({ id: "old", created_at: "2026-11-01T00:00:00Z" }),
      task({ id: "other", student_id: "s2" }),
    ]);
    expect(map.get("s1")?.id).toBe("new");
    expect(map.get("s2")?.id).toBe("other");
  });
});

describe("nextStudents", () => {
  it("takes each student's soonest lesson, up to the limit", () => {
    const rows = nextStudents([
      { lessonId: "b2", studentId: "b", startsAt: "2026-11-09T05:00:00Z" },
      { lessonId: "a1", studentId: "a", startsAt: "2026-11-08T05:00:00Z" },
      { lessonId: "b1", studentId: "b", startsAt: "2026-11-08T06:00:00Z" },
      { lessonId: "c1", studentId: "c", startsAt: "2026-11-08T07:00:00Z" },
      { lessonId: "d1", studentId: "d", startsAt: "2026-11-08T08:00:00Z" },
    ]);
    expect(rows.map((r) => r.lessonId)).toEqual(["a1", "b1", "c1"]);
  });
});

describe("startsIn", () => {
  const now = new Date("2026-11-08T05:00:00Z");
  it("is short and only for soon lessons", () => {
    expect(startsIn("2026-11-08T05:12:00Z", now)).toBe("in 12 min");
    expect(startsIn("2026-11-08T07:00:00Z", now)).toBe("in 2 h");
    expect(startsIn("2026-11-08T04:55:00Z", now)).toBe("now");
    expect(startsIn("2026-11-09T05:00:00Z", now)).toBeNull();
  });
});
