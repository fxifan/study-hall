import { describe, expect, it } from "vitest";
import { placeStudentsInSlot } from "./enrolment";

const session = (id: string, room: string, capacity: number, enrolled: string[] = []) => ({
  id,
  starts_at: "2026-11-02T05:00:00.000Z",
  rooms: { name: room, capacity },
  enrolments: enrolled.map((student_id) => ({ student_id })),
});

describe("placeStudentsInSlot", () => {
  it("puts each student in one room per time slot, filling rooms in order", () => {
    const { assignments, unplaced } = placeStudentsInSlot(
      [session("s2", "Room 2", 2), session("s1", "Room 1", 2)],
      ["a", "b", "c"],
    );
    expect(assignments).toEqual([
      { session_id: "s1", student_id: "a" },
      { session_id: "s1", student_id: "b" },
      { session_id: "s2", student_id: "c" },
    ]);
    expect(unplaced).toBe(0);
  });

  it("leaves students where they already are", () => {
    const { assignments } = placeStudentsInSlot([session("s1", "Room 1", 5, ["a"]), session("s2", "Room 2", 5, ["b"])], ["a", "b"]);
    expect(assignments).toEqual([]);
  });

  it("reports students who don't fit instead of over-enrolling", () => {
    const { assignments, unplaced } = placeStudentsInSlot([session("s1", "Room 1", 2, ["x"])], ["a", "b", "c"]);
    expect(assignments).toEqual([{ session_id: "s1", student_id: "a" }]);
    expect(unplaced).toBe(2);
  });
});
