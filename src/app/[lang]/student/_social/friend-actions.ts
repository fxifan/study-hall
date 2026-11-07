"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, localizePath } from "@/i18n/config";
import { track } from "@/lib/events";
import {
  DMS_PER_MINUTE,
  FRIEND_REQUESTS_PER_DAY,
  GROUP_INVITES_PER_DAY,
  areFriends,
  friendship,
  lookupUsername,
  pairOf,
  person,
} from "@/lib/social/friends";
import { MAX_GROUP_MEMBERS, displayName, isMember, postSystemMessage, socialActor } from "@/lib/social/server";
import { USERNAME_CHANGE_DAYS, normaliseUsername, usernameProblem } from "@/lib/social/usernames";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Friends by username, direct messages and friend group invites (docs/friends.md). The rules are
 * in src/lib/social/friends.ts; every action checks them again on the server.
 */
const uuid = z.uuid();

async function href(path: string) {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return localizePath(path, isLocale(v) ? v : DEFAULT_LOCALE);
}

const dayAgo = () => new Date(Date.now() - 86_400_000).toISOString();

// --- Usernames --------------------------------------------------------------------------------

export async function setUsername(formData: FormData) {
  const me = await socialActor({ paid: false });
  const back = String(formData.get("back") ?? "/student/me") === "/student/friends" ? "/student/friends" : "/student/me";
  const username = normaliseUsername(String(formData.get("username") ?? ""));
  const problem = usernameProblem(username);
  if (problem) redirect(await href(`${back}?username_error=${encodeURIComponent(problem)}`));
  const admin = createAdminClient();
  const { data: current } = await admin.from("students").select("username, username_changed_at").eq("profile_id", me.profile.id).single();
  if (current?.username === username) redirect(await href(back));
  if (current?.username && current.username_changed_at && Date.now() - Date.parse(current.username_changed_at) < USERNAME_CHANGE_DAYS * 86_400_000) {
    redirect(await href(`${back}?username_error=${encodeURIComponent(`You can change your username once every ${USERNAME_CHANGE_DAYS} days.`)}`));
  }
  const { error } = await admin.from("students").update({ username, username_changed_at: new Date().toISOString() }).eq("profile_id", me.profile.id);
  if (error) {
    const msg = error.code === "23505" ? "That username is taken." : "That username didn't save.";
    redirect(await href(`${back}?username_error=${encodeURIComponent(msg)}`));
  }
  redirect(await href(`${back}?username_saved=1`));
}

// --- Friend requests --------------------------------------------------------------------------

export async function requestFriendByUsername(formData: FormData) {
  const me = await socialActor();
  const username = normaliseUsername(String(formData.get("username") ?? ""));
  const found = usernameProblem(username) ? ({ found: false } as const) : await lookupUsername(username, me.profile.id);
  if (!found.found || found.state === "self") redirect(await href(`/student/friends?add=${encodeURIComponent(username)}`));
  if (found.state === "friends" || found.state === "requested") redirect(await href(`/student/friends?add=${encodeURIComponent(username)}`));
  const admin = createAdminClient();
  const [a, b] = pairOf(me.profile.id, found.profileId);
  if (found.state === "incoming") {
    // They already asked: adding them back accepts.
    await admin.from("friendships").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("a", a).eq("b", b).neq("requested_by", me.profile.id);
    await track({ name: "friend_request_accepted", product: "platform", role: "student", userId: me.profile.id });
    redirect(await href(`/student/friends?add=${encodeURIComponent(username)}`));
  }
  const { count } = await admin.from("friendships").select("a", { count: "exact", head: true }).eq("requested_by", me.profile.id).gt("created_at", dayAgo());
  if ((count ?? 0) >= FRIEND_REQUESTS_PER_DAY) redirect(await href(`/student/friends?add=${encodeURIComponent(username)}&error=requests`));
  await admin.from("friendships").upsert({ a, b, requested_by: me.profile.id }, { onConflict: "a,b", ignoreDuplicates: true });
  await track({ name: "friend_request_sent", product: "platform", role: "student", userId: me.profile.id, props: { via: "username" } });
  redirect(await href(`/student/friends?add=${encodeURIComponent(username)}`));
}

/** Cancel a request you sent, decline one you got, or remove a friend. */
export async function endFriendship(profileId: string) {
  const me = await socialActor({ paid: false });
  if (!uuid.safeParse(profileId).success) return;
  const [a, b] = pairOf(me.profile.id, profileId);
  const admin = createAdminClient();
  await admin.from("friendships").delete().eq("a", a).eq("b", b);
  await admin
    .from("group_friend_invites")
    .update({ state: "cancelled", responded_at: new Date().toISOString() })
    .eq("state", "pending")
    .or(`and(inviter_id.eq.${me.profile.id},invitee_id.eq.${profileId}),and(inviter_id.eq.${profileId},invitee_id.eq.${me.profile.id})`);
  refresh();
}

// --- Direct messages --------------------------------------------------------------------------

export type DmResult = { ok: true } | { ok: false; error: string };

export async function sendDm(friendId: string, body: string): Promise<DmResult> {
  const me = await socialActor();
  const text = body.trim();
  if (!text || text.length > 1000) return { ok: false, error: "Messages can be up to 1000 characters." };
  if (!uuid.safeParse(friendId).success || !(await areFriends(me.profile.id, friendId))) return { ok: false, error: "You can only message friends." };
  if (me.student.chat_suspended_until && Date.parse(me.student.chat_suspended_until) > Date.now()) {
    return { ok: false, error: "Your chat is paused by a moderator for now." };
  }
  const admin = createAdminClient();
  const { count } = await admin
    .from("direct_messages")
    .select("id", { count: "exact", head: true })
    .eq("sender_id", me.profile.id)
    .gt("created_at", new Date(Date.now() - 60_000).toISOString());
  if ((count ?? 0) >= DMS_PER_MINUTE) return { ok: false, error: "Slow down a little: try again in a minute." };
  const [a, b] = pairOf(me.profile.id, friendId);
  const { error } = await admin.from("direct_messages").insert({ a, b, sender_id: me.profile.id, kind: "text", body: text });
  if (error) return { ok: false, error: "That message didn't send." };
  await admin.from("dm_reads").upsert({ profile_id: me.profile.id, other_id: friendId, read_at: new Date().toISOString() });
  return { ok: true };
}

