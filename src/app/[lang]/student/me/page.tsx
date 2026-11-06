import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { shortMinutes } from "@/lib/social/credit";
import { tierFor } from "@/lib/social/points";
import { namesFor, requireSocialStudent } from "@/lib/social/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatInZone } from "@/lib/time";
import { unblockUser } from "../_social/actions";
import { Loading, StudentShell, card, smallBtn } from "../_social/shell";

export const metadata: Metadata = { title: "Me" };

export default function MePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Me />
    </Suspense>
  );
}

/** Personal tier and private history. Nobody else sees points or scores. */
async function Me() {
  const [me, locale] = await Promise.all([requireSocialStudent({ paid: false }), getLocale()]);
  const admin = createAdminClient();
  const [{ data: points }, { data: sessions }, { data: blocks }] = await Promise.all([
    admin.from("points_ledger").select("kind, points, created_at").eq("profile_id", me.profile.id).order("created_at", { ascending: false }),
    admin.from("study_sessions").select("id, started_at, credited_seconds, stop_reason, study_groups(name)").eq("profile_id", me.profile.id).eq("state", "stopped").order("started_at", { ascending: false }).limit(15),
    admin.from("user_blocks").select("blocked_id").eq("blocker_id", me.profile.id),
  ]);
  const total = (points ?? []).reduce((s, p) => s + (p.points as number), 0);
  const tier = tierFor(total);
  const pct = tier.next ? Math.round(((total - tier.min) / (tier.next.min - tier.min)) * 100) : 100;
  const blockedNames = await namesFor((blocks ?? []).map((b) => b.blocked_id as string));

  return (
    <StudentShell me={me} title={`${me.student.first_name} ${me.student.last_initial}.`} current="me">
      <section className={`${card} flex flex-col gap-2`}>
        <p className="text-sm text-ink-soft">Your tier</p>
        <p className="text-3xl font-medium">{tier.name}</p>
        <div className="h-2 overflow-hidden rounded-full bg-paper-deep" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to the next tier">
          <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-sm text-ink-soft">
          {total} points{tier.next ? ` · ${tier.next.min - total} to ${tier.next.name}` : " · top tier"}
        </p>
        <p className="text-xs text-ink-faint">Earn points by finishing practice: 10 for completing a set, plus 5 at 70% and 5 at 90% on vetted quizzes. Up to 60 a day. Only you see your points.</p>
      </section>

      <section className={`${card} flex flex-col gap-2`}>
        <h2 className="font-medium">Recent study sessions</h2>
        {(sessions ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">No finished sessions yet.</p>
        ) : (
          <ul className="divide-y divide-rule text-sm">
            {(sessions ?? []).map((s) => (
              <li key={s.id as string} className="flex justify-between py-1.5">
                <span>
                  {(s.study_groups as unknown as { name: string } | null)?.name ?? "Group"}
                  <span className="block text-xs text-ink-faint">{formatInZone(s.started_at as string, "EEE d MMM, h:mmaaa")}</span>
                </span>
                <span className="font-mono">{shortMinutes(Math.floor((s.credited_seconds as number) / 60))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${card} flex flex-col gap-2 text-sm`}>
        <h2 className="font-medium">Plan and privacy</h2>
        <Link href={localizePath("/student/plan", locale)}>Your Edumi plan</Link>
        {blockedNames.size > 0 && (
          <>
            <p className="mt-2 text-ink-soft">People you&apos;ve blocked</p>
            {[...blockedNames].map(([id, name]) => (
              <div key={id} className="flex items-center justify-between">
                <span>{name}</span>
                <form action={unblockUser.bind(null, id)}>
                  <button className={smallBtn}>Unblock</button>
                </form>
              </div>
            ))}
          </>
        )}
      </section>
    </StudentShell>
  );
}
