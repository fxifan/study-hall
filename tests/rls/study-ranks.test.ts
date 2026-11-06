/**
 * Study Ranks in the database (docs/study-ranks.md): sync_student_rank records each promotion once,
 * even when awards arrive concurrently, jumps several tiers in one event, never demotes, and only
 * the service role can call it. Runs against the Supabase project in .env.local.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient } from "../../scripts/lib/env";
import { RANK_THRESHOLDS } from "../../src/lib/social/ranks";
import { signedOutClient } from "../helpers";

const admin = createAdminClient();
let profileId = "";
const lineage = () => crypto.randomUUID();
const sync = () => admin.rpc("sync_student_rank", { p_profile: profileId, p_thresholds: RANK_THRESHOLDS });
const award = (points: number) => admin.from("points_ledger").insert({ profile_id: profileId, lineage_id: lineage(), kind: "marks", points, day: "2026-11-07" });

beforeAll(async () => {
  const { data: org } = await admin.from("orgs").select("id").limit(1).single();
  const { data } = await admin.auth.admin.createUser({ email: `ranks-${Date.now()}@studyhall.test`, email_confirm: true, app_metadata: { role: "student", org_id: org!.id } });
  profileId = data.user!.id;
});
afterAll(async () => {
  await admin.auth.admin.deleteUser(profileId);
});

describe("sync_student_rank", () => {
  it("starts at Copper with no promotion", async () => {
    const { data, error } = await sync();
    expect(error).toBeNull();
    expect(data).toEqual([]);
    const { data: r } = await admin.from("student_ranks").select("tier").eq("profile_id", profileId).single();
    expect(r!.tier).toBe(1);
  });

  it("just below a threshold doesn't promote; exactly at it does, once", async () => {
    await award(49);
    expect((await sync()).data).toEqual([]);
    await award(1);
    const { data } = await sync();
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ from_tier: 1, to_tier: 2, points: 50 });
    expect((await sync()).data).toEqual([]); // a retry adds nothing
  });

  it("concurrent syncs after one award record a single promotion", async () => {
    await award(100); // 150 → Silver
    const results = await Promise.all(Array.from({ length: 8 }, () => sync()));
    const promotions = results.flatMap((r) => r.data ?? []);
    expect(promotions).toHaveLength(1);
    expect(promotions[0]).toMatchObject({ from_tier: 2, to_tier: 3 });
  });

  it("several tiers in one award are one event to the highest tier", async () => {
    await award(1000); // 1150 → Ruby (tier 6)
    const { data } = await sync();
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ from_tier: 3, to_tier: 6 });
  });

  it("reaches Grandmaster, never demotes, and keeps one row per tier", async () => {
    await award(7000);
    expect((await sync()).data![0]).toMatchObject({ to_tier: 13 });
    await award(5000);
    expect((await sync()).data).toEqual([]);
    const { data: rows } = await admin.from("rank_promotions").select("to_tier").eq("profile_id", profileId).order("to_tier");
    expect(rows!.map((r) => r.to_tier)).toEqual([2, 3, 6, 13]);
  });

  it("rejects a bad ladder and can't be called by signed-out visitors", async () => {
    const bad = await admin.rpc("sync_student_rank", { p_profile: profileId, p_thresholds: [5, 10] });
    expect(bad.error).not.toBeNull();
    const anon = await signedOutClient().rpc("sync_student_rank", { p_profile: profileId, p_thresholds: RANK_THRESHOLDS });
    expect(anon.error).not.toBeNull();
  });
});
