import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { dayWindow, groupDayOf, rank, shortMinutes, weekWindow } from "@/lib/social/credit";
import { lookupUsername, threadsFor, type Lookup } from "@/lib/social/friends";
import { visibleRanks } from "@/lib/social/rank-sync";
import { namesFor, personSeconds, requireSocialStudent } from "@/lib/social/server";
import { normaliseUsername, usernameProblem } from "@/lib/social/usernames";
import { siteOrigin } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";
import { MELBOURNE, formatInZone } from "@/lib/time";
import { respondFriend, setFriendsBoard } from "../_social/actions";
import { CopyButton } from "../_social/copy-button";
import { endFriendship, requestFriendByUsername } from "../_social/friend-actions";
import { RankBadge } from "../_social/rank-badge";
import { GroupsTabs, Loading, Notice, StudentShell, card, primaryBtn, smallBtn, tile } from "../_social/shell";
import { UsernameCard } from "../_social/username-card";

export const metadata: Metadata = { title: "Friends" };

export default function FriendsPage({ searchParams }: PageProps<"/[lang]/student/friends">) {
  return (
    <Suspense fallback={<Loading />}>
      <Friends searchParams={searchParams} />
    </Suspense>
  );
}

const ERRORS: Record<string, string> = {
  requests: "You've sent a lot of friend requests today. Try again tomorrow.",
};

/**
 * Friends (docs/friends.md): add by exact username (nobody can browse or search strangers),
 * requests, conversations with friends, and the Friends board of verified study minutes across all
 * groups (it never shows which groups a friend is in).
 */