export async function reportDm(messageId: string, reason: string): Promise<DmResult> {
  const me = await socialActor({ paid: false });
  if (!uuid.safeParse(messageId).success) return { ok: false, error: "Message not found." };
  const admin = createAdminClient();
  const { data: m } = await admin.from("direct_messages").select("a, b, sender_id").eq("id", messageId).maybeSingle();
  if (!m || (m.a !== me.profile.id && m.b !== me.profile.id) || m.sender_id === me.profile.id) return { ok: false, error: "Message not found." };
  const { error } = await admin.from("dm_reports").insert({ message_id: messageId, reporter_id: me.profile.id, reason: reason.trim().slice(0, 300) || "No reason given" });
  if (error && error.code !== "23505") return { ok: false, error: "The report didn't send." };
  await track({ name: "message_reported", product: "platform", role: "student", userId: me.profile.id, props: { kind: "direct" } });
  return { ok: true };
}

// --- Group invites between friends -------------------------------------------------------------

export async function inviteFriendToGroup(friendId: string, formData: FormData) {
  const me = await socialActor();
  const groupId = String(formData.get("group") ?? "");
  const back = `/student/messages/${friendId}`;
  if (!uuid.safeParse(friendId).success || !uuid.safeParse(groupId).success) redirect(await href(`${back}?error=invite`));
  if (!(await areFriends(me.profile.id, friendId)) || !(await isMember(groupId, me.profile.id))) redirect(await href(`${back}?error=invite`));
  if (await isMember(groupId, friendId)) redirect(await href(`${back}?error=already`));
  const admin = createAdminClient();
  const { count } = await admin.from("group_friend_invites").select("id", { count: "exact", head: true }).eq("inviter_id", me.profile.id).gt("created_at", dayAgo());
  if ((count ?? 0) >= GROUP_INVITES_PER_DAY) redirect(await href(`${back}?error=invites`));
  const { data: group } = await admin.from("study_groups").select("id, name").eq("id", groupId).is("archived_at", null).maybeSingle();
  if (!group) redirect(await href(`${back}?error=invite`));
  const { data: invite, error } = await admin.from("group_friend_invites").insert({ group_id: groupId, inviter_id: me.profile.id, invitee_id: friendId }).select("id").single();
  if (error) redirect(await href(`${back}?error=${error.code === "23505" ? "pending" : "invite"}`));
  const [a, b] = pairOf(me.profile.id, friendId);
  await admin.from("direct_messages").insert({ a, b, sender_id: me.profile.id, kind: "invite", body: `Invited you to ${group.name}`, invite_id: invite.id });
  await track({ name: "group_invite_sent", product: "platform", role: "student", userId: me.profile.id, objectType: "study_group", objectId: groupId });
  redirect(await href(back));
}

export async function respondGroupInvite(inviteId: string, accept: boolean) {
  const me = await socialActor({ paid: !accept ? false : true });
  if (!uuid.safeParse(inviteId).success) return;
  const admin = createAdminClient();
  const { data: inv } = await admin.from("group_friend_invites").select("id, group_id, inviter_id, invitee_id, state").eq("id", inviteId).maybeSingle();
  if (!inv || inv.invitee_id !== me.profile.id || inv.state !== "pending") return refresh();
  const now = new Date().toISOString();
  if (!accept) {
    await admin.from("group_friend_invites").update({ state: "declined", responded_at: now }).eq("id", inviteId).eq("state", "pending");
    return refresh();
  }
  const groupId = inv.group_id as string;
  const { data: group } = await admin.from("study_groups").select("id").eq("id", groupId).is("archived_at", null).maybeSingle();
  // The inviter must still be in the group (and still a friend) for the invite to stand.
  const stands = group && (await isMember(groupId, inv.inviter_id as string)) && (await friendship(me.profile.id, inv.inviter_id as string))?.status === "accepted";
  if (!stands) {
    await admin.from("group_friend_invites").update({ state: "cancelled", responded_at: now }).eq("id", inviteId);
    redirect(await href(`/student/messages/${inv.inviter_id}?error=gone`));
  }
  if (!(await isMember(groupId, me.profile.id))) {
    const { count } = await admin.from("study_group_members").select("profile_id", { count: "exact", head: true }).eq("group_id", groupId);
    if ((count ?? 0) >= MAX_GROUP_MEMBERS) redirect(await href(`/student/messages/${inv.inviter_id}?error=full`));
    const ins = await admin.from("study_group_members").insert({ group_id: groupId, profile_id: me.profile.id });
    if (ins.error && ins.error.code !== "23505") throw ins.error;
    const self = await person(me.profile.id);
    await postSystemMessage(groupId, "system", `${self ? displayName(self) : "A friend"} joined the group.`, { event: "joined" });
    await track({ name: "study_group_joined", product: "platform", role: "student", userId: me.profile.id, objectType: "study_group", objectId: groupId, props: { via: "friend_invite" } });
  }
  await admin.from("group_friend_invites").update({ state: "accepted", responded_at: now }).eq("id", inviteId);
  redirect(await href(`/student/groups/${groupId}`));
}
