import type { Metadata } from "next";
import { Suspense } from "react";
import { myRank } from "@/lib/social/rank-sync";
import { RANKS, nextRank, rankByTier } from "@/lib/social/ranks";
import { requireSocialStudent } from "@/lib/social/server";
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
 * Study Ranks (docs/study-ranks.md): your rank, progress to the next one, and the whole ladder.
 * Points come from quiz marks and finished notes or flashcards; study minutes are the leaderboard's.
 */
async function Ranks() {
  const me = await requireSocialStudent({ paid: false });
  const { tier, points, showRank } = await myRank(me.profile.id);
  const rank = rankByTier(tier);
  const next = nextRank(rank);
  const pct = next ? Math.max(0, Math.min(100, Math.round(((points - rank.min) / (next.min - rank.min)) * 100))) : 100;

  return (
    <StudentShell me={me} title="Study Ranks" current="me" back={{ href: "/student/me", label: "Me" }}>
      <section aria-label="Your rank" className={`${tile} flex flex-col items-center gap-4 bg-brand-soft text-center sm:flex-row sm:text-left`}>
        <RankBadge rank={rank} size={112} labelled={false} />
        <div className="flex w-full flex-col gap-2">
          <p className="text-sm text-ink-soft">Your rank</p>
          <h2 className="text-2xl font-semibold tracking-tight" data-testid="current-rank">
            {rank.name}
          </h2>
          <div className="h-2.5 overflow-hidden rounded-full bg-sheet" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={next ? `Progress to ${next.name}` : "Top rank reached"}>
            <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-sm text-ink-soft">
            {points} points{next ? ` · ${next.min - points} to ${next.name}` : " · the top rank"}
          </p>
        </div>
      </section>

      <section aria-label="All ranks" className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">The ladder</h2>
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {RANKS.map((r) => {
            const state = r.tier < tier ? "earned" : r.tier === tier ? "current" : "locked";
            return (
              <li
                key={r.id}
                data-rank={r.id}
                aria-current={state === "current" ? "step" : undefined}
                className={`flex flex-col items-center gap-2 rounded-2xl p-4 text-center ${state === "current" ? "bg-sheet ring-2 ring-brand" : "bg-sheet"} ${state === "locked" ? "opacity-60" : ""}`}
              >
                <RankBadge rank={r} size={72} labelled={false} className={state === "locked" ? "grayscale" : ""} />
                <span className="font-mono text-xs text-ink-faint">Tier {r.tier}</span>
                <span className="font-medium">{r.name}</span>
                <span className="text-xs text-ink-soft">
                  {r.min === 0 ? "Where everyone starts" : `${r.min.toLocaleString("en-AU")} points`}
                  {state === "earned" ? " · earned" : state === "current" ? " · you're here" : ""}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className={`${card} flex flex-col gap-2 text-sm`}>
        <h2 className="font-medium">How ranks work</h2>
        <p className="text-ink-soft">
          Quizzes pay the marks you earn, and notes and flashcards pay 10 points when you finish them (up to 60 a day). Your rank goes up as your points add up, and
          never goes down. Study minutes count on the leaderboards, not towards your rank.
        </p>
        <form action={setShowRank} className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex gap-2">
            <input type="checkbox" name="show_rank" defaultChecked={showRank} /> Show my rank badge to my groups and friends
          </label>
          <button className={smallBtn}>Save</button>
        </form>
        <p className="text-xs text-ink-faint">Others only ever see your badge, never your points or scores.</p>
      </section>
    </StudentShell>
  );
}
