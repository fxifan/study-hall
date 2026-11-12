import { addDaysToDateKey, dateKeyOf } from "@/lib/time";

/** Points ledger kinds as students read them. */
export const POINT_LABEL: Record<string, string> = {
  marks: "Quiz marks",
  completion: "Finished notes or flashcards",
  score70: "Quiz bonus",
  score90: "Quiz bonus",
  study_day: "Study day",
  full_week: "Full study week",
};

/**
 * When each tier was reached, from promotion rows. One promotion can jump several tiers (e.g.
 * Copper → Silver after a big quiz), so every tier it passes gets that promotion's date.
 */
export function tierDates(promotions: { from_tier: number; to_tier: number; created_at: string }[]): Map<number, string> {
  const out = new Map<number, string>();
  for (const p of [...promotions].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))) {
    for (let t = p.from_tier + 1; t <= p.to_tier; t++) if (!out.has(t)) out.set(t, p.created_at);
  }
  return out;
}

/** Monday (yyyy-MM-dd) of the week a day falls in. */
function mondayOf(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay() || 7;
  return addDaysToDateKey(day, 1 - weekday);
}

/** Points per Mon–Sun week for the last `weeks` weeks, oldest first (Melbourne days). */
export function weeklyPoints(rows: { points: number; day: string }[], today: string = dateKeyOf(), weeks = 8): { week: string; points: number }[] {
  const thisWeek = mondayOf(today);
  const starts = Array.from({ length: weeks }, (_, i) => addDaysToDateKey(thisWeek, -7 * (weeks - 1 - i)));
  const sums = new Map(starts.map((w) => [w, 0]));
  for (const r of rows) {
    const w = mondayOf(r.day);
    if (sums.has(w)) sums.set(w, sums.get(w)! + r.points);
  }
  return starts.map((week) => ({ week, points: sums.get(week)! }));
}
