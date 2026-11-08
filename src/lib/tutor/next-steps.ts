/**
 * "Before your next lesson" (docs/tutor-next-steps.md): for the next few students the tutor will
 * teach, their current next step, how far they got, and one line on where to begin. Pure, so it's
 * unit-tested; the dashboard page loads the rows and the client component renders them.
 */

export const TASK_STATUSES = ["not_started", "started", "done", "stuck"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: "Hasn't started",
  started: "Started",
  done: "Done",
  stuck: "Stuck",
};

export type TaskRow = { id: string; student_id: string; body: string; due_on: string | null; status: TaskStatus; note: string | null; created_at: string };
export type NextLesson = { lessonId: string; studentId: string; startsAt: string };

/** One line on where to begin the next lesson, from the task's status and note. */
export function startHere(task: Pick<TaskRow, "status" | "note"> | null): string | null {
  if (!task) return null;
  const note = task.note?.trim();
  switch (task.status) {
    case "stuck":
      return note ? `Go over “${note}” together.` : "Ask where they got stuck, then work through it together.";
    case "done":
      return note ? `Check their work (${note}), then move on.` : "Check their work, then move on.";
    case "started":
      return note ? `Pick up from: ${note}` : "Check what they've done so far, then finish it together.";
    default:
      return "Do the first part together in the first 10 minutes.";
  }
}

/** The latest task per student (tasks may arrive in any order). */
export function currentTasks(tasks: TaskRow[]): Map<string, TaskRow> {
  const latest = new Map<string, TaskRow>();
  for (const t of tasks) {
    const seen = latest.get(t.student_id);
    if (!seen || Date.parse(t.created_at) > Date.parse(seen.created_at)) latest.set(t.student_id, t);
  }
  return latest;
}

/** The next lesson for each of the next `limit` distinct students, soonest first. */
export function nextStudents(lessons: NextLesson[], limit = 3): NextLesson[] {
  const seen = new Set<string>();
  const out: NextLesson[] = [];
  for (const l of lessons.toSorted((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))) {
    if (seen.has(l.studentId)) continue;
    seen.add(l.studentId);
    out.push(l);
    if (out.length === limit) break;
  }
  return out;
}

/** "in 12 min", "in 2 h", or null when it's more than 6 hours away (the date says enough). */
export function startsIn(startsAt: string, now: Date): string | null {
  const min = Math.round((Date.parse(startsAt) - now.getTime()) / 60_000);
  if (min <= 0) return "now";
  if (min < 60) return `in ${min} min`;
  if (min < 6 * 60) return `in ${Math.round(min / 60)} h`;
  return null;
}
