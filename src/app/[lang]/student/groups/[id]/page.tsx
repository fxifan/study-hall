import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { dayWindow, rank, shortMinutes, weekWindow } from "@/lib/social/credit";
import { siteOrigin } from "@/lib/site";
import {
  groupMembers,
  groupSeconds,
  isMember,
  liveSessionFor,
  postRecapIfDue,
  requireMember,
  requireSocialStudent,
  sessionSeconds,
  sweepStale,
  todayProgress,
} from "@/lib/social/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatInZone } from "@/lib/time";
import { askForHelp, claimSeat, leaveGroup, newInvite, proposeStudyHall, requestFriend, respondHelp, setTarget, updateMembership } from "../../_social/actions";
import { CopyButton } from "../../_social/copy-button";
import { GroupChat, type ChatMessage } from "../../_social/group-chat";
import { Loading, Notice, StudentShell, card, secondaryBtn, smallBtn } from "../../_social/shell";
import { StudyTimer } from "../../_social/study-timer";
import { LiveRefresh } from "@/components/live-refresh";

export const metadata: Metadata = { title: "Group" };

const ERRORS: Record<string, string> = {
  help_limit: "You already have three open call-outs here. Mark one sorted first.",
  booking: "Pick a Study Hall session at least an hour away and give it a topic.",
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

  const weekView = query.board === "week";
  const now = new Date();
  const [members, progress, live, { data: msgs }, { data: blocks }, { data: help }, { data: invites }, { data: bookings }, { data: upcoming }, { data: friendRows }] =
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
      admin.from("studyhall_bookings").select("id, topic, price_cents, session_id, sessions(starts_at, ends_at, rooms(name)), studyhall_seats(student_id, token, status)").eq("group_id", group.id).is("cancelled_at", null).order("created_at", { ascending: false }).limit(5),
      admin.from("sessions").select("id, starts_at, ends_at, rooms(name)").neq("status", "cancelled").gt("starts_at", new Date(now.getTime() + 3600_000).toISOString()).order("starts_at").limit(20),
      admin.from("friendships").select("a, b, status").or(`a.eq.${me.profile.id},b.eq.${me.profile.id}`),
    ]);
  const mine = members.find((m) => m.profile_id === me.profile.id)!;
  const names = Object.fromEntries(members.map((m) => [m.profile_id, m.name]));
  const messages = ((msgs ?? []) as ChatMessage[]).reverse();
  const friendOf = new Map((friendRows ?? []).map((f) => [f.a === me.profile.id ? (f.b as string) : (f.a as string), f.status as string]));

  // Board: today (default) or this week, only members who opted in. Running time is provisional.
  const window = weekView ? weekWindow(progress.day, group.timezone) : dayWindow(progress.day, group.timezone);
  const totals = weekView ? await groupSeconds(group.id, window.start, window.end) : progress.totals;
  const boardMembers = members.filter((m) => m.board_opt_in);
  const standings = rank(new Map(boardMembers.map((m) => [m.profile_id, totals.get(m.profile_id) ?? 0])));
  const { data: liveRows } = await admin.from("study_sessions").select("profile_id, state").eq("group_id", group.id).neq("state", "stopped");
  const liveBy = new Map((liveRows ?? []).map((r) => [r.profile_id as string, r.state as string]));
  const studyingNow = members.filter((m) => m.share_status && liveBy.get(m.profile_id) === "running");

  const initialTimer = live
    ? { sessionId: live.id, state: live.state, seconds: await sessionSeconds(live), groupId: live.group_id }
    : { sessionId: null, state: "stopped" as const, seconds: 0, groupId: null };
  const origin = await siteOrigin();
  const invite = invites?.[0];
  const inviteUrl = invite ? `${origin}${localizePath(`/join?code=${invite.code}`, locale)}` : null;
  const error = typeof query.error === "string" ? ERRORS[query.error] : null;
  const suspended = Boolean(me.student.chat_suspended_until && Date.parse(me.student.chat_suspended_until) > now.getTime());
  const pct = Math.min(100, Math.round((progress.doneMinutes / Math.max(1, progress.targetMinutes)) * 100));
  const when = (iso: string) => formatInZone(iso, "EEE d MMM, h:mmaaa", group.timezone);
  type Booking = { id: string; topic: string; price_cents: number; sessions: { starts_at: string; ends_at: string; rooms: { name: string } | null } | null; studyhall_seats: { student_id: string; token: string; status: string }[] };

  return (
    <StudentShell me={me} title={group.name} current="groups" back={{ href: "/student/groups", label: "All groups" }}>
      <LiveRefresh seconds={30} />
      {error && <Notice tone="error">{error}</Notice>}

      <section aria-label="Today's goal" className={`${card} flex flex-col gap-2`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">Today&apos;s goal</h2>
          <span className="font-mono text-sm">
            {shortMinutes(progress.doneMinutes)} of {shortMinutes(progress.targetMinutes)}
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-paper-deep" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Today's goal">
          <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-sm text-ink-soft">
          {progress.reached ? "Goal reached. Every extra minute still counts." : `${shortMinutes(progress.remainingMinutes)} to go together.`}
          {group.next_target_minutes ? ` Tomorrow's goal: ${shortMinutes(group.next_target_minutes)}.` : ""}
        </p>
        {studyingNow.length > 0 && (
          <p className="text-sm">
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-success" aria-hidden /> Studying now: {studyingNow.map((m) => (m.profile_id === me.profile.id ? "you" : m.name)).join(", ")}
          </p>
        )}
      </section>

      <StudyTimer initial={initialTimer} groupId={group.id} groupName={group.name} studyScreen />

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <GroupChat groupId={group.id} meId={me.profile.id} initial={messages} names={names} blocked={(blocks ?? []).map((b) => b.blocked_id as string)} canPost={!suspended} />

        <aside className="flex flex-col gap-4">
          <section aria-label="Leaderboard" className={`${card} flex flex-col gap-2`}>
            <div className="flex items-center justify-between">
              <h2 className="font-medium">{weekView ? "This week" : "Today"}</h2>
              <Link href={localizePath(`/student/groups/${group.id}${weekView ? "" : "?board=week"}`, locale)} className="text-xs">
                {weekView ? "Show today" : "Show week"}
              </Link>
            </div>
            {standings.length === 0 ? (
              <p className="text-sm text-ink-soft">Nobody has joined the board yet.</p>
            ) : (
              <ol className="flex flex-col gap-1 text-sm">
                {standings.map((s) => (
                  <li key={s.profileId} className="flex justify-between gap-2">
                    <span>
                      <span className="inline-block w-6 font-mono text-ink-faint">{s.rank}</span>
                      {s.profileId === me.profile.id ? "You" : names[s.profileId]}
                      {liveBy.get(s.profileId) === "running" && <span className="ml-1 text-xs text-ink-faint">(live)</span>}
                    </span>
                    <span className="font-mono">{shortMinutes(Math.floor(s.seconds / 60))}</span>
                  </li>
                ))}
              </ol>
            )}
            <p className="text-xs text-ink-faint">Live times are provisional until a session stops. Only this group&apos;s minutes count here.</p>
          </section>

          <section aria-label="Call out for help" className={`${card} flex flex-col gap-3`}>
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

          <section aria-label="Study Hall" className={`${card} flex flex-col gap-3`}>
            <h2 className="font-medium">Book a Study Hall</h2>
            <p className="text-xs text-ink-soft">A supervised session with a tutor on hand, for the whole group. A$40 per student; each parent books their own child&apos;s seat.</p>
            {((bookings ?? []) as unknown as Booking[]).map((b) => {
              const seat = b.studyhall_seats.find((s) => s.student_id === me.student.id);
              const paid = b.studyhall_seats.filter((s) => s.status === "paid").length;
              const link = seat ? `${origin}${localizePath(`/book/${seat.token}`, locale)}` : null;
              return (
                <div key={b.id} className="flex flex-col gap-2 rounded-md border border-rule p-2 text-sm">
                  <p>
                    <strong>{b.topic}</strong>
                    {b.sessions && <span className="block text-xs text-ink-soft">{when(b.sessions.starts_at)}</span>}
                    <span className="block text-xs text-ink-faint">{paid} seat{paid === 1 ? "" : "s"} booked</span>
                  </p>
                  {seat?.status === "paid" ? (
                    <p className="text-xs font-medium">Your seat is booked.</p>
                  ) : link ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <CopyButton text={link} label="Copy parent link" />
                    </div>
                  ) : (
                    <form action={claimSeat.bind(null, b.id)}>
                      <button className={smallBtn}>Get my parent link</button>
                    </form>
                  )}
                </div>
              );
            })}
            {(upcoming ?? []).length > 0 ? (
              <form action={proposeStudyHall.bind(null, group.id)} className="flex flex-col gap-2 text-sm">
                <select name="session" required className="h-9 rounded-md border border-rule bg-paper px-2" aria-label="Session time">
                  {(upcoming as unknown as { id: string; starts_at: string; rooms: { name: string } | null }[]).map((s) => (
                    <option key={s.id} value={s.id}>
                      {when(s.starts_at)}
                      {s.rooms ? ` · ${s.rooms.name}` : ""}
                    </option>
                  ))}
                </select>
                <input name="topic" required minLength={2} maxLength={120} placeholder="Topic, e.g. Methods SAC revision" className="h-9 rounded-md border border-rule bg-paper px-2" />
                <button className={secondaryBtn}>Propose to the group</button>
              </form>
            ) : (
              <p className="text-xs text-ink-faint">No Study Hall sessions open for booking right now.</p>
            )}
          </section>

          <section aria-label="Invite" className={`${card} flex flex-col gap-2 text-sm`}>
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
              <label className="flex gap-2">
                <input type="checkbox" name="share_status" defaultChecked={mine.share_status} /> Show the group when I&apos;m studying
              </label>
              <label className="flex gap-2">
                <input type="checkbox" name="board_opt_in" defaultChecked={mine.board_opt_in} /> Show me on this group&apos;s board
              </label>
              <label className="flex gap-2">
                <input type="checkbox" name="spotlight_opt_in" defaultChecked={mine.spotlight_opt_in} /> I can be the daily standout
              </label>
              <label className="flex gap-2">
                <input type="checkbox" name="muted" defaultChecked={mine.muted} /> Mute notifications from this group
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
