import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { whenLabel } from "@/lib/social/activity";
import { myActivity } from "@/lib/social/activity-server";
import { consistencyFor } from "@/lib/social/consistency-server";
import { myRank } from "@/lib/social/rank-sync";
import { nextRank, rankByTier } from "@/lib/social/ranks";
import { groupMembers, liveSessionFor, requireSocialStudent, todayProgress, type Group } from "@/lib/social/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TUTOR_LINK_COOKIE, linkedTutors } from "@/lib/tutor/links";
import { GroupCard } from "../_social/group-card";
import { RankBadge } from "../_social/rank-badge";
import { Loading, StudentShell, card } from "../_social/shell";
import { startSolo } from "../_social/solo-actions";
import { StreakCard } from "../_social/streak-card";

export const metadata: Metadata = { title: "Home" };

/**
 * Home (docs/ui-refresh-and-timer.md): one obvious next action, then the student's own week, their
 * groups' shared goals and today's tasks. Analytics and rankings live further in.
 */
export default function HomePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Home />
    </Suspense>
  );
}

type Task = { key: string; tag: string; body: string; href?: string; source?: "tutor" | "tomorrow"; testId?: string };

async function Home() {
  const [me, locale, jar] = await Promise.all([requireSocialStudent(), getLocale(), cookies()]);
  const href = (p: string) => localizePath(p, locale);
  const admin = createAdminClient();
  const [c, live, tutors, { data: open }, { data: rows }, { count: invites }, recent, mine] = await Promise.all([
    consistencyFor(me.profile.id),
    liveSessionFor(me.profile.id),
    linkedTutors(me.profile.id),
    admin.from("solo_tasks").select("body").eq("profile_id", me.profile.id).eq("status", "open").maybeSingle(),
    admin
      .from("study_group_members")
      .select("study_groups!inner(id, name, timezone, daily_target_minutes, next_target_minutes, archived_at)")
      .eq("profile_id", me.profile.id)
      .is("study_groups.archived_at", null)
      .returns<{ study_groups: Group }[]>(),
    admin.from("group_friend_invites").select("id", { count: "exact", head: true }).eq("invitee_id", me.profile.id).eq("state", "pending"),
    myActivity(me.profile.id),
    myRank(me.profile.id),
  ]);
  const rank = rankByTier(mine.tier);
  const nextUp = nextRank(rank);
  const xp = nextUp ? Math.max(0, Math.min(100, Math.round(((mine.points - rank.min) / (nextUp.min - rank.min)) * 100))) : 100;
  const groups = (rows ?? []).map((r) => r.study_groups).slice(0, 2);
  const [progress, rosters] = await Promise.all([Promise.all(groups.map((g) => todayProgress(g))), Promise.all(groups.map((g) => groupMembers(g.id)))]);

  // Today's tasks: an open solo task, each tutor's next step, and yesterday's "tomorrow" line.
  const tasks: Task[] = [
    ...(open ? [{ key: "solo", tag: "Solo", body: open.body as string, href: "/student/solo" }] : []),
    ...tutors
      .filter((t) => t.task && t.task.status !== "done")
      .map((t) => ({ key: `tutor-${t.recordId}`, tag: t.tutorName.split(" ")[0], body: t.task!.body, source: "tutor" as const, href: "/student/tutor", testId: "tutor-task-preview" })),
    ...(c.tomorrow ? [{ key: "tomorrow", tag: "Tomorrow", body: c.tomorrow, source: "tomorrow" as const, testId: "tomorrow" }] : []),
  ];
  const next = live ? null : tasks[0];
  // While a solo session runs, its task is the headline rather than a list item.
  const liveTask = live && !live.group_id && open ? (open.body as string) : null;
  const rest = tasks.filter((t) => t !== next && !(liveTask && t.key === "solo"));
  const liveHref = live?.group_id ? `/student/groups/${live.group_id}` : "/student/solo";
  const nudge = jar.has(TUTOR_LINK_COOKIE) ? { text: "Your tutor invited you to link your account.", to: "/student/tutor" } : invites ? { text: `You have ${invites === 1 ? "an invite" : `${invites} invites`} to a study group.`, to: "/student/groups" } : null;

  return (
    <StudentShell me={me} title={`Hi ${me.student.first_name}`} current="home">
      {nudge && (
        <Link href={href(nudge.to)} className={`${card} flex items-center justify-between gap-3 border-ink py-3 no-underline`}>
          <span className="text-sm">{nudge.text}</span>
          <span className="text-sm font-medium">Review →</span>
        </Link>
      )}

      <section aria-label="Continue studying" className="flex flex-col gap-1 rounded-2xl bg-ink p-5 text-paper" data-testid="continue">
        <p className="font-mono text-xs tracking-wide text-paper/70 uppercase">{live ? "You're studying" : next ? "Continue studying" : "Ready when you are"}</p>
        <h2 className="text-lg font-semibold" data-testid={next?.testId}>{live ? (liveTask ?? (live.group_id ? "Your group session is on" : "Your solo session is on")) : next ? next.body : "Pick one thing and start a timer"}</h2>
        {next && <p className="text-sm text-paper/70">{next.source === "tutor" ? `From ${next.tag}` : next.tag === "Tomorrow" ? "You set this last time" : "Your solo task"}</p>}
        {live ? (
          <Link href={href(liveHref)} className="mt-3 inline-flex h-12 items-center justify-center rounded-full bg-[var(--tiles-sage-strong)] px-5 font-semibold text-paper no-underline">
            Open the timer
          </Link>
        ) : next?.source ? (
          <form action={startSolo} className="mt-3">
            <input type="hidden" name="source" value={next.source} />
            <input type="hidden" name="body" value={next.body} />
            <button className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--tiles-sage-strong)] px-5 font-semibold text-paper">Start studying</button>
          </form>
        ) : (
          <Link
            href={href("/student/solo")}
            className="mt-3 inline-flex h-12 items-center justify-center rounded-full bg-[var(--tiles-sage-strong)] px-5 font-semibold text-paper no-underline"
            data-testid="study-solo"
          >
            {next ? "Open the timer" : "Start studying"}
          </Link>
        )}
      </section>

      <Link href={href("/student/ranks")} className={`${card} flex items-center gap-4 py-4 text-ink no-underline hover:border-ink`} data-testid="rank-xp" aria-label={`Your rank: ${rank.name}. See your progression`}>
        <RankBadge rank={rank} size={52} labelled={false} className="shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate font-semibold">{rank.name}</span>
            <span className="shrink-0 font-mono text-xs text-ink-soft">
              {mine.points.toLocaleString("en-AU")}
              {nextUp ? ` / ${nextUp.min.toLocaleString("en-AU")}` : ""} XP
            </span>
          </span>
          <span className="block h-2.5 overflow-hidden rounded-full bg-paper-deep" role="progressbar" aria-valuenow={xp} aria-valuemin={0} aria-valuemax={100} aria-label={nextUp ? `Progress to ${nextUp.name}` : "Top rank reached"}>
            <span className="block h-full rounded-full bg-[var(--tiles-sage-strong)] transition-[width] duration-700" style={{ width: `${xp}%` }} />
          </span>
          <span className="text-xs text-ink-soft">{nextUp ? `${(nextUp.min - mine.points).toLocaleString("en-AU")} XP to ${nextUp.name} · See your progression →` : "The top rank · See your progression →"}</span>
        </span>
      </Link>

      <StreakCard c={c} goalHref={href("/student/me#goal")} />

      <section aria-label="Your groups" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Your groups</h2>
          <Link href={href("/student/groups")} className="-my-2 inline-flex min-h-11 items-center px-2 text-sm text-ink-soft">
            {groups.length ? "All groups →" : "Make or join one →"}
          </Link>
        </div>
        {groups.length === 0 ? (
          <p className="text-sm text-ink-soft">Study with friends: share a daily goal and every minute anyone studies counts towards it.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {groups.map((g, i) => (
              <li key={g.id}>
                <GroupCard group={g} progress={progress[i]} members={rosters[i]} meId={me.profile.id} href={href(`/student/groups/${g.id}`)} index={i} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {rest.length > 0 && (
        <section aria-label="Today's tasks" className={`${card} flex flex-col`}>
          <h2 className="mb-1 font-semibold">Today&apos;s tasks</h2>
          <ul className="flex flex-col">
            {rest.map((t) => (
              <li key={t.key} className="border-t border-rule first:border-t-0" data-testid={t.testId}>
                {t.href ? (
                  <Link href={href(t.href)} className="flex min-h-11 items-center gap-3 py-2 text-sm text-ink no-underline">
                    <TaskLine t={t} />
                  </Link>
                ) : (
                  <form action={startSolo}>
                    <input type="hidden" name="source" value={t.source} />
                    <input type="hidden" name="body" value={t.body} />
                    <button className="flex min-h-11 w-full items-center gap-3 py-2 text-left text-sm">
                      <TaskLine t={t} />
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {recent.length > 0 && (
        <section aria-label="Recent activity" className={`${card} flex flex-col`} data-testid="my-activity">
          <h2 className="mb-1 font-semibold">Recent activity</h2>
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
    </StudentShell>
  );
}

function TaskLine({ t }: { t: Task }) {
  return (
    <>
      <span aria-hidden className="size-5 shrink-0 rounded-md border-[1.5px] border-ink-faint" />
      <span className="flex-1">{t.body}</span>
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t.source === "tutor" ? "bg-[var(--tiles-sage-soft)] text-[var(--tiles-sage-ink)]" : "bg-[var(--tiles-sand)] text-[var(--tiles-sand-ink)]"}`}>{t.tag}</span>
    </>
  );
}
