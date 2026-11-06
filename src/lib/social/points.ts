/**
 * Points and tiers (owner, 6 Nov 2026). A quiz pays the marks the student earns: 6 marks out of 14
 * earns 6 points. Retakes pay only the improvement on their best mark for that quiz (and its
 * remakes, the same lineage), so the same quiz can't be farmed. Notes and flashcards pay a flat 10
 * the first time they're marked done. A daily cap limits farming overall. Generating earns nothing.
 */
export type PointKind = "completion" | "marks";

export const COMPLETION_POINTS = 10;
export const DAILY_POINT_CAP = 60;

/** Points for a quiz attempt: the improvement on the best mark so far, within today's cap. */
export function marksAward(input: { earned: number; best: number; pointsToday: number; cap?: number }): number {
  const room = Math.max(0, (input.cap ?? DAILY_POINT_CAP) - input.pointsToday);
  return Math.max(0, Math.min(room, input.earned - input.best));
}

/** Points for marking notes or flashcards done: once per lineage, within today's cap. */
export function completionAward(input: { alreadyAwarded: boolean; pointsToday: number; cap?: number }): number {
  if (input.alreadyAwarded) return 0;
  return COMPLETION_POINTS <= (input.cap ?? DAILY_POINT_CAP) - input.pointsToday ? COMPLETION_POINTS : 0;
}
