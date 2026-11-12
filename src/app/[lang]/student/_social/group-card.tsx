import Link from "next/link";
import { rank, shortMinutes } from "@/lib/social/credit";
import type { Group, todayProgress } from "@/lib/social/server";

/** Group cards cycle through the Tiles colours: sage, pink, sand, slate. */
const TILE = ["bg-brand-soft", "bg-[var(--tiles-pink-soft)]", "bg-[var(--tiles-sand)]", "bg-[var(--tiles-slate-soft)]"];

type Member = { profile_id: string; name: string; board_opt_in: boolean };

/** One group: today's shared goal first, then who's leading (nobody is named as behind). */
export function GroupCard({
  group,
  progress,
  members,
  meId,
  href,
  index,
}: {
  group: Group;
  progress: Awaited<ReturnType<typeof todayProgress>>;
  members: Member[];
  meId: string;
  href: string;
  index: number;
}) {
  const p = progress;
  const pct = Math.min(100, Math.round((p.doneMinutes / Math.max(1, p.targetMinutes)) * 100));
  const board = members.filter((m) => m.board_opt_in);
  const standings = rank(new Map(board.map((m) => [m.profile_id, p.totals.get(m.profile_id) ?? 0])));
  const leader = standings[0] && standings[0].seconds >= 60 ? board.find((m) => m.profile_id === standings[0].profileId) : undefined;
  const mine = standings.find((x) => x.profileId === meId);
  const race = !leader
    ? "Nobody's on the board yet today. Take the lead."
    : leader.profile_id === meId
      ? "You're leading today"
      : `${leader.name} leads${mine ? ` · you're #${mine.rank}` : ""}`;
  return (
    <Link href={href} className={`rounded-2xl p-5 ${TILE[index % TILE.length]} flex flex-col gap-3 text-ink no-underline hover:border-ink`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-lg font-semibold">{group.name}</span>
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
  );
}
