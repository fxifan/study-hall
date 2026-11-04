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
 */
type Nav = { prev: string; next: string; today: string; week: string; month: string };

const HOUR_PX = 44;

function itemTone(item: DashItem): string {
  if (item.status === "cancelled") return "border-hair bg-paper text-ink-faint line-through";
  if (item.status === "done") return "border-hair bg-paper-deep text-ink-soft";
  if (item.isPast) return "border-pen/60 bg-sheet text-pen"; // happened but not logged yet
  return "border-ink/30 bg-sheet text-ink";
}

function statusWord(item: DashItem): string | null {
  if (item.status === "cancelled") return "Cancelled";
  if (item.status === "done") return "Done";
  if (item.isPast) return "Log it";
  return null;
}

export function LessonCalendar({
  view,
  title,
  days,
  items,
  nav,
  hours,
}: {
  view: "week" | "month";
  title: string;
  days: DashDay[];
  items: DashItem[];
  nav: Nav;
  hours: [number, number];
}) {
  const byDay = new Map<string, DashItem[]>();
  for (const item of items) byDay.set(item.dateKey, [...(byDay.get(item.dateKey) ?? []), item]);

  return (
    <section aria-labelledby="calendar-title" className="flex flex-col gap-3 rounded-lg border border-hair bg-sheet p-3 sm:p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h2 id="calendar-title" className="mr-auto text-lg font-medium">
          {title}
        </h2>
        <div className="flex items-center rounded-lg border border-hair text-sm" role="group" aria-label="Calendar view">
          <Link href={nav.week} aria-current={view === "week" ? "page" : undefined} className={`rounded-l-lg px-3 py-1.5 ${view === "week" ? "bg-ink text-paper" : "hover:bg-paper-deep"}`}>
            Week
          </Link>
          <Link href={nav.month} aria-current={view === "month" ? "page" : undefined} className={`rounded-r-lg px-3 py-1.5 ${view === "month" ? "bg-ink text-paper" : "hover:bg-paper-deep"}`}>
            Month
          </Link>
        </div>
        <nav aria-label="Change dates" className="flex items-center gap-1 text-sm">
          <Link href={nav.prev} className="rounded-lg border border-hair px-2.5 py-1.5 hover:bg-paper-deep" aria-label={`Previous ${view}`}>
            ←
          </Link>
          <Link href={nav.today} className="rounded-lg border border-hair px-3 py-1.5 hover:bg-paper-deep">
            Today
          </Link>
          <Link href={nav.next} className="rounded-lg border border-hair px-2.5 py-1.5 hover:bg-paper-deep" aria-label={`Next ${view}`}>
            →
          </Link>
        </nav>
      </header>
      {view === "week" ? <WeekView days={days} byDay={byDay} hours={hours} /> : <MonthView days={days} byDay={byDay} weekHref={nav.week} />}
      <Legend />
    </section>
  );
}

function Legend() {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm border border-ink/30 bg-sheet" /> Scheduled
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm border border-pen/60" /> Happened, not logged
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-paper-deep" /> Logged
      </span>
    </p>
  );
}

