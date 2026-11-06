import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { RANK_THRESHOLDS, rankByTier, type Rank } from "./ranks";

/**
 * Server side of Study Ranks (docs/study-ranks.md). Every points award calls syncRank() after the
 * ledger insert has committed; the database function compares the committed balance with the
 * stored tier under a row lock and records at most one promotion per new tier (the highest tier
 * reached, in one event). Celebrations read unseen promotions; acknowledging marks them seen.
 */
export type Promotion = { id: string; from: Rank; to: Rank; points: number };

export async function syncRank(profileId: string): Promise<Promotion | null> {
  const { data, error } = await createAdminClient().rpc("sync_student_rank", { p_profile: profileId, p_thresholds: RANK_THRESHOLDS });
  if (error) {
    // Never fail the award over a rank: the next award re-syncs from the committed balance.
    console.error("Rank sync failed", error.code);
    return null;
  }
  const row = (data as { promotion_id: string; from_tier: number; to_tier: number; points: number }[] | null)?.[0];
  return row ? { id: row.promotion_id, from: rankByTier(row.from_tier), to: rankByTier(row.to_tier), points: row.points } : null;
}

/** The newest promotion this student hasn't acknowledged (one celebration covers earlier ones). */
export async function unseenPromotion(profileId: string): Promise<Promotion | null> {
  const { data } = await createAdminClient()
    .from("rank_promotions")
    .select("id, from_tier, to_tier, points")
    .eq("profile_id", profileId)
    .is("seen_at", null)
    .order("to_tier", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id as string, from: rankByTier(data.from_tier as number), to: rankByTier(data.to_tier as number), points: data.points as number } : null;
}

/** Mark a promotion and every earlier unseen one as seen. Idempotent. */
export async function acknowledgePromotion(profileId: string, promotionId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: p } = await admin.from("rank_promotions").select("to_tier").eq("id", promotionId).eq("profile_id", profileId).maybeSingle();
  if (!p) return;
  await admin.from("rank_promotions").update({ seen_at: new Date().toISOString() }).eq("profile_id", profileId).lte("to_tier", p.to_tier).is("seen_at", null);
}

/** The student's own rank and balance. */
export async function myRank(profileId: string): Promise<{ tier: number; points: number; showRank: boolean }> {
  const admin = createAdminClient();
  const [{ data: r }, { data: ledger }, { data: settings }] = await Promise.all([
    admin.from("student_ranks").select("tier").eq("profile_id", profileId).maybeSingle(),
    admin.from("points_ledger").select("points").eq("profile_id", profileId),
    admin.from("student_settings").select("show_rank").eq("profile_id", profileId).maybeSingle(),
  ]);
  return {
    tier: (r?.tier as number) ?? 1,
    points: (ledger ?? []).reduce((s, x) => s + (x.points as number), 0),
    showRank: (settings?.show_rank as boolean | undefined) ?? true,
  };
}

/**
 * Ranks other people may see: only students who haven't hidden their rank. Never points or scores.
 * The viewer's own rank is always included.
 */
export async function visibleRanks(profileIds: string[], viewerId: string): Promise<Map<string, Rank>> {
  if (!profileIds.length) return new Map();
  const admin = createAdminClient();
  const [{ data: ranks }, { data: hidden }] = await Promise.all([
    admin.from("student_ranks").select("profile_id, tier").in("profile_id", profileIds),
    admin.from("student_settings").select("profile_id").in("profile_id", profileIds).eq("show_rank", false),
  ]);
  const hide = new Set((hidden ?? []).map((h) => h.profile_id as string));
  const out = new Map<string, Rank>();
  for (const r of ranks ?? []) {
    const id = r.profile_id as string;
    if (id === viewerId || !hide.has(id)) out.set(id, rankByTier(r.tier as number));
  }
  return out;
}
