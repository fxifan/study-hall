import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { displayName } from "./server";
import { isAdult } from "./usernames";

/**
 * Friends, direct messages and friend group invites (docs/friends.md). Every rule lives here so
 * pages and actions agree: friends are found only by exact username, requests need accepting,
 * only accepted friends can message or invite, blocks work both ways, and an adult and an
 * under-18 can only connect when they already share a group.
 */
export const FRIEND_REQUESTS_PER_DAY = 20;
export const GROUP_INVITES_PER_DAY = 10;
export const DMS_PER_MINUTE = 15;

export const pairOf = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

type Person = { profile_id: string; first_name: string; last_initial: string; username: string | null; birth_year: number | null; birth_month: number | null };
const PERSON = "profile_id, first_name, last_initial, username, birth_year, birth_month";

export async function person(profileId: string): Promise<Person | null> {
  const { data } = await createAdminClient().from("students").select(PERSON).eq("profile_id", profileId).maybeSingle<Person>();
  return data;
}

export async function isBlockedEitherWay(x: string, y: string): Promise<boolean> {
  const { count } = await createAdminClient()
    .from("user_blocks")
    .select("blocker_id", { count: "exact", head: true })
    .or(`and(blocker_id.eq.${x},blocked_id.eq.${y}),and(blocker_id.eq.${y},blocked_id.eq.${x})`);
  return Boolean(count);
}

export async function sharedGroupCount(x: string, y: string): Promise<number> {
  const admin = createAdminClient();
  const { data: mine } = await admin.from("study_group_members").select("group_id").eq("profile_id", x);
  const ids = (mine ?? []).map((g) => g.group_id as string);
  if (!ids.length) return 0;
  const { count } = await admin.from("study_group_members").select("group_id", { count: "exact", head: true }).eq("profile_id", y).in("group_id", ids);
  return count ?? 0;
}

export type Friendship = { status: "pending" | "accepted"; requested_by: string } | null;

export async function friendship(x: string, y: string): Promise<Friendship> {
  const [a, b] = pairOf(x, y);
  const { data } = await createAdminClient().from("friendships").select("status, requested_by").eq("a", a).eq("b", b).maybeSingle();
  return (data as Friendship) ?? null;
}

export async function areFriends(x: string, y: string): Promise<boolean> {
  return (await friendship(x, y))?.status === "accepted";
}

/** Whether these two may connect at all (blocks, and the adult/under-18 rule). */
export async function mayConnect(me: Person, other: Person): Promise<boolean> {
  if (me.profile_id === other.profile_id) return false;
  if (await isBlockedEitherWay(me.profile_id, other.profile_id)) return false;
  if (isAdult(me) !== isAdult(other) && (await sharedGroupCount(me.profile_id, other.profile_id)) === 0) return false;
  return true;
}

export type Lookup =
  | { found: false }
  | {
      found: true;
      profileId: string;
      name: string;
      username: string;
      sharedGroups: number;
      state: "self" | "friends" | "requested" | "incoming" | "none";
    };

/**
 * Find a student by exact username, as `viewer` sees it. Someone the viewer may not connect with
 * (blocked either way, or the adult/under-18 rule) looks exactly like nobody, so the lookup can't
 * be used to discover them.
 */
export async function lookupUsername(username: string, viewerId: string): Promise<Lookup> {
  const admin = createAdminClient();
  const { data: other } = await admin.from("students").select(PERSON).eq("username", username).eq("social_enabled", true).maybeSingle<Person>();
  if (!other) return { found: false };
  if (other.profile_id === viewerId) return { found: true, profileId: other.profile_id, name: displayName(other), username, sharedGroups: 0, state: "self" };
  const me = await person(viewerId);
  if (!me || !(await mayConnect(me, other))) return { found: false };
  const [f, sharedGroups] = await Promise.all([friendship(viewerId, other.profile_id), sharedGroupCount(viewerId, other.profile_id)]);
  const state = !f ? "none" : f.status === "accepted" ? "friends" : f.requested_by === viewerId ? "requested" : "incoming";
  return { found: true, profileId: other.profile_id, name: displayName(other), username, sharedGroups, state };
}

export type Thread = { friendId: string; last: { body: string; mine: boolean; at: string; kind: string } | null; unread: boolean };

/** Conversations with each accepted friend: the last message and whether it's unread. */
export async function threadsFor(viewerId: string, friendIds: string[]): Promise<Thread[]> {
  if (!friendIds.length) return [];
  const admin = createAdminClient();
  const [{ data: msgs }, { data: reads }] = await Promise.all([
    admin
      .from("direct_messages")
      .select("a, b, sender_id, kind, body, created_at")
      .or(`a.eq.${viewerId},b.eq.${viewerId}`)
      .is("hidden_at", null)
      .order("created_at", { ascending: false })
      .limit(400),
    admin.from("dm_reads").select("other_id, read_at").eq("profile_id", viewerId),
  ]);
  const readAt = new Map((reads ?? []).map((r) => [r.other_id as string, r.read_at as string]));
  const lastBy = new Map<string, { body: string; mine: boolean; at: string; kind: string }>();
  const unread = new Set<string>();
  for (const m of msgs ?? []) {
    const other = m.a === viewerId ? (m.b as string) : (m.a as string);
    if (!lastBy.has(other)) lastBy.set(other, { body: m.body as string, mine: m.sender_id === viewerId, at: m.created_at as string, kind: m.kind as string });
    if (m.sender_id !== viewerId && (!readAt.has(other) || (m.created_at as string) > readAt.get(other)!)) unread.add(other);
  }
  return friendIds
    .map((friendId) => ({ friendId, last: lastBy.get(friendId) ?? null, unread: unread.has(friendId) }))
    .sort((x, y) => (y.last?.at ?? "").localeCompare(x.last?.at ?? ""));
}

/** For the Friends tab dot: incoming requests, unread messages or pending group invites. */
export async function friendsNeedAttention(viewerId: string): Promise<boolean> {
  const admin = createAdminClient();
  const [{ count: requests }, { count: invites }, { data: friends }] = await Promise.all([
    admin.from("friendships").select("a", { count: "exact", head: true }).or(`a.eq.${viewerId},b.eq.${viewerId}`).eq("status", "pending").neq("requested_by", viewerId),
    admin.from("group_friend_invites").select("id", { count: "exact", head: true }).eq("invitee_id", viewerId).eq("state", "pending"),
    admin.from("friendships").select("a, b").or(`a.eq.${viewerId},b.eq.${viewerId}`).eq("status", "accepted"),
  ]);
  if (requests || invites) return true;
  const ids = (friends ?? []).map((f) => (f.a === viewerId ? (f.b as string) : (f.a as string)));
  return (await threadsFor(viewerId, ids)).some((t) => t.unread);
}