function WeekView({ days, byDay, hours }: { days: DashDay[]; byDay: Map<string, DashItem[]>; hours: [number, number] }) {
  const { openCreate, openItem } = useDashboard();
  const [from, to] = hours;
  const rows = Array.from({ length: to - from }, (_, i) => from + i);
  const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;

  return (
    <>
      {/* Phones and narrow tablets: a list per day. */}
      <ol className="flex flex-col divide-y divide-rule md:hidden">
        {days.map((d) => {
          const list = byDay.get(d.key) ?? [];
          return (
            <li key={d.key} className="flex flex-col gap-2 py-3">
              <div className="flex items-center justify-between">
                <h3 className={`text-sm ${d.isToday ? "font-semibold text-pen" : "font-medium"}`}>
                  {d.label}
                  {d.isToday && " · Today"}
                </h3>
                <button type="button" className="h-9 rounded-lg px-2 text-sm text-ink-soft hover:text-ink" onClick={() => openCreate(d.key)} aria-label={`Schedule a lesson on ${d.label}`}>
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
                    className={`flex min-h-11 items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm ${itemTone(item)}`}
                  >
                    <span className="flex flex-col">
                      <span className="font-medium">{item.studentName}</span>
                      <span className="text-xs opacity-80">{item.subjects.join(", ")}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end text-xs">
                      <span className="font-mono">{item.timeLabel}</span>
                      {statusWord(item) && <span>{statusWord(item)}</span>}
                    </span>
                  </button>
                ))
              ) : (
                <p className="text-xs text-ink-faint">Free</p>
              )}
            </li>
          );
        })}
      </ol>

      {/* Wider screens: a time grid. */}
      <div className="hidden md:block">
        <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] border-b border-rule pb-1 text-xs">
          <span />
          {days.map((d) => (
            <span key={d.key} className={`px-1 text-center ${d.isToday ? "font-semibold text-pen" : "text-ink-soft"}`}>
              {d.weekday} <span className="font-mono">{d.day}</span>
            </span>
          ))}
        </div>
        <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))]">
          <div>
            {rows.map((h) => (
              <div key={h} style={{ height: HOUR_PX }} className="-translate-y-2 pr-1 text-right font-mono text-[10px] text-ink-faint">
                {hourLabel(h)}
              </div>
            ))}
          </div>
          {days.map((d) => (
            <div key={d.key} className={`relative border-l border-rule ${d.isToday ? "bg-paper/60" : ""}`}>
              {rows.map((h) => (
                <button
                  key={h}
                  type="button"
                  style={{ height: HOUR_PX }}
                  className="group block w-full border-b border-rule/60 text-left hover:bg-paper-deep/60 focus-visible:bg-paper-deep"
                  onClick={() => openCreate(d.key, `${String(h).padStart(2, "0")}:00`)}
                  aria-label={`Schedule a lesson on ${d.label} at ${hourLabel(h)}`}
                >
                  <span className="hidden px-1 text-[10px] text-ink-faint group-hover:inline group-focus-visible:inline">+</span>
                </button>
              ))}
              {(byDay.get(d.key) ?? []).map((item) => {
                const top = ((item.startMin - from * 60) / 60) * HOUR_PX;
                const height = Math.max((item.durationMin / 60) * HOUR_PX - 2, 20);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openItem(item)}
                    style={{ top, height }}
                    className={`absolute inset-x-0.5 overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-[0_1px_0_rgba(27,42,65,0.04)] hover:z-10 hover:shadow-md ${itemTone(item)}`}
                    title={`${item.studentName}, ${item.timeLabel}–${item.endLabel}`}
                  >
                    <span className="block truncate font-medium">{item.studentName}</span>
                    <span className="block truncate font-mono opacity-80">
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
    <div>
      <div className="grid grid-cols-7 border-b border-rule pb-1 text-center text-xs text-ink-soft">
        {weekdays.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const list = (byDay.get(d.key) ?? []).filter((i) => i.status !== "cancelled");
          return (
            <div key={d.key} className={`flex min-h-16 flex-col gap-0.5 border-b border-l border-rule p-1 sm:min-h-24 ${d.inMonth ? "" : "bg-paper/60 text-ink-faint"}`}>
              <div className="flex items-center justify-between">
                <Link href={weekOf(d.key)} className={`font-mono text-xs ${d.isToday ? "rounded bg-pen px-1 text-paper" : ""}`} aria-label={`Week of ${d.label}`}>
                  {d.day}
                </Link>
                <button type="button" className="hidden h-5 px-1 text-xs text-ink-faint hover:text-ink sm:block" onClick={() => openCreate(d.key)} aria-label={`Schedule a lesson on ${d.label}`}>
                  +
                </button>
              </div>
              {/* Phones: dots. */}
              <Link href={weekOf(d.key)} className="flex flex-wrap gap-0.5 sm:hidden" aria-label={`${list.length} lessons on ${d.label}`}>
                {list.slice(0, 4).map((i) => (
                  <span key={i.id} className={`size-1.5 rounded-full ${i.status === "done" ? "bg-ink-faint" : i.isPast ? "bg-pen" : "bg-ink"}`} />
                ))}
              </Link>
              {/* Wider: the first two lessons and a count. */}
              <div className="hidden flex-col gap-0.5 sm:flex">
                {list.slice(0, 2).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openItem(item)}
                    title={`${item.studentName}, ${item.timeLabel}–${item.endLabel}`}
                    className={`truncate rounded border px-1 text-left text-[11px] ${itemTone(item)}`}
                  >
                    <span className="font-mono">{item.timeLabel}</span> {item.studentName}
                  </button>
                ))}
                {list.length > 2 && (
                  <Link href={weekOf(d.key)} className="text-[11px] text-ink-soft hover:text-ink">
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
