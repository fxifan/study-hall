import { describe, expect, it } from "vitest";
import { breakoutAllowed, breakoutErrorCode, breakoutMinutes, breakoutMinutesByStudent, type LoggedBreakout } from "./breakouts";

describe("breakoutAllowed", () => {
  it("never allows one adult with one student", () => {
    expect(breakoutAllowed(1, false)).toBe(false);
  });

  it("allows two or more students, or one student with a second adult", () => {
    expect(breakoutAllowed(2, false)).toBe(true);
    expect(breakoutAllowed(5, false)).toBe(true);
    expect(breakoutAllowed(1, true)).toBe(true);
    expect(breakoutAllowed(3, true)).toBe(true);
  });

  it("needs at least one student", () => {
    expect(breakoutAllowed(0, false)).toBe(false);
    expect(breakoutAllowed(0, true)).toBe(false);
  });
});

const ENDS = "2026-10-29T09:00:00Z"; // 8pm Melbourne

function breakout(id: string, start: string, end: string | null, students: string[]): LoggedBreakout {
  return {
    id,
    started_at: start,
    ended_at: end,
    adult_name: "Tom Tutor",
    second_adult_name: null,
    students: students.map((s) => ({ id: s, name: s })),
  };
}

describe("breakoutMinutes", () => {
  it("counts whole minutes of a closed breakout", () => {
    expect(breakoutMinutes(breakout("b", "2026-10-29T06:00:00Z", "2026-10-29T06:45:59Z", []), ENDS, 0)).toBe(45);
  });

  it("counts an open breakout up to now", () => {
    const now = Date.parse("2026-10-29T06:20:30Z");
    expect(breakoutMinutes(breakout("b", "2026-10-29T06:00:00Z", null, []), ENDS, now)).toBe(20);
  });

  it("stops an open breakout at the session's end", () => {
    const now = Date.parse("2026-10-29T11:00:00Z");
    expect(breakoutMinutes(breakout("b", "2026-10-29T08:30:00Z", null, []), ENDS, now)).toBe(30);
  });
});

describe("breakoutMinutesByStudent", () => {
  it("adds up each student's breakouts", () => {
    const totals = breakoutMinutesByStudent(
      [
        breakout("1", "2026-10-29T06:00:00Z", "2026-10-29T06:30:00Z", ["ava", "noah"]),
        breakout("2", "2026-10-29T07:00:00Z", "2026-10-29T07:15:00Z", ["ava", "leo"]),
      ],
      ENDS,
      0,
    );
    expect(Object.fromEntries(totals)).toEqual({ ava: 45, noah: 30, leo: 15 });
  });
});

describe("breakoutErrorCode", () => {
  it("maps the database's messages", () => {
    expect(
      breakoutErrorCode("breakouts: one adult alone with one student is not allowed; add a second student or a second adult"),
    ).toBe("one_to_one");
    expect(breakoutErrorCode("breakouts: session is not open")).toBe("not_open");
    expect(breakoutErrorCode("breakouts: a student is already in an open breakout")).toBe("busy");
    expect(breakoutErrorCode("breakouts: an adult is already in an open breakout")).toBe("busy");
    expect(
      breakoutErrorCode("sessions: supervisor or tutor has no verified Working with Children Check valid on 2026-10-29"),
    ).toBe("not_cleared");
    expect(breakoutErrorCode("breakouts: every student must be enrolled in this session")).toBe("invalid");
    expect(breakoutErrorCode("connection reset")).toBe("failed");
  });
});
