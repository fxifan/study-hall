/**
 * Edumi Study Ranks (owner brief, 7 Nov 2026): the one ordered source of truth for rank IDs,
 * display names, badge assets, tier colours and point thresholds. Stored data uses the stable `id`
 * (and the 1-based `tier`); the UI shows `name` exactly as written.
 *
 * Ranks come from the points ledger (quiz marks and finished notes or flashcards), never from
 * leaderboard study minutes. Thresholds approved by the owner on 7 Nov 2026 (docs/study-ranks.md);
 * they must stay strictly increasing, start at 0 for Copper, and match the
 * initialisation in supabase/migrations/*_study_ranks.sql. The database never stores thresholds:
 * src/lib/social/rank-sync.ts passes RANK_THRESHOLDS to sync_student_rank on every award.
 */
export const RANKS = [
  { tier: 1, id: "copper", name: "Copper Crammer", min: 0, color: "#b87333" },
  { tier: 2, id: "bronze", name: "Bronze Braincell", min: 50, color: "#a8713a" },
  { tier: 3, id: "silver", name: "Silver Striver", min: 150, color: "#8e99a8" },
  { tier: 4, id: "gold", name: "Gold Grinder", min: 300, color: "#c9a23a" },
  { tier: 5, id: "platinum", name: "Platinum Prodigy", min: 500, color: "#9aa6c4" },
  { tier: 6, id: "ruby", name: "Ruby Reviser", min: 800, color: "#c0392b" },
  { tier: 7, id: "sapphire", name: "Sapphire Scholar", min: 1200, color: "#2f5bd3" },
  { tier: 8, id: "emerald", name: "Emerald Einstein", min: 1700, color: "#2e9e5b" },
  { tier: 9, id: "amethyst", name: "Amethyst Ace", min: 2300, color: "#8a4fd8" },
  { tier: 10, id: "diamond", name: "Diamond Demon", min: 3000, color: "#4aa8e8" },
  { tier: 11, id: "champion", name: "Champion Challenger", min: 4000, color: "#b8283a" },
  { tier: 12, id: "master", name: "Master Mind", min: 5500, color: "#4b45b8" },
  { tier: 13, id: "grandmaster", name: "Grandmaster Genius", min: 7500, color: "#d9b44a" },
] as const;

export type Rank = (typeof RANKS)[number];
export type RankId = Rank["id"];

export const RANK_THRESHOLDS: number[] = RANKS.map((r) => r.min);

export function badgeSrc(rank: Pick<Rank, "id">): string {
  return `/ranks/${rank.id}.svg`;
}

/** The rank for a points balance. Copper is the entry tier; there's nothing above Grandmaster. */
export function rankFor(points: number): Rank {
  let r: Rank = RANKS[0];
  for (const x of RANKS) if (points >= x.min) r = x;
  return r;
}

export function rankByTier(tier: number): Rank {
  return RANKS[Math.min(RANKS.length, Math.max(1, Math.round(tier))) - 1];
}

export function rankById(id: string): Rank | undefined {
  return RANKS.find((r) => r.id === id);
}

export function nextRank(rank: Rank): Rank | null {
  return (RANKS as readonly Rank[])[rank.tier] ?? null;
}

/** Progress to the next rank: points into this tier, points still needed, and a 0–1 fraction. */
export function rankProgress(points: number): { rank: Rank; next: Rank | null; toNext: number; fraction: number } {
  const rank = rankFor(points);
  const next = nextRank(rank);
  if (!next) return { rank, next: null, toNext: 0, fraction: 1 };
  return { rank, next, toNext: next.min - points, fraction: (points - rank.min) / (next.min - rank.min) };
}

/** Master Mind and Grandmaster Genius get a little more emphasis in the celebration. */
export function isTopRank(rank: Pick<Rank, "tier">): boolean {
  return rank.tier >= 12;
}
