import type { Metadata } from "next";
import { Suspense } from "react";
import { whenLabel } from "@/lib/social/activity";
import { myRank } from "@/lib/social/rank-sync";
import { POINT_LABEL, tierDates, weeklyPoints } from "@/lib/social/rank-history";
import { RANKS, nextRank, rankByTier } from "@/lib/social/ranks";
import { requireSocialStudent } from "@/lib/social/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatInZone } from "@/lib/time";
import { setShowRank } from "../_social/actions";
import { RankBadge } from "../_social/rank-badge";
import { Loading, StudentShell, card, smallBtn, tile } from "../_social/shell";

export const metadata: Metadata = { title: "Study Ranks" };

export default function RanksPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Ranks />
    </Suspense>
  );
}

/**
 * Study Ranks (docs/study-ranks.md): your rank and progress to the next, how you got here (each
 * rank with the date you reached it), points week by week, and where recent points came from.
 */
async function Ranks() {
  const me = await requireSocialStudent({ paid: false });
  const admin = createAdminClient();
  const [{ tier, points, showRank }, { data: promotions }, { data: ledger }] = await Promise.all([
    myRank(me.profile.id),
    admin.from("rank_promotions").select("from_tier, to_tier, created_at").eq("profile_id", me.profile.id),
    admin.from("points_ledger").select("kind, points, day, created_at").eq("profile_id", me.profile.id).order("created_at", { ascending: false }),
  ]);
  const rank = rankByTier(tier);
  const next = nextRank(rank);
  const pct = next ? Math.max(0, Math.min(100, Math.round(((points - rank.min) / (next.min - rank.min)) * 100))) : 100;
  const reached = tierDates((promotions ?? []) as { from_tier: number; to_tier: number; created_at: string }[]);
  const weeks = weeklyPoints((ledger ?? []) as { points: number; day: string }[]);
  const maxWeek = Math.max(1, ...weeks.map((w) => w.points));
  const thisWeek = weeks[weeks.length - 1].points;
  const recent = (ledger ?? []).slice(0, 8);
  // The whole ladder: what you've earned (with dates), where you are, and what's ahead.
  const shown = RANKS;

  return (
    <StudentShell me={me} title="Study Ranks" current="me" back={{ href: "/student/home", label: "Home" }}>
      <section aria-label="Your rank" className={`${tile} flex flex-col items-center gap-4 bg-brand-soft text-center sm:flex-row sm:text-left`}>
        <RankBadge rank={rank} size={112} labelled={false} />
        <div className="flex w-full flex-col gap-2">
          <p className="text-sm text-ink-soft">
            Your rank · tier {rank.tier} of {RANKS.length}
          </p>
          <h2 className="text-2xl font-semibold tracking-tight" data-testid="current-rank">
            {rank.name}
          </h2>
          <div className="h-3 overflow-hidden rounded-full bg-sheet" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={next ? `Progress to ${next.name}` : "Top rank reached"}>
            <div className="h-full rounded-full bg-[var(--tiles-sage-strong)] transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </div>
          <p className="flex flex-wrap justify-center gap-x-3 text-sm text-ink-soft sm:justify-between">
            <span>
              <span className="font-mono font-semibold text-ink">{points.toLocaleString("en-AU")}</span> XP
            </span>
            <span>{next ? `${(next.min - points).toLocaleString("en-AU")} XP to ${next.name}` : "The top rank"}</span>
          </p>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <section aria-label="Your progression" className={`${card} flex flex-col gap-1`}>
          <h2 className="mb-2 text-lg font-semibold">Your progression</h2>
          <ol className="relative flex flex-col" data-testid="progression">
            {shown.map((r, i) => {
              const state = r.tier < tier ? "earned" : r.tier === tier ? "current" : "locked";
              const date = reached.get(r.tier);
              return (
                <li key={r.id} data-rank={r.id} aria-current={state === "current" ? "step" : undefined} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < shown.length - 1 && <span aria-hidden className={`absolute top-10 bottom-0 left-[19px] w-0.5 ${r.tier < tier ? "bg-[var(--tiles-sage-strong)]" : "bg-rule"}`} />}
                  <RankBadge rank={r} size={40} labelled={false} className={`relative shrink-0 ${state === "locked" ? "opacity-50 grayscale" : ""}`} />
                  <div className={`flex min-w-0 flex-1 flex-col ${state === "current" ? "rounded-xl bg-brand-soft px-3 py-2" : "pt-1"}`}>
                    <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className={`font-medium ${state === "locked" ? "text-ink-soft" : ""}`}>{r.name}</span>
                      <span className="font-mono text-xs text-ink-faint">{r.min.toLocaleString("en-AU")} XP</span>
                    </span>
                    <span className="text-xs text-ink-soft">
                      {state === "earned"
                        ? r.tier === 1
                          ? "Where everyone starts"
                          : date
                            ? `Reached ${formatInZone(date, "d MMM yyyy")}`
                            : "Reached"
                        : state === "current"
                          ? next
                            ? `You're here · ${(next.min - points).toLocaleString("en-AU")} XP to go`
                            : "You're here · the top rank"
                          : `${(r.min - points).toLocaleString("en-AU")} more XP`}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <div className="flex flex-col gap-5">
          <section aria-label="XP by week" className={`${card} flex flex-col gap-3`}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">XP by week</h2>
              <span className="text-sm text-ink-soft">
                <span className="font-mono font-semibold text-ink">+{thisWeek}</span> this week
              </span>
            </div>
            <ol className="flex h-32 items-end gap-1.5" aria-label="XP in each of the last 8 weeks">
              {weeks.map((w, i) => (
                <li key={w.week} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="font-mono text-[10px] text-ink-faint">{w.points || ""}</span>
                  <span
                    aria-hidden
                    className={`w-full rounded-t-md ${i === weeks.length - 1 ? "bg-[var(--tiles-sage-strong)]" : "bg-[var(--tiles-sage)]"}`}
                    style={{ height: `${w.points ? Math.max(4, (w.points / maxWeek) * 100) : 2}%` }}
                  />
                  <span className="sr-only">
                    Week of {w.week}: {w.points} XP
                  </span>
                </li>
              ))}
            </ol>
            <p className="flex justify-between text-[11px] text-ink-faint">
              <span>8 weeks ago</span>
              <span>This week</span>
            </p>
          </section>

          <section aria-label="Recent XP" className={`${card} flex flex-col gap-1`}>
            <h2 className="mb-1 font-semibold">Recent XP</h2>
            {recent.length === 0 ? (
              <p className="text-sm text-ink-soft">Finish a quiz, notes or flashcards, or reach your daily goal, to earn your first XP.</p>
            ) : (
              <ul className="flex flex-col text-sm">
                {recent.map((p, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 border-t border-rule py-2 first:border-t-0">
                    <span>
                      <span className="font-mono font-semibold text-[var(--tiles-sage-ink)]">+{p.points as number}</span> {POINT_LABEL[p.kind as string] ?? "XP"}
                    </span>
                    <span className="shrink-0 text-xs text-ink-faint">{whenLabel(p.created_at as string)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section className={`${card} flex flex-col gap-2 text-sm`}>
        <h2 className="font-medium">How ranks work</h2>
        <p className="text-ink-soft">
          Quizzes pay 1 XP per mark you earn, and notes and flashcards pay 10 XP when you finish them (up to 60 a day). Each study day adds 5 XP, and a full study week
          15 more. Your rank goes up as your XP adds up, and never goes down. Study minutes count on the leaderboards, not towards your rank.
        </p>
        <form action={setShowRank} className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" name="show_rank" defaultChecked={showRank} className="size-5" /> Show my rank badge to my groups and friends
          </label>
          <button className={smallBtn}>Save</button>
        </form>
        <p className="text-xs text-ink-faint">Others only ever see your badge, never your XP or scores.</p>
      </section>
    </StudentShell>
  );
}
