"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { Rank } from "@/lib/social/ranks";
import { RankBadge } from "./rank-badge";

/**
 * The group chat's practice prompts (owner pick "A + C", 7 Nov 2026): a strip pinned to the top of
 * the chat with the student's rank, points to the next one and a Practice button, and a nudge in
 * the conversation when another member ranks up. Both open Practice with a way back to the group.
 * Points are only ever shown to the student themself.
 */
type RankView = Pick<Rank, "id" | "name" | "color">;
export type PracticePrompt = {
  rank: RankView;
  next: RankView | null;
  toNext: number;
  fraction: number;
  todayLeft: number;
  href: string;
};
export type RankUpNudgeView = { id: string; name: string; to: RankView; at: string };

export function PracticeStrip({ prompt }: { prompt: PracticePrompt }) {
  const doneToday = prompt.todayLeft === 0;
  const pct = Math.round(Math.min(1, Math.max(0, prompt.fraction)) * 100);
  return (
    <div className="flex items-center gap-3 border-b border-rule px-3 py-2.5" data-testid="practice-strip">
      <RankBadge rank={prompt.rank} size={34} labelled={false} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{prompt.next ? `${prompt.toNext} XP to ${prompt.next.name}` : `${prompt.rank.name}: the top rank`}</p>
        {prompt.next && (
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper-deep" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progress to ${prompt.next.name}`}>
            <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
        )}
        <p className="mt-0.5 truncate text-xs text-ink-faint">
          {prompt.rank.name} · {doneToday ? "maxed for today" : `${prompt.todayLeft} left today`}
        </p>
      </div>
      {doneToday ? (
        <span className="shrink-0 rounded-full bg-paper-deep px-3.5 py-1.5 text-sm text-ink-soft">Done for today</span>
      ) : (
        <Link href={prompt.href} className="shrink-0 rounded-full bg-ink px-3.5 py-1.5 text-sm font-medium text-paper no-underline hover:opacity-90">
          Practice →
        </Link>
      )}
    </div>
  );
}

const seenKey = (id: string) => `edumi:nudge-dismissed:${id}`;
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function isDismissed(id: string): boolean {
  try {
    return window.localStorage.getItem(seenKey(id)) === "1";
  } catch {
    return false;
  }
}

/** One card in the conversation; dismissing it hides it on this device. */
export function RankUpNudge({ nudge, prompt }: { nudge: RankUpNudgeView; prompt: PracticePrompt }) {
  const dismissed = useSyncExternalStore(subscribe, () => isDismissed(nudge.id), () => false);
  if (dismissed || !prompt.next) return null;
  const dismiss = () => {
    try {
      window.localStorage.setItem(seenKey(nudge.id), "1");
    } catch {
      // Private mode: it just shows again next time.
    }
    listeners.forEach((l) => l());
  };
  return (
    <li className="flex flex-col gap-1.5" data-testid="rank-up-nudge">
      <p className="self-center rounded-md bg-brand-soft px-3 py-1.5 text-sm text-ink-soft">
        <RankBadge rank={nudge.to} size={16} labelled={false} className="mr-1 align-[-3px]" />
        {nudge.name} ranked up to {nudge.to.name}
      </p>
      <div className="flex items-center gap-3 rounded-2xl bg-[var(--tiles-pink-soft)] p-3">
        <RankBadge rank={prompt.next} size={40} labelled={false} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--tiles-pink-ink)]">
            Your move: {prompt.toNext} XP to {prompt.next.name}
          </p>
          <p className="text-xs text-ink-soft">Every mark you earn in a quiz is 1 XP.</p>
        </div>
        <Link href={prompt.href} className="shrink-0 rounded-full bg-ink px-3.5 py-1.5 text-sm font-medium text-paper no-underline hover:opacity-90">
          Quiz me
        </Link>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="shrink-0 rounded-full px-1.5 text-ink-faint hover:text-ink">
          ×
        </button>
      </div>
    </li>
  );
}