async function Friends({ searchParams }: Pick<PageProps<"/[lang]/student/friends">, "searchParams">) {
  const [me, query, locale] = await Promise.all([requireSocialStudent(), searchParams, getLocale()]);
  const admin = createAdminClient();
  const week = query.view === "week";
  const [{ data: rows }, { data: self }] = await Promise.all([
    admin.from("friendships").select("a, b, status, requested_by").or(`a.eq.${me.profile.id},b.eq.${me.profile.id}`),
    admin.from("students").select("username").eq("profile_id", me.profile.id).single(),
  ]);
  const myUsername = (self?.username as string | null) ?? null;
  const other = (r: { a: string; b: string }) => (r.a === me.profile.id ? r.b : r.a);
  const accepted = (rows ?? []).filter((r) => r.status === "accepted").map(other);
  const incoming = (rows ?? []).filter((r) => r.status === "pending" && r.requested_by !== me.profile.id).map(other);
  const outgoing = (rows ?? []).filter((r) => r.status === "pending" && r.requested_by === me.profile.id).map(other);
  const { data: people } = await admin.from("students").select("profile_id, username").in("profile_id", [...accepted, ...incoming, ...outgoing]);
  const handle = new Map((people ?? []).map((p) => [p.profile_id as string, p.username as string | null]));

  // Add by username: ?add=mia.studies looks them up (exact match only).
  const typed = typeof query.add === "string" ? normaliseUsername(query.add) : "";
  const lookup: Lookup | null = typed ? (usernameProblem(typed) ? { found: false } : await lookupUsername(typed, me.profile.id)) : null;

  const { data: settings } = await admin.from("student_settings").select("profile_id, friends_board_opt_in").in("profile_id", [me.profile.id, ...accepted]);
  const optIn = new Map((settings ?? []).map((s) => [s.profile_id as string, s.friends_board_opt_in as boolean]));
  const iOptIn = optIn.get(me.profile.id) ?? true;
  const onBoard = [me.profile.id, ...accepted].filter((id) => optIn.get(id) ?? true);
  const [names, threads, ranks] = await Promise.all([
    namesFor([...accepted, ...incoming, ...outgoing]),
    threadsFor(me.profile.id, accepted),
    visibleRanks([...new Set([...onBoard, ...accepted, ...(lookup?.found ? [lookup.profileId] : [])])], me.profile.id),
  ]);

  const day = groupDayOf(new Date(), MELBOURNE);
  const w = week ? weekWindow(day, MELBOURNE) : dayWindow(day, MELBOURNE);
  const totals = iOptIn ? await personSeconds(onBoard, w.start, w.end) : new Map<string, number>();
  const standings = rank(new Map(onBoard.map((id) => [id, totals.get(id) ?? 0])));
  const shareUrl = myUsername ? `${await siteOrigin()}${localizePath(`/student/friends?add=${myUsername}`, locale)}` : null;
  const href = (p: string) => localizePath(p, locale);
  const error = typeof query.error === "string" ? ERRORS[query.error] : null;
  const usernameError = typeof query.username_error === "string" ? query.username_error : null;

  return (
    <StudentShell me={me} title="Friends" current="friends">
      <GroupsTabs current="friends" />
      {error && <Notice tone="error">{error}</Notice>}
      {!myUsername && <UsernameCard current={null} back="/student/friends" error={usernameError} />}

      <section className={`${card} flex flex-col gap-3`} aria-labelledby="add-heading">
        <h2 id="add-heading" className="font-medium">
          Add a friend by username
        </h2>
        <form method="get" className="flex gap-2">
          <label className="flex h-10 flex-1 items-center rounded-md border border-rule bg-paper px-3 focus-within:border-ink">
            <span className="text-ink-faint" aria-hidden="true">
              @
            </span>
            <span className="sr-only">Their username</span>
            <input name="add" required defaultValue={typed} placeholder="their.username" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="h-full min-w-0 flex-1 bg-transparent outline-none" />
          </label>
          <button className={primaryBtn}>Find</button>
        </form>
        {lookup && !lookup.found && (
          <p className="text-sm text-ink-soft" role="status">
            No one with the username @{typed}. Check the spelling with your friend.
          </p>
        )}
        {lookup?.found && (
          <div className="flex items-center gap-3 rounded-xl bg-paper p-3" data-testid="lookup-result">
            {ranks.get(lookup.profileId) ? <RankBadge rank={ranks.get(lookup.profileId)!} size={36} labelled={false} /> : <span className="h-9 w-9 rounded-full bg-paper-deep" />}
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{lookup.state === "self" ? "That's you" : lookup.name}</span>
              <span className="block text-xs text-ink-faint">
                @{lookup.username}
                {lookup.sharedGroups > 0 && ` · ${lookup.sharedGroups} group${lookup.sharedGroups === 1 ? "" : "s"} in common`}
              </span>
            </span>
            {(lookup.state === "none" || lookup.state === "incoming") && (
              <form action={requestFriendByUsername}>
                <input type="hidden" name="username" value={lookup.username} />
                <button className={primaryBtn}>{lookup.state === "incoming" ? "Accept" : "Add"}</button>
              </form>
            )}
            {lookup.state === "requested" && <span className="text-sm text-ink-soft">Request sent</span>}
            {lookup.state === "friends" && (
              <Link href={href(`/student/messages/${lookup.profileId}`)} className={`${smallBtn} no-underline`}>
                Message
              </Link>
            )}
          </div>
        )}
      </section>

      {shareUrl && (
        <section className={`${tile} flex flex-wrap items-center gap-3 bg-[var(--tiles-sand)]`}>
          <p className="min-w-0 flex-1 text-sm">
            <span className="block font-medium">You&apos;re @{myUsername}</span>
            <span className="text-ink-soft">Share your link so friends can add you.</span>
          </p>
          <CopyButton text={shareUrl} label="Copy link" />
        </section>
      )}

      {(incoming.length > 0 || outgoing.length > 0) && (
        <section className={`${card} flex flex-col gap-2`} aria-labelledby="requests-heading">
          <h2 id="requests-heading" className="font-medium">
            Requests
          </h2>
          <ul className="flex flex-col divide-y divide-rule">
            {incoming.map((id) => (
              <li key={id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <span className="font-medium">{names.get(id)}</span>
                  <span className="block text-xs text-ink-faint">{handle.get(id) ? `@${handle.get(id)} · ` : ""}wants to be friends</span>
                </span>
                <span className="flex gap-2">
                  <form action={respondFriend.bind(null, id, true)}>
                    <button className="inline-flex h-8 items-center justify-center rounded-full bg-ink px-3 text-xs font-medium text-paper hover:opacity-90">Accept</button>
                  </form>
                  <form action={endFriendship.bind(null, id)}>
                    <button className={smallBtn}>Decline</button>
                  </form>
                </span>
              </li>
            ))}
            {outgoing.map((id) => (
              <li key={id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <span className="font-medium">{names.get(id)}</span>
                  <span className="block text-xs text-ink-faint">{handle.get(id) ? `@${handle.get(id)} · ` : ""}request sent</span>
                </span>
                <form action={endFriendship.bind(null, id)}>
                  <button className={smallBtn}>Cancel</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`${card} flex flex-col gap-2`} aria-labelledby="messages-heading">
        <h2 id="messages-heading" className="font-medium">
          Messages
        </h2>
        {threads.length === 0 ? (
          <p className="text-sm text-ink-soft">When a friend accepts, you can message them and invite them to your groups.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-rule">
            {threads.map((t) => (
              <li key={t.friendId}>
                <Link href={href(`/student/messages/${t.friendId}`)} className="flex items-center gap-3 py-2.5 text-ink no-underline">
                  {ranks.get(t.friendId) ? <RankBadge rank={ranks.get(t.friendId)!} size={32} labelled={false} /> : <span className="h-8 w-8 shrink-0 rounded-full bg-paper-deep" />}
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${t.unread ? "font-semibold" : "font-medium"}`}>{names.get(t.friendId)}</span>
                    <span className="block truncate text-xs text-ink-faint">
                      {t.last ? (t.last.kind === "invite" ? (t.last.mine ? "You sent a group invite" : "Sent you a group invite") : `${t.last.mine ? "You: " : ""}${t.last.body}`) : handle.get(t.friendId) ? `@${handle.get(t.friendId)} · Say hi` : "Say hi"}
                    </span>
                  </span>
                  {t.unread ? (
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand" role="img" aria-label="Unread" />
                  ) : (
                    t.last && <span className="shrink-0 text-xs text-ink-faint">{formatInZone(t.last.at, "d MMM", MELBOURNE)}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${tile} flex flex-col gap-3 bg-brand-soft`}>
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Friends board · {week ? "this week" : "today"}</h2>
          <a href={week ? "?" : "?view=week"} className="text-xs">
            {week ? "Show today" : "Show week"}
          </a>
        </div>
        {!iOptIn ? (
          <p className="text-sm text-ink-soft">You&apos;ve hidden yourself from the Friends board, so it&apos;s hidden for you too.</p>
        ) : accepted.length === 0 ? (
          <p className="text-sm text-ink-soft">Add friends to compete on study time. Only accepted friends see each other here.</p>
        ) : (
          <ol className="flex flex-col gap-1 text-sm">
            {standings.map((s) => (
              <li key={s.profileId} className="flex justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-6 font-mono text-ink-faint">{s.rank}</span>
                  {ranks.get(s.profileId) && <RankBadge rank={ranks.get(s.profileId)!} size={20} />}
                  {s.profileId === me.profile.id ? "You" : names.get(s.profileId)}
                </span>
                <span className="font-mono">{shortMinutes(Math.floor(s.seconds / 60))}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-xs text-ink-faint">Verified study minutes across all groups, Melbourne time{week ? ", Monday to Sunday" : ""}.</p>
        <form action={setFriendsBoard} className="flex items-center gap-2 text-sm">
          <label className="flex gap-2">
            <input type="checkbox" name="friends_board_opt_in" defaultChecked={iOptIn} /> Show me on the Friends board
          </label>
          <button className={smallBtn}>Save</button>
        </form>
      </section>
    </StudentShell>
  );
}
