"use client";

import Link from "next/link";
import { useDashboard } from "./lesson-dialog";
import type { DashDay, DashItem } from "./types";

/**
 * Lesson calendar (week and month). Times are Melbourne time, worked out on the server.
 *
 * Week, wide screens: a time grid; click an empty hour to schedule a lesson there, click a lesson
 * for its details (reschedule, cancel, log). Week, phones: one list per day, each with "+ Add".
 * Month: each day shows its first lessons and a count; on phones, dots, and a tap opens that week.
 *
 * Colour carries status: coral = booked and still to come; dashed coral = happened but not logged;
 * quiet surface = logged; dashed grey and struck through = cancelled.
 */
type Nav = {
  prev: string;
  next: string;
  today: string;
  week: string;
  month: string;
};

const HOUR_PX = 48;

function itemClass(item: DashItem): string {
  if (item.status === "cancelled") return "dash-event dash-event--cancelled";
  if (item.status === "done") return "dash-event dash-event--done";
  if (item.isPast) return "dash-event dash-event--due";
  return "dash-event dash-event--scheduled";
}

function statusWord(item: DashItem): string | null {
  if (item.status === "cancelled") return "Cancelled";
  if (item.status === "done") return "Done";
  if (item.isPast) return "Log it";
  return null;
}

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;

export function LessonCalendar({
  view,
  title,
  days,
  items,
  nav,
  hours,
  nowMin,
}: {
  view: "week" | "month";
  title: string;
  days: DashDay[];
  items: DashItem[];
  nav: Nav;
  hours: [number, number];
  /** Minutes after midnight (Melbourne) for the "now" line, when today is in view. */
  nowMin: number | null;
}) {
  const byDay = new Map<string, DashItem[]>();
  for (const item of items) byDay.set(item.dateKey, [...(byDay.get(item.dateKey) ?? []), item]);

  return (
    <section aria-labelledby="calendar-title" className="dash-card flex flex-col gap-4 p-3 sm:p-5">
      <header className="flex flex-wrap items-center gap-2">
        <div className="mr-auto flex flex-col">
          <span className="dash-label">Schedule</span>
          <h2 id="calendar-title" className="text-xl font-medium">
            {title}
          </h2>
        </div>
        <div className="dash-segment" role="group" aria-label="Calendar view">
          <Link href={nav.week} aria-current={view === "week" ? "page" : undefined}>
            Week
          </Link>
          <Link href={nav.month} aria-current={view === "month" ? "page" : undefined}>
            Month
          </Link>
        </div>
        <nav aria-label="Change dates" className="flex items-center gap-1.5">
          <Link href={nav.prev} className="dash-icon-btn" aria-label={`Previous ${view}`}>
            ←
          </Link>
          <Link href={nav.today} className="dash-icon-btn">
            Today
          </Link>
          <Link href={nav.next} className="dash-icon-btn" aria-label={`Next ${view}`}>
            →
          </Link>
        </nav>
      </header>
      {view === "week" ? (
        <WeekView days={days} byDay={byDay} hours={hours} nowMin={nowMin} />
      ) : (
        <MonthView days={days} byDay={byDay} weekHref={nav.week} />
      )}
      <Legend />
    </section>
  );
}

function Legend() {
  return (
    <p className="dash-ui flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-ink-soft">
      <span className="flex items-center gap-1.5">
        <span className="dash-event--scheduled size-3 rounded border" /> Booked
      </span>
      <span className="flex items-center gap-1.5">
        <span className="dash-event--due size-3 rounded" /> Happened, not logged
      </span>
      <span className="flex items-center gap-1.5">
        <span className="dash-event--done size-3 rounded border" /> Logged
      </span>
    </p>
  );
}

