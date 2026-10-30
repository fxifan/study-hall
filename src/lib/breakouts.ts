/**
 * Zoom breakout log (docs/in-site-video-plan.md, "Launch option"). The rule (spec §4.3): an adult is
 * never alone on video with one student, so a breakout needs at least two students or a second
 * adult. public.start_breakout enforces it in the database; breakoutAllowed mirrors it for the form.
 */

export function breakoutAllowed(studentCount: number, hasSecondAdult: boolean): boolean {
  return studentCount >= 2 || (studentCount >= 1 && hasSecondAdult);
}

export type LoggedBreakout = {
  id: string;
  started_at: string;
  ended_at: string | null;
  adult_name: string;
  second_adult_name: string | null;
  students: { id: string; name: string }[];
};

/** Whole minutes in a breakout. An open one counts up to `now`, but never past the session's end. */
export function breakoutMinutes(
  breakout: Pick<LoggedBreakout, "started_at" | "ended_at">,
  sessionEndsAt: string,
  now = Date.now(),
): number {
  const end = breakout.ended_at ? Date.parse(breakout.ended_at) : Math.min(now, Date.parse(sessionEndsAt));
  return Math.max(0, Math.floor((end - Date.parse(breakout.started_at)) / 60_000));
}

/** Total breakout minutes per student, e.g. towards the tutoring plan's hour. */
export function breakoutMinutesByStudent(
  breakouts: LoggedBreakout[],
  sessionEndsAt: string,
  now = Date.now(),
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const b of breakouts) {
    const minutes = breakoutMinutes(b, sessionEndsAt, now);
    for (const s of b.students) totals.set(s.id, (totals.get(s.id) ?? 0) + minutes);
  }
  return totals;
}

export type BreakoutError = "one_to_one" | "not_open" | "busy" | "not_cleared" | "invalid" | "failed";

/** Maps public.start_breakout's exception messages to a dictionary key. */
export function breakoutErrorCode(message: string): BreakoutError {
  if (message.includes("one adult alone")) return "one_to_one";
  if (message.includes("not open")) return "not_open";
  if (message.includes("already in an open breakout")) return "busy";
  if (message.includes("Working with Children Check") || message.includes("must be a proctor or admin")) {
    return "not_cleared";
  }
  if (/enrolled|choose the students|someone else|must run|organisation/.test(message)) return "invalid";
  return "failed";
}
