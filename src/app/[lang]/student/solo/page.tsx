import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { consistencyFor } from "@/lib/social/consistency-server";
import { liveSessionFor, requireSocialStudent, sessionSeconds } from "@/lib/social/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { linkedTutors } from "@/lib/tutor/links";
import { StudentShell } from "../_social/shell";
import { SoloCheckIn } from "../_social/solo-checkin";
import { startSolo } from "../_social/solo-actions";
import { StreakCard } from "../_social/streak-card";
import { StudyTimer } from "../_social/study-timer";

export const metadata: Metadata = { title: "Study solo" };

/**
 * Study solo (docs/consistency-and-solo.md): pick one task, study on a timer that counts towards
 * your goal and the Friends board (never a group's goal), then check in and set tomorrow's task.
 */
export default function SoloPage({ searchParams }: PageProps<"/[lang]/student/solo">) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 w-full max-w-4xl animate-pulse rounded-lg bg-paper-deep" />}>
      <Solo searchParams={searchParams} />
    </Suspense>
  );
}

async function Solo({ searchParams }: Pick<PageProps<"/[lang]/student/solo">, "searchParams">) {
  const [me, query] = await Promise.all([requireSocialStudent(), searchParams]);
  const [{ data: open }, live, c, tutors] = await Promise.all([
    createAdminClient().from("solo_tasks").select("id, body").eq("profile_id", me.profile.id).eq("status", "open").maybeSingle(),
    liveSessionFor(me.profile.id),
    consistencyFor(me.profile.id),
    linkedTutors(me.profile.id),
  ]);
  const initial =
    live && live.group_id === null
      ? { sessionId: live.id, state: live.state, seconds: await sessionSeconds(live), groupId: null }
      : { sessionId: null, state: "stopped" as const, seconds: 0, groupId: null };
  const choices = [
    ...tutors.filter((t) => t.task && t.task.status !== "done").map((t) => ({ source: "tutor", tag: t.tutorName.split(" ")[0], body: t.task!.body })),
    ...(c.tomorrow ? [{ source: "tomorrow", tag: "Tomorrow", body: c.tomorrow }] : []),
  ];

  return (
    <StudentShell me={me} title="Study solo" current="groups" back={{ href: "/student/groups", label: "Groups" }}>
      {open ? (
        <>
          <section className="rounded-2xl border-2 border-[var(--tiles-sage)] bg-sheet p-4">
            <p className="text-xs font-semibold tracking-wide text-ink-faint uppercase">Working on</p>
            <p className="mt-1 text-lg font-medium">{open.body as string}</p>
          </section>
          <StudyTimer initial={initial} solo studyScreen />
          <p className="text-sm text-ink-soft">Aim for a 25-minute focus block, then a 5-minute break. Solo time counts towards your goal and the Friends board, not a group&apos;s goal.</p>
          <SoloCheckIn task={open.body as string} />
        </>
      ) : (
        <>
          <StreakCard c={c} />
          {query.error === "task" && <p role="alert" className="text-sm text-pen">Write what you&apos;re working on (up to 200 characters).</p>}
          <section className="flex flex-col gap-3 rounded-2xl border border-rule bg-sheet p-4">
            <h2 className="font-medium">What are you working on?</h2>
            {choices.map((ch) => (
              <form key={`${ch.source}-${ch.body}`} action={startSolo}>
                <input type="hidden" name="source" value={ch.source} />
                <input type="hidden" name="body" value={ch.body} />
                <button type="submit" className="flex w-full items-center gap-2 rounded-xl border border-rule bg-paper px-3 py-2.5 text-left text-sm hover:border-ink">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ch.source === "tutor" ? "bg-[var(--tiles-sage-soft)] text-[var(--tiles-sage-ink)]" : "bg-[var(--tiles-sand)] text-[var(--tiles-sand-ink)]"}`}>
                    {ch.tag}
                  </span>
                  {ch.body}
                </button>
              </form>
            ))}
            <form action={startSolo} className="flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="source" value="own" />
              <label className="sr-only" htmlFor="solo-own">
                My own task
              </label>
              <input id="solo-own" name="body" required maxLength={200} placeholder="e.g. Chem ch. 4, questions 1–10" className="h-11 flex-1 rounded-lg border border-rule bg-paper px-3" />
              <button type="submit" className="inline-flex h-11 items-center justify-center rounded-full bg-ink px-5 font-medium text-paper">
                Start studying
              </button>
            </form>
            <Link href="/student/practice" className="text-sm text-ink-soft">
              Or make a practice quiz →
            </Link>
          </section>
        </>
      )}
    </StudentShell>
  );
}
