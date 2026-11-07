import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { areFriends, isBlockedEitherWay, pairOf, person } from "@/lib/social/friends";
import { visibleRanks } from "@/lib/social/rank-sync";
import { displayName, requireSocialStudent } from "@/lib/social/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LiveRefresh } from "@/components/live-refresh";
import { blockUser } from "../../_social/actions";
import { DmChat, type Dm, type InviteView } from "../../_social/dm-chat";
import { endFriendship, inviteFriendToGroup } from "../../_social/friend-actions";
import { RankBadge } from "../../_social/rank-badge";
import { Loading, Notice, StudentShell, primaryBtn } from "../../_social/shell";

export const metadata: Metadata = { title: "Messages" };

export default function MessagesPage({ params, searchParams }: PageProps<"/[lang]/student/messages/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Conversation params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const ERRORS: Record<string, string> = {
  invite: "That invite didn't send.",
  already: "They're already in that group.",
  pending: "You've already invited them to that group.",
  invites: "You've sent a lot of group invites today. Try again tomorrow.",
  full: "That group is full now.",
  gone: "That invite is no longer open.",
};

/** A conversation with one friend, with Invite to a group, Remove friend and Block (docs/friends.md). */
async function Conversation({ params, searchParams }: Pick<PageProps<"/[lang]/student/messages/[id]">, "params" | "searchParams">) {
  const [me, { id }, query, locale] = await Promise.all([requireSocialStudent(), params, searchParams, getLocale()]);
  if (!/^[0-9a-f-]{36}$/i.test(id) || id === me.profile.id) notFound();
  const friend = await person(id);
  if (!friend) notFound();
  const name = displayName(friend);
  const back = { href: "/student/friends", label: "Friends" };

  if (!(await areFriends(me.profile.id, id)) || (await isBlockedEitherWay(me.profile.id, id))) {
    return (
      <StudentShell me={me} title="Messages" current="friends" back={back}>
        <p className="text-ink-soft">You can only message friends. Add them by username on the Friends page.</p>
      </StudentShell>
    );
  }

  const admin = createAdminClient();
  const [a, b] = pairOf(me.profile.id, id);
  const [{ data: msgs }, { data: myGroups }, { data: theirGroups }, ranks] = await Promise.all([
    admin.from("direct_messages").select("id, a, b, sender_id, kind, body, invite_id, created_at").eq("a", a).eq("b", b).is("hidden_at", null).order("created_at", { ascending: false }).limit(100),
    admin.from("study_group_members").select("group_id, study_groups!inner(id, name, archived_at)").eq("profile_id", me.profile.id).is("study_groups.archived_at", null),
    admin.from("study_group_members").select("group_id").eq("profile_id", id),
    visibleRanks([id], me.profile.id),
  ]);
  const messages = ((msgs ?? []) as Dm[]).reverse();
  // Opening the conversation reads it.
  await admin.from("dm_reads").upsert({ profile_id: me.profile.id, other_id: id, read_at: new Date().toISOString() });

  const inviteIds = messages.flatMap((m) => (m.invite_id ? [m.invite_id] : []));
  const { data: inviteRows } = inviteIds.length
    ? await admin.from("group_friend_invites").select("id, group_id, inviter_id, state, study_groups(name)").in("id", inviteIds)
    : { data: [] };
  const groupIds = [...new Set((inviteRows ?? []).map((i) => i.group_id as string))];
  const { data: memberRows } = groupIds.length ? await admin.from("study_group_members").select("group_id").in("group_id", groupIds) : { data: [] };
  const sizes = new Map<string, number>();
  for (const r of memberRows ?? []) sizes.set(r.group_id as string, (sizes.get(r.group_id as string) ?? 0) + 1);
  const invites: Record<string, InviteView> = Object.fromEntries(
    (inviteRows ?? []).map((i) => [
      i.id as string,
      {
        id: i.id as string,
        groupName: (i.study_groups as unknown as { name: string } | null)?.name ?? "a group",
        members: sizes.get(i.group_id as string) ?? 0,
        state: i.state as string,
        mine: i.inviter_id === me.profile.id,
      },
    ]),
  );

  const theirs = new Set((theirGroups ?? []).map((g) => g.group_id as string));
  const groups = (myGroups ?? []).map((g) => ({ id: g.group_id as string, name: (g.study_groups as unknown as { name: string }).name, in: theirs.has(g.group_id as string) }));
  const invitable = groups.filter((g) => !g.in);
  const rank = ranks.get(id);
  const error = typeof query.error === "string" ? ERRORS[query.error] : null;
  const suspended = Boolean(me.student.chat_suspended_until && Date.parse(me.student.chat_suspended_until) > new Date().getTime());

  return (
    <StudentShell me={me} title={name} current="friends" back={back}>
      {/* Realtime delivers new messages; this is the safety net if the connection drops. */}
      <LiveRefresh seconds={20} />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-ink-soft">
          {rank && <RankBadge rank={rank} size={22} />}
          {friend.username ? `@${friend.username}` : "Friend"}
          {rank && <span>· {rank.name}</span>}
        </p>
        <details className="relative">
          <summary className="flex h-9 cursor-pointer list-none items-center rounded-full border border-rule bg-sheet px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
            Options ⋯
          </summary>
          <div className="absolute right-0 z-20 mt-2 flex w-72 flex-col gap-3 rounded-2xl border border-rule bg-sheet p-4 shadow-lg">
            <form action={inviteFriendToGroup.bind(null, id)} className="flex flex-col gap-2">
              <span className="text-sm font-medium">Invite {friend.first_name} to a group</span>
              {invitable.length === 0 ? (
                <span className="text-xs text-ink-faint">{groups.length === 0 ? "You're not in any groups yet." : `${friend.first_name}'s already in all your groups.`}</span>
              ) : (
                <>
                  <label className="sr-only" htmlFor="invite-group">
                    Group
                  </label>
                  <select id="invite-group" name="group" className="h-9 rounded-md border border-rule bg-paper px-2 text-sm">
                    {invitable.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <button className={primaryBtn}>Send invite</button>
                </>
              )}
            </form>
            <div className="flex flex-col gap-1 border-t border-rule pt-3 text-sm">
              <form action={endFriendship.bind(null, id)}>
                <button className="text-ink-soft hover:text-ink">Remove friend</button>
              </form>
              <form action={blockUser.bind(null, id)}>
                <button className="text-pen">Block {friend.first_name}</button>
              </form>
              <span className="text-xs text-ink-faint">Blocking ends the friendship and this chat. To report a message, use ⋯ next to it.</span>
            </div>
          </div>
        </details>
      </div>
      <DmChat meId={me.profile.id} friendId={id} friendName={friend.first_name} initial={messages} invites={invites} canPost={!suspended} />
      <p className="text-xs text-ink-faint">
        Only you and {friend.first_name} see this chat. Be kind; reported messages are reviewed by Edumi.{" "}
        <Link href={localizePath("/legal/house-rules", locale)}>House rules</Link>
      </p>
    </StudentShell>
  );
}
