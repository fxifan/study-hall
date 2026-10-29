// Pure enrolment rules, kept free of server imports so they can be unit tested.

export type SessionWithRoom = {
  id: string;
  starts_at: string;
  rooms: { name: string; capacity: number } | null;
  enrolments: { student_id: string }[];
};

/**
 * One session per student per time slot: several rooms can run at once, and a student belongs in
 * one of them. Students already in any room for the slot stay put; the rest fill rooms in name
 * order up to capacity. Pure, for testing.
 */
export function placeStudentsInSlot(
  slot: SessionWithRoom[],
  studentIds: string[],
): { assignments: { session_id: string; student_id: string }[]; unplaced: number } {
  const placed = new Set(slot.flatMap((s) => s.enrolments.map((e) => e.student_id)));
  const waiting = studentIds.filter((id) => !placed.has(id));
  const rooms = [...slot].sort((a, b) => (a.rooms?.name ?? "").localeCompare(b.rooms?.name ?? ""));
  const assignments: { session_id: string; student_id: string }[] = [];
  for (const session of rooms) {
    const free = Math.max(0, (session.rooms?.capacity ?? 0) - session.enrolments.length);
    for (const studentId of waiting.splice(0, free)) assignments.push({ session_id: session.id, student_id: studentId });
  }
  return { assignments, unplaced: waiting.length };
}
