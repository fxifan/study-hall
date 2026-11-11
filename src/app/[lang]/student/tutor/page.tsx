import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { hasAccess, liveSessionFor, requireSocialStudent, sessionSeconds } from "@/lib/social/server";
import { TUTOR_LINK_COOKIE, findInvite, linkedTutors } from "@/lib/tutor/links";
import { formatInZone, zonedDateTimeToUtc } from "@/lib/time";
import { StudentShell } from "../_social/shell";
import { StudyTimer } from "../_social/study-timer";
import { PendingInvite, TutorTaskCard } from "../_social/tutor-task";

export const metadata: Metadata = { title: "My tutor" };

/**
 * My tutor (docs/tutor-next-steps.md): next steps from linked tutors, progress the student reports,
 * and a study timer that counts towards no group. Free: no plan needed.
 */
export default function TutorPage() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 w-full max-w-4xl animate-pulse rounded-lg bg-paper-deep" />}>
      <Tutor />
    </Suspense>
  );
}

async function Tutor() {
  const me = await requireSocialStudent({ paid: false });
  const jar = await cookies();
  const [tutors, live, invite] = await Promise.all([
    linkedTutors(me.profile.id),
    liveSessionFor(me.profile.id),
    jar.has(TUTOR_LINK_COOKIE) ? findInvite(jar.get(TUTOR_LINK_COOKIE)!.value) : null,
  ]);
  const paid = hasAccess(me.access);
  const initial = live
    ? { sessionId: live.id, state: live.state, seconds: await sessionSeconds(live), groupId: live.group_id }
    : { sessionId: null, state: "stopped" as const, seconds: 0, groupId: null };

  return (
    <StudentShell me={me} title="My tutor">
      {invite && !invite.linkedTo && <PendingInvite token={jar.get(TUTOR_LINK_COOKIE)!.value} tutorName={invite.tutorName} />}
      {!paid && tutors.length > 0 && (
        <p className="rounded-xl border border-rule bg-sheet px-4 py-3 text-sm text-ink-soft">
          Your free trial has ended. Your tutor&apos;s next steps and the study timer stay free.{" "}
          <Link href="/student/plan" className="font-medium text-ink">
            Get a plan for groups, friends and practice →
          </Link>
        </p>
      )}
      {tutors.length > 0 && <StudyTimer initial={initial} solo studyScreen />}
      {tutors.map((t) => (
        <TutorTaskCard
          key={t.recordId}
          recordId={t.recordId}
          tutorName={t.tutorName}
          task={t.task && { ...t.task, dueLabel: t.task.dueOn ? formatInZone(zonedDateTimeToUtc(t.task.dueOn, "12:00"), "EEE d MMM") : null }}
        />
      ))}
      {!tutors.length && !invite && (
        <div className="rounded-2xl border border-dashed border-rule bg-sheet p-5 text-ink-soft">
          <p className="font-medium text-ink">No tutor linked yet</p>
          <p className="mt-1 text-sm">If your tutor uses Edumi, ask them for an invite link. You&apos;ll see the next step from each lesson here, and they&apos;ll see how you went.</p>
        </div>
      )}
    </StudentShell>
  );
}
