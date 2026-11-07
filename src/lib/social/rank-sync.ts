import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { dateKeyOf } from "@/lib/time";
import { DAILY_POINT_CAP } from "./points";
import { RANK_THRESHOLDS, rankByTier, rankProgress, type Rank } from "./ranks";

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

/**
 * The chat's practice prompt: the student's rank, points to the next one and points still
 * available today. Only ever shown to the student themself.
 */
export type RankStatus = { rank: Rank; next: Rank | null; toNext: number; fraction: number; todayLeft: number };

export async function rankStatus(profileId: string): Promise<RankStatus> {
  const { data } = await createAdminClient().from("points_ledger").select("points, day").eq("profile_id", profileId);
  const rows = data ?? [];
  const total = rows.reduce((sum, r) => sum + (r.points as number), 0);
  const today = dateKeyOf();
  const earnedToday = rows.filter((r) => r.day === today).reduce((sum, r) => sum + (r.points as number), 0);
  const { rank, next, toNext, fraction } = rankProgress(total);
  return { rank, next, toNext, fraction, todayLeft: Math.max(0, DAILY_POINT_CAP - earnedToday) };
}

/**
 * The newest rank-up by another member of the group in the last day, for the chat nudge. Members
 * who hide their rank, and people the viewer blocked, are left out; the nudge shows only the new
 * rank (which members already see as a badge), never points.
 */
export type GroupRankUp = { id: string; profileId: string; to: Rank; at: string };

export async function latestGroupRankUp(memberIds: string[], viewerId: string, blockedIds: string[]): Promise<GroupRankUp | null> {
  const others = memberIds.filter((id) => id !== viewerId && !blockedIds.includes(id));
  if (!others.length) return null;
  const admin = createAdminClient();
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [{ data: promos }, { data: hidden }] = await Promise.all([
    admin.from("rank_promotions").select("id, profile_id, to_tier, created_at").in("profile_id", others).gte("created_at", since).order("created_at", { ascending: false }).limit(10),
    admin.from("student_settings").select("profile_id").in("profile_id", others).eq("show_rank", false),
  ]);
  const hide = new Set((hidden ?? []).map((h) => h.profile_id as string));
  const p = (promos ?? []).find((x) => !hide.has(x.profile_id as string));
  return p ? { id: p.id as string, profileId: p.profile_id as string, to: rankByTier(p.to_tier as number), at: p.created_at as string } : null;
}
