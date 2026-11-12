import type { Metadata } from "next";
import { consistencyFor } from "@/lib/social/consistency-server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { rank, shortMinutes, weekWindow } from "@/lib/social/credit";
import { whenLabel } from "@/lib/social/activity";
import { groupActivity } from "@/lib/social/activity-server";
import { siteOrigin } from "@/lib/site";
import {
  groupMembers,
  groupSeconds,
  isMember,
  liveSessionFor,
  needsCheck,
  postRecapIfDue,
  requireMember,
  requireSocialStudent,
  sessionSeconds,
  sweepStale,
  todayProgress,
} from "@/lib/social/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { askForHelp, leaveGroup, newInvite, requestFriend, respondHelp, setTarget, updateMembership } from "../../_social/actions";
import { CopyButton } from "../../_social/copy-button";
import { GroupChat, type ChatMessage } from "../../_social/group-chat";
import { Loading, Notice, StudentShell, card, tile, secondaryBtn, smallBtn } from "../../_social/shell";
import { StudyTimer } from "../../_social/study-timer";
import { RankBadge } from "../../_social/rank-badge";
import { latestGroupRankUp, rankStatus, visibleRanks } from "@/lib/social/rank-sync";
import type { Rank } from "@/lib/social/ranks";
import { LiveRefresh } from "@/components/live-refresh";

export const metadata: Metadata = { title: "Group" };

const ERRORS: Record<string, string> = {
  help_limit: "You already have three open call-outs here. Mark one sorted first.",
};

