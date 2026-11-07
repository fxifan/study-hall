import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { shortMinutes } from "@/lib/social/credit";
import { myRank } from "@/lib/social/rank-sync";
import { nextRank, rankByTier } from "@/lib/social/ranks";
import { RankBadge } from "../_social/rank-badge";
import { namesFor, requireSocialStudent } from "@/lib/social/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatInZone } from "@/lib/time";
import { unblockUser } from "../_social/actions";
import { Loading, StudentShell, card, tile, smallBtn } from "../_social/shell";
import { UsernameCard } from "../_social/username-card";

export const metadata: Metadata = { title: "Me" };

export default function MePage({ searchParams }: PageProps<"/[lang]/student/me">) {
  return (
    <Suspense fallback={<Loading />}>
      <Me searchParams={searchParams} />
    </Suspense>
  );
}

/** Personal tier and private history. Nobody else sees points or scores. */
async function Me({ searchParams }: Pick<PageProps<"/[lang]/student/me">, "searchParams">) {
  const [me, locale, query] = await Promise.all([requireSocialStudent({ paid: false }), getLocale(), searchParams]);
  const admin = createAdminClient();
  const [{ data: points }, { data: sessions }, { data: blocks }, { data: self }] = await Promise.all([
    admin.from("points_ledger").select("kind, points, created_at").eq("profile_id", me.profile.id).order("created_at", { ascending: false }),
    admin.from("study_sessions").select("id, started_at, credited_seconds, stop_reason, study_groups(name)").eq("profile_id", me.profile.id).eq("state", "stopped").order("started_at", { ascending: false }).limit(15),
    admin.from("user_blocks").select("blocked_id").eq("blocker_id", me.profile.id),
    admin.from("students").select("username").eq("profile_id", me.profile.id).single(),
  ]);
  const total = (points ?? []).reduce((s, p) => s + (p.points as number), 0);
  const { tier } = await myRank(me.profile.id);
  const rank = rankByTier(tier);
  const next = nextRank(rank);
  const pct = next ? Math.max(0, Math.min(100, Math.round(((total - rank.min) / (next.min - rank.min)) * 100))) : 100;
  const blockedNames = await namesFor((blocks ?? []).map((b) => b.blocked_id as string));

  return (
    <StudentShell me={me} title={`${me.student.first_name} ${me.student.last_initial}.`} current="me">
      <Link href={localizePath("/student/ranks", locale)} className={`${tile} flex items-center gap-4 bg-[var(--tiles-pink-soft)] text-ink no-underline hover:ring-2 hover:ring-brand`}>
        <RankBadge rank={rank} size={72} labelled={false} />
        <span className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm text-ink-soft">Your rank</span>
          <span className="text-2xl font-semibold tracking-tight">{rank.name}</span>
          <span className="h-2 overflow-hidden rounded-full bg-sheet" aria-hidden="true">
            <span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </span>
          <span className="text-sm text-ink-soft">
            {total} points{next ? ` · ${next.min - total} to ${next.name}` : " · top rank"} · See all ranks →
          </span>
        </span>
      </Link>

      <UsernameCard
        current={(self?.username as string | null) ?? null}
        back="/student/me"
        error={typeof query.username_error === "string" ? query.username_error : null}
        saved={query.username_saved === "1"}
      />

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
