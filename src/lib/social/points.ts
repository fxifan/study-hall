/**
 * Points and tiers (student social brief, "AI resources, completion and tiers"; pilot rules):
 * 10 points for the first completion of a resource lineage, +5 at 70% and +5 at 90% on a scored
 * (vetted) quiz. Each milestone is awarded once per learner and lineage (points_ledger is unique on
 * profile, lineage, kind), a retake earns only newly reached milestones, and a daily cap limits
 * farming. AI-generated practice earns completion only. Generation alone earns nothing.
 */
export type PointKind = "completion" | "score70" | "score90";

export const POINTS: Record<PointKind, number> = { completion: 10, score70: 5, score90: 5 };
export const DAILY_POINT_CAP = 60;

export const TIERS = [
  { name: "Starter", min: 0 },
  { name: "Bronze", min: 50 },
  { name: "Silver", min: 150 },
  { name: "Gold", min: 400 },
  { name: "Platinum", min: 800 },
  { name: "Diamond", min: 1500 },
] as const;

export function tierFor(points: number): { name: string; min: number; next: { name: string; min: number } | null } {
  let i = 0;
  while (i + 1 < TIERS.length && points >= TIERS[i + 1].min) i++;
  return { ...TIERS[i], next: TIERS[i + 1] ?? null };
}

/** Milestones this attempt reaches, before removing ones already held. */
export function milestonesFor(input: { scorePct: number | null; scoredEligible: boolean; completed: boolean }): PointKind[] {
  const out: PointKind[] = [];
  if (input.completed) out.push("completion");
  if (input.scoredEligible && input.scorePct !== null) {
    if (input.scorePct >= 70) out.push("score70");
    if (input.scorePct >= 90) out.push("score90");
  }
  return out;
}

/**
 * The awards to write: milestones not already held, trimmed so today's total stays within the cap.
 * A milestone that doesn't fit today is not awarded (it can be earned on a later retake).
 */
export function awardsFor(input: {
  reached: PointKind[];
  held: PointKind[];
  pointsToday: number;
  cap?: number;
}): { kind: PointKind; points: number }[] {
  const cap = input.cap ?? DAILY_POINT_CAP;
  let room = Math.max(0, cap - input.pointsToday);
  const out: { kind: PointKind; points: number }[] = [];
  for (const kind of input.reached) {
    if (input.held.includes(kind)) continue;
    const points = POINTS[kind];
    if (points > room) continue;
    room -= points;
    out.push({ kind, points });
  }
  return out;
}

/** Grade multiple-choice answers on the server. Unanswered counts as wrong. */
export function grade(answers: (number | null)[], key: number[]): { correct: number; total: number; pct: number; complete: boolean } {
  const total = key.length;
  let correct = 0;
  for (let i = 0; i < total; i++) if (answers[i] === key[i]) correct++;
  const complete = answers.length >= total && answers.slice(0, total).every((a) => a !== null && a !== undefined);
  return { correct, total, pct: total ? Math.round((correct / total) * 10000) / 100 : 0, complete };
}
