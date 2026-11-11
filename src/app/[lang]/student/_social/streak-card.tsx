import Link from "next/link";
import { FULL_WEEK_DAYS, FULL_WEEK_POINTS, STUDY_DAY_POINTS } from "@/lib/social/consistency";
import type { Consistency } from "@/lib/social/consistency-server";

const DOT: Record<string, string> = {
  done: "bg-[var(--tiles-sage)] border-[var(--tiles-sage)]",
  rest: "bg-[var(--tiles-sand)] border-[var(--tiles-sand)]",
  today: "border-2 border-dashed border-ink bg-paper",
  missed: "bg-paper-deep border-rule",
  future: "bg-paper border-rule",
};

/**
 * The student's own consistency (docs/consistency-and-solo.md): streak, this week's study days,
 * and today's goal. A day counts at the goal in minutes, or when something is finished.
 */
export function StreakCard({ c, goalHref }: { c: Consistency; goalHref?: string }) {
  const pct = Math.min(100, Math.round((c.todayMinutes / c.goalMinutes) * 100));
  const toBonus = FULL_WEEK_DAYS - c.studyDaysThisWeek;
  return (
    <section aria-label="Your study days" className="flex flex-col gap-2 rounded-2xl border border-rule bg-sheet p-4" data-testid="streak-card">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{c.streak ? `${c.streak}-day streak` : "Start a streak today"}</h2>
        {c.todayCounted && (
          <span className="rounded-full bg-[var(--tiles-sage-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--tiles-sage-ink)]">+{STUDY_DAY_POINTS} today</span>
        )}
      </div>
      <ol className="grid grid-cols-7 gap-1.5" aria-label="This week">
        {c.dots.map((d) => (
          <li key={d.day} className="flex flex-col items-center gap-1 text-[11px] text-ink-faint">
            <span className={`h-6 w-full rounded-lg border ${DOT[d.state]}`} aria-hidden="true" />
            <span aria-hidden="true">{d.label}</span>
            <span className="sr-only">
              {d.day}: {d.state === "done" ? "study day" : d.state === "rest" ? "rest day" : d.state}
            </span>
          </li>
        ))}
      </ol>
      {c.todayCounted ? (
        <p className="text-sm text-ink-soft">Today counts. {c.finishedToday ? "You finished something." : `You reached your ${c.goalMinutes}-minute goal.`}</p>
      ) : (
        <>
          <div className="h-2 overflow-hidden rounded-full bg-paper-deep" aria-hidden="true">
            <div className="h-full rounded-full bg-[var(--tiles-sage)]" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-sm text-ink-soft">
            {c.todayMinutes} of {c.goalMinutes} min today · or finish one thing
            {goalHref && (
              <>
                {" · "}
                <Link href={goalHref} className="text-ink-soft">
                  change goal
                </Link>
              </>
            )}
          </p>
        </>
      )}
      <p className="text-sm text-ink-soft">
        {c.studyDaysThisWeek} study {c.studyDaysThisWeek === 1 ? "day" : "days"} this week
        {toBonus > 0 ? ` · ${toBonus} more for the +${FULL_WEEK_POINTS} full-week bonus` : ` · full week, +${FULL_WEEK_POINTS} earned`}
      </p>
    </section>
  );
}