function WeekView({
  days,
  byDay,
  hours,
  nowMin,
}: {
  days: DashDay[];
  byDay: Map<string, DashItem[]>;
  hours: [number, number];
  nowMin: number | null;
}) {
  const { openCreate, openItem } = useDashboard();
  const [from, to] = hours;
  const rows = Array.from({ length: to - from }, (_, i) => from + i);
  const nowTop = nowMin !== null && nowMin >= from * 60 && nowMin <= to * 60 ? ((nowMin - from * 60) / 60) * HOUR_PX : null;

  return (
    <>
      {/* Phones and narrow tablets: a list per day. */}
      <ol className="flex flex-col gap-1 md:hidden">
        {days.map((d) => {
          const list = byDay.get(d.key) ?? [];
          return (
            <li key={d.key} className={`flex flex-col gap-2 rounded-xl px-2 py-2.5 ${d.isToday ? "bg-[var(--dash-accent-soft)]" : ""}`}>
              <div className="flex items-center justify-between">
                <h3 className={`dash-day-head ${d.isToday ? "dash-day-head--today" : ""}`}>
                  {d.label}
                  {d.isToday && <span className="font-normal">· Today</span>}
                </h3>
                <button
                  type="button"
                  className="dash-btn dash-btn--ghost"
                  onClick={() => openCreate(d.key)}
                  aria-label={`Schedule a lesson on ${d.label}`}
                >
                  + Add
                </button>
              </div>
              {list.length ? (
                list.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openItem(item)}
                    title={`${item.studentName}, ${item.timeLabel}–${item.endLabel}`}
                    className={`${itemClass(item)} flex min-h-12 items-center justify-between gap-3 px-3 py-2 text-sm`}
                  >
                    <span className="flex flex-col">
                      <span className="font-semibold">{item.studentName}</span>
                      <span className="text-xs opacity-80">{item.subjects.join(", ")}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end text-xs">
                      <span className="dash-event-time font-semibold tabular-nums">{item.timeLabel}</span>
                      {statusWord(item) && <span>{statusWord(item)}</span>}
                    </span>
                  </button>
                ))
              ) : (
                <p className="dash-ui px-1 text-xs text-ink-faint">Free</p>
              )}
            </li>
          );
        })}
      </ol>

      {/* Wider screens: a time grid. */}
      <div className="hidden md:block">
        <div className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] pb-2">
          <span />
          {days.map((d) => (
            <span key={d.key} className="flex justify-center">
              <span className={`dash-day-head ${d.isToday ? "dash-day-head--today" : ""}`}>
                {d.weekday} <span className="tabular-nums">{d.day}</span>
              </span>
            </span>
          ))}
        </div>
        <div className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] border-t border-[var(--dash-border)]">
          <div>
            {rows.map((h) => (
              <div
                key={h}
                style={{ height: HOUR_PX }}
                className="dash-ui -translate-y-2 pr-2 text-right text-[10px] font-medium text-ink-faint tabular-nums"
              >
                {hourLabel(h)}
              </div>
            ))}
          </div>
          {days.map((d) => (
            <div key={d.key} className={`relative dash-grid-col ${d.isToday ? "dash-grid-col--today" : ""}`}>
              {rows.map((h) => (
                <button
                  key={h}
                  type="button"
                  style={{ height: HOUR_PX }}
                  className="dash-slot"
                  onClick={() => openCreate(d.key, `${String(h).padStart(2, "0")}:00`)}
                  aria-label={`Schedule a lesson on ${d.label} at ${hourLabel(h)}`}
                >
                  <span>+ {hourLabel(h)}</span>
                </button>
              ))}
              {d.isToday && nowTop !== null && <div className="dash-now" style={{ top: nowTop }} aria-hidden="true" />}
              {(byDay.get(d.key) ?? []).map((item) => {
                const top = ((item.startMin - from * 60) / 60) * HOUR_PX;
                const height = Math.max((item.durationMin / 60) * HOUR_PX - 3, 22);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openItem(item)}
                    style={{ top: top + 1, height }}
                    className={`${itemClass(item)} absolute inset-x-1 overflow-hidden px-2 py-1 text-[11px] leading-tight`}
                    title={`${item.studentName}, ${item.timeLabel}–${item.endLabel}`}
                  >
                    <span className="block truncate font-semibold">{item.studentName}</span>
                    <span className="dash-event-time block truncate tabular-nums opacity-90">
                      {item.timeLabel}
                      {statusWord(item) ? ` · ${statusWord(item)}` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function MonthView({ days, byDay, weekHref }: { days: DashDay[]; byDay: Map<string, DashItem[]>; weekHref: string }) {
  const { openCreate, openItem } = useDashboard();
  const weekdays = days.slice(0, 7).map((d) => d.weekday);
  const weekOf = (key: string) => weekHref.replace(/date=[\d-]+/, `date=${key}`);
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--dash-border)]">
      <div className="dash-ui grid grid-cols-7 bg-[var(--dash-surface-2)] py-1.5 text-center text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
        {weekdays.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const list = (byDay.get(d.key) ?? []).filter((i) => i.status !== "cancelled");
          return (
            <div
              key={d.key}
              className={`group flex min-h-16 flex-col gap-1 border-t border-l border-[var(--dash-border)] p-1.5 transition-colors first:border-l-0 hover:bg-[var(--dash-surface-2)] sm:min-h-24 [&:nth-child(7n+1)]:border-l-0 ${
                d.isToday ? "bg-[var(--dash-accent-soft)]" : d.inMonth ? "" : "opacity-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <Link
                  href={weekOf(d.key)}
                  className={`dash-ui inline-flex size-6 items-center justify-center rounded-md text-xs font-semibold tabular-nums ${d.isToday ? "bg-[var(--dash-accent)] text-[var(--dash-accent-ink)]" : "text-ink-soft hover:bg-[var(--dash-surface-hover)]"}`}
                  aria-label={`Week of ${d.label}`}
                >
                  {d.day}
                </Link>
                <button
                  type="button"
                  className="dash-ui hidden size-6 items-center justify-center rounded-md text-xs text-[var(--dash-accent-text)] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 sm:inline-flex"
                  onClick={() => openCreate(d.key)}
                  aria-label={`Schedule a lesson on ${d.label}`}
                >
                  +
                </button>
              </div>
              {/* Phones: dots. */}
              <Link href={weekOf(d.key)} className="flex flex-wrap gap-1 px-0.5 sm:hidden" aria-label={`${list.length} lessons on ${d.label}`}>
                {list.slice(0, 4).map((i) => (
                  <span
                    key={i.id}
                    className={`size-1.5 rounded-full ${i.status === "done" ? "bg-[var(--dash-text-3)]" : "bg-[var(--dash-accent)]"}`}
                  />
                ))}
              </Link>
              {/* Wider: the first two lessons and a count. */}
              <div className="hidden flex-col gap-1 sm:flex">
                {list.slice(0, 2).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openItem(item)}
                    title={`${item.studentName}, ${item.timeLabel}–${item.endLabel}`}
                    className={`${itemClass(item)} truncate px-1.5 py-0.5 text-[11px]`}
                  >
                    <span className="dash-event-time font-semibold tabular-nums">{item.timeLabel}</span> {item.studentName}
                  </button>
                ))}
                {list.length > 2 && (
                  <Link href={weekOf(d.key)} className="dash-link px-1 text-[11px]">
                    +{list.length - 2} more
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
