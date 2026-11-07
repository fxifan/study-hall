/**
 * Friends, direct messages and group invites in the database (docs/friends.md): students read only
 * their own conversations, invites and read markers; nobody can write them directly or read
 * reports; usernames are unique and well-formed. Runs against the Supabase project in .env.local.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient, requireEnv } from "../../scripts/lib/env";
import { signedOutClient } from "../helpers";

const admin = createAdminClient();
const stamp = Date.now();
const ids: Record<"mia" | "leo" | "zoe", string> = { mia: "", leo: "", zoe: "" };
const clients: Partial<Record<keyof typeof ids, SupabaseClient>> = {};
let groupId = "";
let dmId = "";

async function signIn(email: string) {
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const client = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.verifyOtp({ token_hash: data.properties!.hashed_token, type: "magiclink" });
  if (error) throw error;
  return client;
}

beforeAll(async () => {
  const { data: org } = await admin.from("orgs").select("id").limit(1).single();
  for (const name of Object.keys(ids) as (keyof typeof ids)[]) {
    const email = `dm-${name}-${stamp}@studyhall.test`;
    const { data } = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role: "student", org_id: org!.id } });
    ids[name] = data.user!.id;
    await admin.from("students").insert({ org_id: org!.id, profile_id: ids[name], first_name: name, last_initial: "T", year_level: 10, status: "active", self_signed: true, social_enabled: true });
    clients[name] = await signIn(email);
  }
  const [a, b] = [ids.mia, ids.leo].sort();
  await admin.from("friendships").insert({ a, b, requested_by: ids.mia, status: "accepted", accepted_at: new Date().toISOString() });
  const { data: g } = await admin.from("study_groups").insert({ org_id: org!.id, name: "DM test", created_by: ids.mia }).select("id").single();
  groupId = g!.id;
  await admin.from("study_group_members").insert({ group_id: groupId, profile_id: ids.mia, role: "owner" });
  const { data: inv } = await admin.from("group_friend_invites").insert({ group_id: groupId, inviter_id: ids.mia, invitee_id: ids.leo }).select("id").single();
  const { data: m } = await admin.from("direct_messages").insert({ a, b, sender_id: ids.mia, body: "hi leo" }).select("id").single();
  dmId = m!.id;
  await admin.from("direct_messages").insert({ a, b, sender_id: ids.mia, kind: "invite", body: "Invited you to DM test", invite_id: inv!.id });
  await admin.from("dm_reads").insert({ profile_id: ids.leo, other_id: ids.mia });
  await admin.from("dm_reports").insert({ message_id: dmId, reporter_id: ids.leo, reason: "test" });
});

afterAll(async () => {
  if (groupId) {
    await admin.from("study_group_members").delete().eq("group_id", groupId);
    await admin.from("study_groups").delete().eq("id", groupId);
  }
  for (const id of Object.values(ids)) {
    if (!id) continue;
    await admin.from("students").delete().eq("profile_id", id);
    await admin.auth.admin.deleteUser(id);
  }
});

describe("direct messages", () => {
  it("the two friends read their conversation; a third student and visitors don't", async () => {
    expect((await clients.mia!.from("direct_messages").select("id")).data).toHaveLength(2);
    expect((await clients.leo!.from("direct_messages").select("id")).data).toHaveLength(2);
    expect((await clients.zoe!.from("direct_messages").select("id")).data).toEqual([]);
    expect((await signedOutClient().from("direct_messages").select("id")).data ?? []).toEqual([]);
  });

  it("hidden messages disappear for both", async () => {
    await admin.from("direct_messages").update({ hidden_at: new Date().toISOString() }).eq("id", dmId);
    expect((await clients.leo!.from("direct_messages").select("id").eq("id", dmId)).data).toEqual([]);
    await admin.from("direct_messages").update({ hidden_at: null }).eq("id", dmId);
  });

  it("nobody writes directly: messages, invites, reads and reports go through the server", async () => {
    const [a, b] = [ids.mia, ids.leo].sort();
    expect((await clients.mia!.from("direct_messages").insert({ a, b, sender_id: ids.mia, body: "sneaky" })).error).not.toBeNull();
    expect((await clients.zoe!.from("group_friend_invites").insert({ group_id: groupId, inviter_id: ids.zoe, invitee_id: ids.leo })).error).not.toBeNull();
    expect((await clients.leo!.from("dm_reads").upsert({ profile_id: ids.leo, other_id: ids.mia })).error).not.toBeNull();
    const reports = await clients.leo!.from("dm_reports").select("id");
    expect(reports.data ?? []).toEqual([]);
  });
});

describe("group invites and reads", () => {
  it("only the inviter and invitee see an invite; read markers are private", async () => {
    expect((await clients.mia!.from("group_friend_invites").select("id")).data).toHaveLength(1);
    expect((await clients.leo!.from("group_friend_invites").select("id")).data).toHaveLength(1);
    expect((await clients.zoe!.from("group_friend_invites").select("id")).data).toEqual([]);
    expect((await clients.leo!.from("dm_reads").select("other_id")).data).toHaveLength(1);
    expect((await clients.mia!.from("dm_reads").select("other_id")).data).toEqual([]);
  });
});

describe("usernames", () => {
  it("are unique and well-formed", async () => {
    const name = `t${stamp % 1_000_000_000}`;
    expect((await admin.from("students").update({ username: name }).eq("profile_id", ids.mia)).error).toBeNull();
    expect((await admin.from("students").update({ username: name }).eq("profile_id", ids.leo)).error?.code).toBe("23505");
    for (const bad of ["Ab", "ab", ".abc", "abc_", "a..bc", "has space"]) {
      expect((await admin.from("students").update({ username: bad }).eq("profile_id", ids.zoe)).error, bad).not.toBeNull();
    }
  });
});