export default function GroupPage({ params, searchParams }: PageProps<"/[lang]/student/groups/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <GroupView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function GroupView({ params, searchParams }: Pick<PageProps<"/[lang]/student/groups/[id]">, "params" | "searchParams">) {
  const [me, locale, { id }, query] = await Promise.all([requireSocialStudent(), getLocale(), params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !(await isMember(id, me.profile.id))) notFound();
  const group = await requireMember(id, me.profile.id);
  const admin = createAdminClient();
  await sweepStale({ groupId: group.id });
  await postRecapIfDue(group);

  // Two tabs: Overview (goal, timer, chat) and Ranking (Today / This week / All time).
  const tab = query.tab === "ranking" ? "ranking" : "overview";
  const period = tab === "overview" ? "day" : query.period === "day" || query.period === "all" ? query.period : "week";
  const now = new Date();
  const [members, progress, live, { data: msgs }, { data: blocks }, { data: help }, { data: invites }, { data: friendRows }] =
    await Promise.all([
      groupMembers(group.id),
      todayProgress(group),
      liveSessionFor(me.profile.id),
      admin.from("group_messages").select("id, sender_id, kind, body, created_at").eq("group_id", group.id).is("hidden_at", null).order("created_at", { ascending: false }).limit(60),
      admin.from("user_blocks").select("blocked_id").eq("blocker_id", me.profile.id),
      admin
        .from("group_help_requests")
        .select("id, requester_id, target_id, kind, body, state, accepted_by, created_at")
        .eq("group_id", group.id)
        .in("state", ["open", "accepted"])
        .order("created_at", { ascending: false }),
      admin.from("study_group_invites").select("code, expires_at, uses, max_uses").eq("group_id", group.id).is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1),
      admin.from("friendships").select("a, b, status").or(`a.eq.${me.profile.id},b.eq.${me.profile.id}`),
    ]);
  const mine = members.find((m) => m.profile_id === me.profile.id)!;
  const blockedIds = (blocks ?? []).map((b) => b.blocked_id as string);
  const [ranks, status, rankUp] = await Promise.all([
    visibleRanks(members.map((m) => m.profile_id), me.profile.id),
    rankStatus(me.profile.id),
    latestGroupRankUp(members.map((m) => m.profile_id), me.profile.id, blockedIds),
  ]);
  const view = (r: Rank) => ({ id: r.id, name: r.name, color: r.color });
  // The chat's practice prompt (strip) and, when another member just ranked up past or level with
  // this student, a nudge in the conversation. Points stay private to the student.
  const prompt = {
    rank: view(status.rank),
    next: status.next ? view(status.next) : null,
    toNext: status.toNext,
    fraction: status.fraction,
    todayLeft: status.todayLeft,
    href: localizePath(`/student/practice?group=${group.id}`, locale),
  };
  const nudge =
    rankUp && status.next && status.todayLeft > 0 && rankUp.to.tier >= status.rank.tier
      ? { id: rankUp.id, name: members.find((m) => m.profile_id === rankUp.profileId)?.name ?? "A friend", to: view(rankUp.to), at: rankUp.at }
      : null;
  const rankView = Object.fromEntries([...ranks].map(([id, r]) => [id, { id: r.id, name: r.name, color: r.color }]));
  const names = Object.fromEntries(members.map((m) => [m.profile_id, m.name]));
  const messages = ((msgs ?? []) as ChatMessage[]).reverse();
  const friendOf = new Map((friendRows ?? []).map((f) => [f.a === me.profile.id ? (f.b as string) : (f.a as string), f.status as string]));

  // Board: only members who opted in. Running time is provisional.
  const totals =
    period === "day"
      ? progress.totals
      : period === "week"
        ? await (async () => {
            const w = weekWindow(progress.day, group.timezone);
            return groupSeconds(group.id, w.start, w.end);
          })()
        : await (async () => {
            const { data: g } = await admin.from("study_groups").select("created_at").eq("id", group.id).single();
            return groupSeconds(group.id, new Date(g!.created_at as string), new Date(now.getTime() + 60_000));
          })();
  const boardMembers = members.filter((m) => m.board_opt_in);
  const standings = rank(new Map(boardMembers.map((m) => [m.profile_id, totals.get(m.profile_id) ?? 0])));
  const groupTotal = [...totals.values()].reduce((a, b) => a + b, 0);
  const myTotal = totals.get(me.profile.id) ?? 0;
  const recent = tab === "overview" ? await groupActivity(group.id, members, me.profile.id) : [];
  const { data: liveRows } = await admin.from("study_sessions").select("profile_id, state, last_beat_at").eq("group_id", group.id).neq("state", "stopped");
  // "Studying now" means a running timer that isn't waiting on a welcome-back answer.
  const liveBy = new Map((liveRows ?? []).map((r) => [r.profile_id as string, needsCheck(r as { state: string; last_beat_at: string }) ? "away" : (r.state as string)]));
  const studyingNow = members.filter((m) => m.share_status && liveBy.get(m.profile_id) === "running");
  // Quiet days: lead with the student's own goal rather than an empty board.
  const quiet = studyingNow.length === 0 ? await consistencyFor(me.profile.id) : null;

  const initialTimer = live
    ? { sessionId: live.id, state: live.state, seconds: await sessionSeconds(live), groupId: live.group_id, startedAt: live.started_at }
    : { sessionId: null, state: "stopped" as const, seconds: 0, groupId: null };
  const origin = await siteOrigin();
  const invite = invites?.[0];
  const inviteUrl = invite ? `${origin}${localizePath(`/join?code=${invite.code}`, locale)}` : null;
  const error = typeof query.error === "string" ? ERRORS[query.error] : null;
  const suspended = Boolean(me.student.chat_suspended_until && Date.parse(me.student.chat_suspended_until) > now.getTime());
  const pct = Math.min(100, Math.round((progress.doneMinutes / Math.max(1, progress.targetMinutes)) * 100));
  const board = {
    list: (rows: typeof standings) =>
      rows.length === 0 ? (
        <p className="text-sm text-ink-soft">Nobody has joined the board yet.</p>
      ) : (
        <ol className="flex flex-col gap-1 text-sm" data-testid="ranking">
          {rows.map((s) => {
            const mine = s.profileId === me.profile.id;
            const width = Math.round((s.seconds / Math.max(1, standings[0].seconds)) * 100);
            return (
              <li key={s.profileId} className={`grid grid-cols-[1.75rem_1fr_auto] items-center gap-2 rounded-xl px-2 py-1.5 ${mine ? "bg-brand-soft font-medium" : ""}`}>
                <span className="font-mono text-ink-faint">{s.rank}</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    {ranks.get(s.profileId) && <RankBadge rank={ranks.get(s.profileId)!} size={20} />}
                    <span className="truncate">{mine ? "You" : names[s.profileId]}</span>
                    {liveBy.get(s.profileId) === "running" && <span className="size-2 animate-pulse rounded-full bg-[var(--tiles-sage-strong)]" role="img" aria-label="(live)" />}
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-paper-deep">
                    <span className="block h-full rounded-full bg-[var(--tiles-sage-strong)]" style={{ width: `${s.seconds ? Math.max(4, width) : 0}%` }} />
                  </span>
                </span>
                <span className="font-mono">{s.seconds >= 60 ? shortMinutes(Math.floor(s.seconds / 60)) : "Not yet"}</span>
              </li>
            );
          })}
        </ol>
      ),
  };
  const tabs = (
    <nav aria-label="Group sections" className="flex w-fit rounded-full border border-rule bg-sheet p-1 text-sm">
      {(
        [
          ["overview", "Overview", `/student/groups/${group.id}`],
          ["ranking", "Ranking", `/student/groups/${group.id}?tab=ranking`],
        ] as const
      ).map(([key, label, to]) => (
        <Link
          key={key}
          href={localizePath(to, locale)}
          aria-current={tab === key ? "page" : undefined}
          className={`inline-flex min-h-9 items-center rounded-full px-4 font-medium no-underline ${tab === key ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );

  if (tab === "ranking") {
    const hours = (sec: number) => (sec >= 3600 ? `${(sec / 3600).toFixed(1)} h` : `${Math.floor(sec / 60)} min`);
    return (
      <StudentShell me={me} title={group.name} current="groups" back={{ href: "/student/groups", label: "All groups" }}>
        <LiveRefresh seconds={30} />
        {tabs}
        <nav aria-label="Period" className="flex w-full max-w-md rounded-full bg-paper-deep p-1 text-sm">
          {(
            [
              ["day", "Today"],
              ["week", "This week"],
              ["all", "All time"],
            ] as const
          ).map(([key, label]) => (
            <Link
              key={key}
              href={localizePath(`/student/groups/${group.id}?tab=ranking&period=${key}`, locale)}
              aria-current={period === key ? "page" : undefined}
              className={`inline-flex min-h-9 flex-1 items-center justify-center rounded-full px-3 font-medium no-underline ${period === key ? "bg-sheet text-ink shadow-sm" : "text-ink-soft"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <section aria-label="Totals" className={`${card} flex justify-between gap-4`}>
          <div>
            <p className="font-mono text-xs tracking-wide text-ink-faint uppercase">Group</p>
            <p className="font-mono text-2xl font-semibold" data-testid="group-total">
              {hours(groupTotal)}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-xs tracking-wide text-ink-faint uppercase">You</p>
            <p className="font-mono text-2xl font-semibold text-[var(--tiles-sage-ink)]" data-testid="my-total">
              {hours(myTotal)}
            </p>
          </div>
        </section>
        <section aria-label="Ranking" className={`${card} flex flex-col gap-3`}>
          {board.list(standings)}
          <p className="text-xs text-ink-faint">
            Your time adds to the group&apos;s total, wherever you rank. Live times are provisional until a session stops. Only this group&apos;s minutes count here.
          </p>
        </section>
      </StudentShell>
    );
  }

  return (
    <StudentShell me={me} title={group.name} current="groups" back={{ href: "/student/groups", label: "All groups" }}>
      <LiveRefresh seconds={30} />
      {tabs}
      {error && <Notice tone="error">{error}</Notice>}

      <section aria-label="Today's goal" className={`${card} flex flex-col gap-2`}>
        <p className="font-mono text-xs tracking-wide text-ink-faint uppercase">Today&apos;s goal</p>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono text-3xl font-semibold tabular-nums">{shortMinutes(progress.doneMinutes)}</span>
          <span className="text-sm text-ink-soft">of {shortMinutes(progress.targetMinutes)} together</span>
        </p>
        <div className="h-2.5 overflow-hidden rounded-full bg-paper-deep" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Today's goal">
          <div className="h-full rounded-full bg-[var(--tiles-sage-strong)] transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-sm text-ink-soft">
          {progress.reached ? "Goal reached. Every extra minute still counts." : `${shortMinutes(progress.remainingMinutes)} to go. Everyone's time counts towards it.`}
          {group.next_target_minutes ? ` Tomorrow's goal: ${shortMinutes(group.next_target_minutes)}.` : ""}
        </p>
        {studyingNow.length === 0 && quiet && !quiet.todayCounted && (
          <p className="text-sm" data-testid="quiet-day">
            Quiet so far. You&apos;re {Math.max(0, quiet.goalMinutes - quiet.todayMinutes)} min from your own goal today
            {quiet.streak ? `, and on a ${quiet.streak}-day streak` : ""}.
          </p>
        )}
      </section>

      {studyingNow.length > 0 && (
        <p className={`${tile} flex items-center gap-2 bg-brand-soft py-3 text-sm font-medium text-[var(--tiles-sage-ink)]`} data-testid="studying-now">
          <span className="inline-block size-2 animate-pulse rounded-full bg-[var(--tiles-sage-strong)]" aria-hidden />
          Studying now: {studyingNow.map((m) => (m.profile_id === me.profile.id ? "you" : m.name)).join(", ")}
        </p>
      )}

      <StudyTimer initial={initialTimer} groupId={group.id} groupName={group.name} />

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <section aria-label="Who's helped today" className={`${card} flex flex-col gap-3`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Who&apos;s helped today</h2>
              <Link href={localizePath(`/student/groups/${group.id}?tab=ranking`, locale)} className="-my-2 inline-flex min-h-11 items-center px-2 text-sm text-ink-soft">
                Full ranking →
              </Link>
            </div>
            {board.list(standings.slice(0, 5))}
          </section>
          {recent.length > 0 && (
            <section aria-label="Recent" className={`${card} flex flex-col gap-1`} data-testid="group-activity">
              <h2 className="mb-1 font-semibold">Recent</h2>
              <ul className="flex flex-col text-sm">
                {recent.map((r, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 border-t border-rule py-2 first:border-t-0">
                    <span>
                      {r.kind === "milestone" && <span aria-hidden>★ </span>}
                      {r.text}
                    </span>
                    <span className="shrink-0 text-xs text-ink-faint">{whenLabel(r.at)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <GroupChat groupId={group.id} meId={me.profile.id} initial={messages} names={names} ranks={rankView} blocked={blockedIds} canPost={!suspended} prompt={prompt} nudge={nudge} />
        </div>

        <aside className="flex flex-col gap-4">
          <section aria-label="Call out for help" className={`${tile} flex flex-col gap-3 bg-[var(--tiles-pink-soft)]`}>
            <h2 className="font-medium">Call out for help</h2>
            {(help ?? []).map((h) => {
              const isMine = h.requester_id === me.profile.id;
              const forMe = !h.target_id || h.target_id === me.profile.id;
              return (
                <div key={h.id} className="flex flex-col gap-2 rounded-md border border-rule p-2 text-sm">
                  <p>
                    <strong>{isMine ? "You" : names[h.requester_id]}</strong> {h.kind === "question" ? "asked a question" : h.kind === "buddy" ? "want a study buddy" : "asked for a check-in"}
                    {h.target_id ? ` (to ${h.target_id === me.profile.id ? "you" : names[h.target_id]})` : ""}
                    {h.body ? `: ${h.body}` : ""}
                  </p>
                  <p className="text-xs text-ink-faint">{h.state === "accepted" ? `Accepted by ${h.accepted_by === me.profile.id ? "you" : names[h.accepted_by] ?? "a member"}` : "Open"}</p>
                  <div className="flex flex-wrap gap-2">
                    {!isMine && h.state === "open" && forMe && (
                      <form action={respondHelp.bind(null, h.id, "accept")}>
                        <button className={smallBtn}>I can help</button>
                      </form>
                    )}
                    {!isMine && h.state === "open" && h.target_id === me.profile.id && (
                      <form action={respondHelp.bind(null, h.id, "decline")}>
                        <button className={smallBtn}>Not now</button>
                      </form>
                    )}
                    {isMine && (
                      <>
                        <form action={respondHelp.bind(null, h.id, "resolve")}>
                          <button className={smallBtn}>Sorted</button>
                        </form>
                        <form action={respondHelp.bind(null, h.id, "close")}>
                          <button className={smallBtn}>Cancel</button>
                        </form>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            <form action={askForHelp.bind(null, group.id)} className="flex flex-col gap-2 text-sm">
              <select name="kind" className="h-9 rounded-md border border-rule bg-paper px-2" aria-label="What do you need?">
                <option value="question">I have a question</option>
                <option value="buddy">I want a study buddy</option>
                <option value="checkin">A quick check-in</option>
              </select>
              <select name="target" className="h-9 rounded-md border border-rule bg-paper px-2" aria-label="Who to ask">
                <option value="">Ask the whole group</option>
                {members
                  .filter((m) => m.profile_id !== me.profile.id)
                  .map((m) => (
                    <option key={m.profile_id} value={m.profile_id}>
                      Ask {m.name}
                    </option>
                  ))}
              </select>
              <input name="body" maxLength={300} placeholder="What are you stuck on? (optional)" className="h-9 rounded-md border border-rule bg-paper px-2" />
              <button className={secondaryBtn}>Call out</button>
            </form>
          </section>

          <section aria-label="Invite" className={`${tile} flex flex-col gap-2 bg-[var(--tiles-sand)] text-sm`}>
            <h2 className="font-medium">Invite friends</h2>
            {invite && inviteUrl ? (
              <>
                <p>
                  Code <span className="font-mono">{invite.code}</span> · {invite.max_uses - invite.uses} uses left
                </p>
                <CopyButton text={inviteUrl} label="Copy invite link" />
              </>
            ) : (
              <form action={newInvite.bind(null, group.id)}>
                <button className={smallBtn}>Make an invite code</button>
              </form>
            )}
          </section>

          <section aria-label="Members" className={`${card} flex flex-col gap-2 text-sm`}>
            <h2 className="font-medium">Members</h2>
            <ul className="flex flex-col gap-1">
              {members.map((m) => (
                <li key={m.profile_id} className="flex items-center justify-between gap-2">
                  <span>
                    {m.profile_id === me.profile.id ? "You" : m.name}
                    {m.role === "owner" && <span className="ml-1 text-xs text-ink-faint">owner</span>}
                  </span>
                  {m.profile_id !== me.profile.id &&
                    (friendOf.get(m.profile_id) === "accepted" ? (
                      <span className="text-xs text-ink-faint">Friend</span>
                    ) : friendOf.get(m.profile_id) === "pending" ? (
                      <span className="text-xs text-ink-faint">Requested</span>
                    ) : (
                      <form action={requestFriend.bind(null, m.profile_id)}>
                        <button className={smallBtn}>Add friend</button>
                      </form>
                    ))}
                </li>
              ))}
            </ul>
          </section>

          <details className={`${card} text-sm`}>
            <summary className="cursor-pointer font-medium">Settings</summary>
            <form action={updateMembership.bind(null, group.id)} className="mt-3 flex flex-col gap-2">
              <label className="flex min-h-11 items-center gap-3 py-1">
                <input type="checkbox" className="size-5 shrink-0" name="share_status" defaultChecked={mine.share_status} /> Show the group when I&apos;m studying
              </label>
              <label className="flex min-h-11 items-center gap-3 py-1">
                <input type="checkbox" className="size-5 shrink-0" name="board_opt_in" defaultChecked={mine.board_opt_in} /> Show me on this group&apos;s board
              </label>
              <label className="flex min-h-11 items-center gap-3 py-1">
                <input type="checkbox" className="size-5 shrink-0" name="spotlight_opt_in" defaultChecked={mine.spotlight_opt_in} /> I can be the daily standout
              </label>
              <label className="flex min-h-11 items-center gap-3 py-1">
                <input type="checkbox" className="size-5 shrink-0" name="muted" defaultChecked={mine.muted} /> Mute notifications from this group
              </label>
              <button className={smallBtn}>Save</button>
            </form>
            <form action={setTarget.bind(null, group.id)} className="mt-4 flex items-end gap-2">
              <label className="flex flex-1 flex-col gap-1">
                Daily goal from tomorrow (hours)
                <input name="hours" type="number" min={0.25} max={24} step={0.25} defaultValue={(group.next_target_minutes ?? group.daily_target_minutes) / 60} className="h-9 rounded-md border border-rule bg-paper px-2" />
              </label>
              <button className={smallBtn}>Set</button>
            </form>
            <form action={leaveGroup.bind(null, group.id)} className="mt-4">
              <button className="text-sm text-pen">Leave group</button>
            </form>
          </details>
        </aside>
      </div>
    </StudentShell>
  );
}
