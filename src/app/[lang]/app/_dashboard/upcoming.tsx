"use client";

import { useCopyText } from "@/components/report-cards";
import { useDashboard } from "./lesson-dialog";
import type { DashItem } from "./types";

export type UpcomingLesson = {
  item: DashItem;
  /** Full sentence for screen readers, e.g. "Today, 4:00pm–5:00pm". */
  when: string;
  weekday: string;
  day: string;
  month: string;
  timeRange: string;
  tag: "now" | "today" | "tomorrow" | null;
  url: string | null;
  linkName: string | null;
};

const TAG = { now: ["dash-tag dash-tag--now", "Now"], today: ["dash-tag dash-tag--blue", "Today"], tomorrow: ["dash-tag", "Tomorrow"] } as const;

/** The next few lessons, with the class link one tap away (dashboard review §1, §6). */
export function UpcomingLessons({ lessons }: { lessons: UpcomingLesson[] }) {
  const { openItem, openCreate } = useDashboard();
  return (
    <section aria-labelledby="upcoming-title" className="dash-card flex flex-col gap-3 p-4 sm:p-5" data-testid="upcoming-lessons">
      <header className="flex items-end justify-between gap-3">
        <div className="flex flex-col">
          <span className="dash-label">Next up</span>
          <h2 id="upcoming-title" className="text-xl font-medium">
            Upcoming lessons
          </h2>
        </div>
      </header>
      {lessons.length ? (
        <ul className="-mx-2 flex flex-col">
          {lessons.map((l) => (
            <Row key={l.item.id} lesson={l} onOpen={() => openItem(l.item)} />
          ))}
        </ul>
      ) : (
        <div className="dash-inset flex flex-col gap-2 border-dashed p-4 text-sm text-ink-soft">
          <p>Nothing booked yet.</p>
          <button type="button" className="dash-link self-start" onClick={() => openCreate()}>
            Schedule a lesson →
          </button>
        </div>
      )}
    </section>
  );
}

function Row({ lesson: l, onOpen }: { lesson: UpcomingLesson; onOpen: () => void }) {
  const [copyState, copy] = useCopyText();
  const soon = l.tag === "now" || l.tag === "today";
  return (
    <li className="dash-row flex gap-3 px-2 py-2.5">
      {/* Compact date: weekday over day number, blue when it's today. */}
      <span
        className={`dash-ui flex w-11 shrink-0 flex-col items-center justify-center rounded-lg py-1 leading-none ${soon ? "bg-[var(--dash-blue-soft)] text-[var(--dash-blue-text)]" : "bg-[var(--dash-surface-2)] text-ink-soft"}`}
        aria-hidden="true"
      >
        <span className="text-[10px] font-semibold tracking-wide uppercase">{l.weekday}</span>
        <span className="font-serif text-lg tabular-nums">{l.day}</span>
        <span className="text-[10px]">{l.month}</span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <button type="button" onClick={onOpen} className="min-w-0 truncate text-left font-medium underline-offset-4 hover:underline">
            <span className="sr-only">{l.when}: </span>
            {l.item.studentName}
          </button>
          {l.tag && <span className={TAG[l.tag][0]}>{TAG[l.tag][1]}</span>}
        </div>
        <p className="dash-ui text-xs text-ink-soft">
          <span className="font-semibold text-[var(--dash-blue-text)] tabular-nums">{l.timeRange}</span>
          {l.item.subjects.length ? ` · ${l.item.subjects.join(", ")}` : ""}
        </p>
        {l.url ? (
          <div className="dash-ui flex items-center gap-3 text-xs">
            <a href={l.url} target="_blank" rel="noreferrer" className="dash-link truncate">
              Open {l.linkName ?? "class link"} ↗
            </a>
            <button type="button" className="shrink-0 text-ink-soft hover:text-ink" onClick={() => copy(l.url!)}>
              {copyState === "copied" ? "Copied" : copyState === "failed" ? "Couldn't copy" : "Copy link"}
            </button>
          </div>
        ) : (
          <p className="dash-ui text-xs text-ink-faint">No class link saved</p>
        )}
      </div>
    </li>
  );
}
