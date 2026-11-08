import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { rank, shortMinutes } from "@/lib/social/credit";
import { groupMembers, namesFor, requireSocialStudent, todayProgress, type Group } from "@/lib/social/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TUTOR_LINK_COOKIE, linkedTutors } from "@/lib/tutor/links";
import { createGroup, joinGroup } from "../_social/actions";
import { respondGroupInvite } from "../_social/friend-actions";
import { Loading, Notice, StudentShell, card, tile, primaryBtn, secondaryBtn, smallBtn } from "../_social/shell";

export const metadata: Metadata = { title: "Your groups" };

/** Group cards cycle through the Tiles colours: sage, pink, sand, slate. */
const TILE = ["bg-brand-soft", "bg-[var(--tiles-pink-soft)]", "bg-[var(--tiles-sand)]", "bg-[var(--tiles-slate-soft)]"];

const ERRORS: Record<string, string> = {
  code: "We couldn't find an open group with that code. Check it with your friend, or ask them for a new one.",
  full: "That group is full (12 members).",
  group: "Give the group a name and a daily goal between 15 minutes and 24 hours.",
};

export default function GroupsPage({ searchParams }: PageProps<"/[lang]/student/groups">) {
  return (
    <Suspense fallback={<Loading />}>
      <Groups searchParams={searchParams} />
    </Suspense>
  );
}

async function Groups({ searchParams }: Pick<PageProps<"/[lang]/student/groups">, "searchParams">) {
  const [me, locale, query, jar] = await Promise.all([requireSocialStudent(), getLocale(), searchParams, cookies()]);
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("study_group_members")
    .select("study_groups!inner(id, name, timezone, daily_target_minutes, next_target_minutes, archived_at)")
    .eq("profile_id", me.profile.id)
    .is("study_groups.archived_at", null)
    .returns<{ study_groups: Group }[]>();
  const groups = (rows ?? []).map((r) => r.study_groups);
  const [progress, rosters] = await Promise.all([Promise.all(groups.map((g) => todayProgress(g))), Promise.all(groups.map((g) => groupMembers(g.id)))]);
  const { data: friendInvites } = await admin
    .from("group_friend_invites")
    .select("id, inviter_id, study_groups(name)")
    .eq("invitee_id", me.profile.id)
    .eq("state", "pending")
    .order("created_at", { ascending: false });
  const inviterNames = await namesFor((friendInvites ?? []).map((i) => i.inviter_id as string));
  const pendingCode = (typeof query.code === "string" ? query.code : jar.get("edumi_invite")?.value) ?? "";
  const error = typeof query.error === "string" ? ERRORS[query.error] : null;
  const tutors = await linkedTutors(me.profile.id);
  const tutorTasks = tutors.filter((t) => t.task && t.task.status !== "done");

  return (
    <StudentShell me={me} title={`Hi ${me.student.first_name}`} current="groups">
      {error && <Notice tone="error">{error}</Notice>}
      {pendingCode && /^[A-Za-z0-9]{8,16}$/.test(pendingCode) && (
        <form action={joinGroup} className={`${card} flex flex-wrap items-center justify-between gap-3 border-ink`}>
          <input type="hidden" name="code" value={pendingCode} />
          <p className="text-sm">You have an invite to a study group.</p>
          <button className={primaryBtn}>Join the group</button>
        </form>
      )}

      {jar.has(TUTOR_LINK_COOKIE) && (
        <Link href={localizePath("/student/tutor", locale)} className={`${card} flex items-center justify-between gap-3 border-ink no-underline`}>
          <span className="text-sm">Your tutor invited you to link your account.</span>
          <span className="text-sm font-medium">Review →</span>
        </Link>
      )}
      {tutorTasks.map((t) => (
        <Link
          key={t.recordId}
          href={localizePath("/student/tutor", locale)}
          className={`${card} flex flex-col gap-1 border-2 border-[var(--tiles-sage)] no-underline`}
          data-testid="tutor-task-preview"
        >
          <span className="w-fit rounded-full bg-[var(--tiles-sage-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--tiles-sage-ink)]">From {t.tutorName}</span>
          <span className="font-medium text-ink">{t.task!.body}</span>
          <span className="text-sm text-ink-soft">Tell {t.tutorName.split(" ")[0]} how you went →</span>
        </Link>
      ))}

      {(friendInvites ?? []).map((i) => (
        <div key={i.id as string} className={`${tile} flex flex-wrap items-center justify-between gap-3 bg-[var(--tiles-sand)]`} data-testid="friend-invite">
          <p className="text-sm">
            <span className="font-medium">{inviterNames.get(i.inviter_id as string) ?? "A friend"}</span> invited you to{" "}
            <span className="font-medium">{(i.study_groups as unknown as { name: string } | null)?.name ?? "a group"}</span>
          </p>
          <span className="flex gap-2">
            <form action={respondGroupInvite.bind(null, i.id as string, true)}>
              <button className={primaryBtn}>Join</button>
            </form>
            <form action={respondGroupInvite.bind(null, i.id as string, false)}>
              <button className={smallBtn}>No thanks</button>
            </form>
          </span>
        </div>
      ))}

      {groups.length === 0 ? (
        <div className={`${card} flex flex-col gap-2`}>
          <h2 className="text-lg font-medium">Start with your friends</h2>
          <p className="text-sm text-ink-soft">
            Make a group, set a daily goal in combined minutes, and share the invite code. Every minute anyone studies on Edumi counts towards it.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {groups.map((g, i) => {
            const p = progress[i];
            const pct = Math.min(100, Math.round((p.doneMinutes / Math.max(1, p.targetMinutes)) * 100));
            // Today's race: only members on the board count; nobody is named as behind.
            const board = rosters[i].filter((m) => m.board_opt_in);
            const standings = rank(new Map(board.map((m) => [m.profile_id, p.totals.get(m.profile_id) ?? 0])));
            const leader = standings[0] && standings[0].seconds >= 60 ? board.find((m) => m.profile_id === standings[0].profileId) : undefined;
            const mine = standings.find((x) => x.profileId === me.profile.id);
            const race = !leader
              ? "Nobody's on the board yet today. Take the lead."
              : leader.profile_id === me.profile.id
                ? "You're leading today"
                : `${leader.name} leads${mine ? ` · you're #${mine.rank}` : ""}`;
            return (
              <li key={g.id}>
                <Link href={localizePath(`/student/groups/${g.id}`, locale)} className={`${tile} ${TILE[i % TILE.length]} flex flex-col gap-3 text-ink no-underline hover:border-ink`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-lg font-medium">{g.name}</span>
                    <span className="font-mono text-xs text-ink-soft">
                      {shortMinutes(p.doneMinutes)} / {shortMinutes(p.targetMinutes)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-sheet" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Today's goal">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="flex flex-wrap justify-between gap-2 text-sm text-ink-soft">
                    <span>{p.reached ? "Goal reached today" : `${shortMinutes(p.remainingMinutes)} left today`}</span>
                    <span className="font-medium text-ink">{race}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <form action={createGroup} className={`${card} flex flex-col gap-3`}>
          <h2 className="font-medium">New group</h2>
          <label className="flex flex-col gap-1 text-sm">
            Name
            <input name="name" required maxLength={60} placeholder="Maths crew" className="h-10 rounded-md border border-rule bg-paper px-3" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Daily goal (combined hours)
            <input name="hours" type="number" min={0.25} max={24} step={0.25} defaultValue={6} required className="h-10 rounded-md border border-rule bg-paper px-3" />
          </label>
          <button className={primaryBtn}>Create group</button>
        </form>
        <form action={joinGroup} className={`${card} flex flex-col gap-3`}>
          <h2 className="font-medium">Join with a code</h2>
          <label className="flex flex-col gap-1 text-sm">
            Invite code
            <input name="code" required pattern="[A-Za-z0-9]{8,16}" title="8 to 16 letters and numbers, e.g. K7PQ2MXH4R" autoCapitalize="characters" autoComplete="off" spellCheck={false} defaultValue={pendingCode} className="h-11 rounded-md border border-rule bg-paper px-3 font-mono uppercase" />
          </label>
          <button className={secondaryBtn}>Join</button>
        </form>
      </div>
    </StudentShell>
  );
}
