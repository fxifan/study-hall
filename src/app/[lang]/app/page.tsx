import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { siteOrigin } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { calendarItems, computeMetrics, monthGridStart, weekRange, type LessonRow, type SessionRow } from "@/lib/tutor/dashboard";
import { studentName } from "@/lib/tutor/format";
import { formatCents, sessionCharge } from "@/lib/tutor/invoice-math";
import { accessFor, requireTutor } from "@/lib/tutor/server";
import { addDaysToDateKey, dateKeyOf, formatInZone, zonedDateTimeToUtc } from "@/lib/time";
import { CalendarConnections } from "./_dashboard/calendar-connections";
import { LessonCalendar } from "./_dashboard/calendar";
import { DashboardProvider } from "./_dashboard/lesson-dialog";
import { MeetingLinks } from "./_dashboard/meeting-links";
import { QuickActions } from "./_dashboard/quick-actions";
import { StudentScheduleButton } from "./_dashboard/student-schedule-button";
import type { DashDay, DashItem, DashLink } from "./_dashboard/types";
import { PlanBanner } from "./_components/plan-banner";
import { TutorShell, appHref, yearLabel } from "./_components/shell";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * The tutor dashboard (tutor dashboard brief): where a tutor starts each day. Signed-in tutors who
 * open /tutors land here. Everything shown is the tutor's own data, read through RLS; nothing is
 * sample data.
 */
export default function DashboardPage({ searchParams }: PageProps<"/[lang]/app">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-8" aria-busy="true" aria-label="Loading your dashboard">
      <div className="h-8 w-64 animate-pulse rounded bg-paper-deep" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-paper-deep" />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-lg bg-paper-deep" />
    </div>
  );
}

type StudentRow = { id: string; first_name: string; last_initial: string; year_level: number; subjects: string[]; goals: string | null };

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

async function Dashboard({ searchParams }: Pick<PageProps<"/[lang]/app">, "searchParams">) {
  const [me, locale, query] = await Promise.all([requireTutor(), getLocale(), searchParams]);
  const supabase = await createClient(); // request time from here: safe to read the clock
  const now = new Date();
  const todayKey = dateKeyOf(now);
  const view = query.view === "month" ? "month" : "week";
  const anchor = isDay(query.date) ? query.date : todayKey;

  // The calendar's range, plus what the metrics need (last week, the past 30 days, the next 60).
  const week = weekRange(anchor);
  const gridStartKey = view === "week" ? week.startKey : monthGridStart(anchor);
  const gridDays = view === "week" ? 7 : 42;
  const rangeStart = zonedDateTimeToUtc(gridStartKey, "00:00");
  const rangeEnd = zonedDateTimeToUtc(addDaysToDateKey(gridStartKey, gridDays), "00:00");
  const metricsStart = new Date(Math.min(weekRange(addDaysToDateKey(todayKey, -7)).start.getTime(), now.getTime() - 31 * 86_400_000));
  const loadFrom = new Date(Math.min(rangeStart.getTime(), metricsStart.getTime())).toISOString();
  const loadTo = new Date(Math.max(rangeEnd.getTime(), now.getTime() + 60 * 86_400_000)).toISOString();

  const [studentsRes, lessonsRes, sessionsRes, linksRes, draftsRes, unbilledRes, access] = await Promise.all([
    supabase.from("tutor_students").select("id, first_name, last_initial, year_level, subjects, goals").order("first_name").returns<StudentRow[]>(),
    supabase
      .from("tutor_lessons")
      .select("id, student_id, starts_at, duration_min, subjects, notes, meeting_link_id, status, session_id")
      .gte("starts_at", loadFrom)
      .lt("starts_at", loadTo)
      .order("starts_at")
      .returns<LessonRow[]>(),
    supabase
      .from("tutor_sessions")
      .select("id, student_id, starts_at, duration_min, rate_cents, subjects, tutor_reports(id)")
      .gte("starts_at", loadFrom)
      .lt("starts_at", loadTo)
      .returns<(Omit<SessionRow, "report_id"> & { tutor_reports: { id: string } | null })[]>(),
    supabase.from("tutor_meeting_links").select("id, name, url, student_id").order("name"),
    supabase.from("tutor_reports").select("id", { count: "exact", head: true }).is("sent_at", null),
    supabase.from("tutor_sessions").select("duration_min, rate_cents").is("invoice_id", null),
    accessFor(me.tutor),
  ]);
  const error = studentsRes.error ?? lessonsRes.error ?? sessionsRes.error ?? linksRes.error;
  const students = studentsRes.data ?? [];
  const lessons = lessonsRes.data ?? [];
  const sessions: SessionRow[] = (sessionsRes.data ?? []).map(({ tutor_reports, ...s }) => ({ ...s, report_id: tutor_reports?.id ?? null }));
  const names = new Map(students.map((s) => [s.id, studentName(s)]));
  const links: DashLink[] = (linksRes.data ?? []).map((l) => ({ id: l.id, name: l.name, url: l.url, studentId: l.student_id, studentName: l.student_id ? (names.get(l.student_id) ?? null) : null }));

  // Calendar items with Melbourne labels.
  const label = (iso: string) => formatInZone(iso, "h:mmaaa");
  const items: DashItem[] = calendarItems(lessons, sessions, names)
    .filter((i) => Date.parse(i.startsAt) >= rangeStart.getTime() && Date.parse(i.startsAt) < rangeEnd.getTime())
    .map((i) => {
      const [h, m] = formatInZone(i.startsAt, "HH:mm").split(":").map(Number);
      return {
        ...i,
        dateKey: dateKeyOf(i.startsAt),
        startMin: h * 60 + m,
        time24: formatInZone(i.startsAt, "HH:mm"),
        timeLabel: label(i.startsAt),
        endLabel: label(new Date(Date.parse(i.startsAt) + i.durationMin * 60_000).toISOString()),
        dayLabel: formatInZone(i.startsAt, "EEEE d MMMM"),
        isPast: Date.parse(i.startsAt) < now.getTime(),
      };
    });
  const anchorMonth = anchor.slice(0, 7);
  const days: DashDay[] = Array.from({ length: gridDays }, (_, n) => {
    const key = addDaysToDateKey(gridStartKey, n);
    const noon = zonedDateTimeToUtc(key, "12:00");
    return {
      key,
      weekday: formatInZone(noon, "EEE"),
      day: formatInZone(noon, "d"),
      label: formatInZone(noon, "EEE d MMM"),
      isToday: key === todayKey,
      inMonth: view === "week" || key.slice(0, 7) === anchorMonth,
    };
  });
  const startHours = items.map((i) => Math.floor(i.startMin / 60));
  const endHours = items.map((i) => Math.ceil((i.startMin + i.durationMin) / 60));
  const hours: [number, number] = [Math.min(7, ...startHours), Math.min(24, Math.max(21, ...endHours))];
  const href = (v: string, d: string) => appHref(`/app?view=${v}&date=${d}`, locale);
  const step = (dir: 1 | -1) =>
    view === "week" ? addDaysToDateKey(anchor, 7 * dir) : `${addDaysToDateKey(`${anchorMonth}-15`, 30 * dir).slice(0, 7)}-01`;
  const title =
    view === "week"
      ? `${formatInZone(zonedDateTimeToUtc(week.startKey, "12:00"), "d MMM")} – ${formatInZone(zonedDateTimeToUtc(addDaysToDateKey(week.startKey, 6), "12:00"), "d MMM yyyy")}`
      : formatInZone(zonedDateTimeToUtc(`${anchorMonth}-15`, "12:00"), "MMMM yyyy");

  // Metrics, students and things waiting on the tutor.
  const metrics = computeMetrics(lessons, sessions, now);
  const nextLesson = new Map<string, string>();
  for (const l of lessons) {
    if (l.status === "scheduled" && !l.session_id && Date.parse(l.starts_at) >= now.getTime() && !nextLesson.has(l.student_id)) nextLesson.set(l.student_id, l.starts_at);
  }
  const recentlyTaught = new Set(sessions.filter((s) => Date.parse(s.starts_at) >= now.getTime() - 30 * 86_400_000).map((s) => s.student_id));
  const overview = students
    .toSorted((a, b) => (Date.parse(nextLesson.get(a.id) ?? "9999") - Date.parse(nextLesson.get(b.id) ?? "9999")) || a.first_name.localeCompare(b.first_name))
    .slice(0, 5);
  const unlogged = lessons.filter((l) => l.status === "scheduled" && !l.session_id && Date.parse(l.starts_at) + l.duration_min * 60_000 < now.getTime()).length;
  const drafts = draftsRes.count ?? 0;
  const unbilled = unbilledRes.data ?? [];
  const unbilledCents = unbilled.reduce((sum, s) => sum + sessionCharge(s.duration_min, s.rate_cents), 0);
  const todayCount = items.filter((i) => i.dateKey === todayKey && i.status !== "cancelled").length;

  const hour = Number(formatInZone(now, "H"));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const feedUrl = me.tutor.calendar_feed_token ? `${await siteOrigin()}/api/tutor/calendar/${me.tutor.calendar_feed_token}.ics` : null;
  const lastFetched = me.tutor.calendar_feed_fetched_at ? formatInZone(me.tutor.calendar_feed_fetched_at, "'on' d MMM 'at' h:mmaaa") : null;

  return (
    <TutorShell tutor={me} title="Dashboard" current="today" wide hideTitle>
      <DashboardProvider
        students={students.map((s) => ({ id: s.id, name: studentName(s), subjects: s.subjects }))}
        links={links}
        todayKey={todayKey}
        logHref={appHref("/app/log", locale)}
        reportHref={appHref("/app/reports", locale)}
        studentsHref={appHref("/app/students#add", locale)}
      >
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-medium tracking-tight">
              {greeting}, {me.tutor.display_name.split(" ")[0]}
            </h1>
            <p className="text-ink-soft">
              {formatInZone(now, "EEEE d MMMM")} ·{" "}
              {todayCount ? `${todayCount} ${todayCount === 1 ? "lesson" : "lessons"} today` : "No lessons today"}
            </p>
          </div>
          <QuickActions logHref={appHref("/app/log", locale)} addStudentHref={appHref("/app/students#add", locale)} />
        </header>

        <PlanBanner access={access} />
        {error && (
          <p role="alert" className="rounded-md border border-pen px-3 py-2 text-sm text-pen">
            Some of your dashboard couldn&apos;t load. Refresh to try again.
          </p>
        )}
        {(unlogged > 0 || drafts > 0 || unbilled.length > 0) && (
          <ul aria-label="Waiting on you" className="flex flex-wrap gap-2 text-sm">
            {unlogged > 0 && (
              <li className="rounded-full border border-pen/60 px-3 py-1 text-pen">
                {unlogged} past {unlogged === 1 ? "lesson" : "lessons"} not logged (red in the calendar)
              </li>
            )}
            {drafts > 0 && (
              <li>
                <Link className="block rounded-full border border-hair bg-sheet px-3 py-1 hover:bg-paper-deep" href={appHref("/app/students", locale)}>
                  {drafts} {drafts === 1 ? "report" : "reports"} not sent yet
                </Link>
              </li>
            )}
            {unbilled.length > 0 && (
              <li>
                <Link className="block rounded-full border border-hair bg-sheet px-3 py-1 hover:bg-paper-deep" href={appHref("/app/invoices", locale)}>
                  {formatCents(unbilledCents)} unbilled · invoice it
                </Link>
              </li>
            )}
          </ul>
        )}

        <section aria-label="This week" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Active students" value={String(metrics.activeStudents)} note="Taught in 30 days or booked" />
          <Metric
            label="Earned this week"
            value={formatCents(metrics.earningsThisWeekCents).replace(/\.00$/, "")}
            note={`From logged sessions · last week ${formatCents(metrics.earningsLastWeekCents).replace(/\.00$/, "")}`}
            trend={metrics.earningsThisWeekCents - metrics.earningsLastWeekCents}
          />
          <Metric
            label="Lessons this week"
            value={String(metrics.lessonsThisWeek)}
            note={`Done and booked · last week ${metrics.lessonsLastWeek}`}
            trend={metrics.lessonsThisWeek - metrics.lessonsLastWeek}
          />
          <Metric label="Upcoming lessons" value={String(metrics.upcomingLessons)} note="Booked in the next 7 days" />
        </section>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <LessonCalendar
            view={view}
            title={title}
            days={days}
            items={items}
            hours={hours}
            nav={{
              prev: href(view, step(-1)),
              next: href(view, step(1)),
              today: href(view, todayKey),
              week: href("week", anchor),
              month: href("month", anchor),
            }}
          />

          <section aria-labelledby="students-title" className="flex flex-col gap-3 rounded-lg border border-hair bg-sheet p-4">
            <header className="flex items-baseline justify-between gap-3">
              <h2 id="students-title" className="text-lg font-medium">
                Students
              </h2>
              <Link className="text-sm text-ink-soft underline-offset-4 hover:text-ink hover:underline" href={appHref("/app/students", locale)}>
                View all{students.length > 5 ? ` ${students.length}` : ""} →
              </Link>
            </header>
            {overview.length ? (
              <ul className="flex flex-col divide-y divide-rule">
                {overview.map((s) => {
                  const next = nextLesson.get(s.id);
                  const active = Boolean(next) || recentlyTaught.has(s.id);
                  return (
                    <li key={s.id} className="flex flex-col gap-1 py-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <Link href={appHref(`/app/students/${s.id}`, locale)} className="font-medium underline-offset-4 hover:underline">
                          {studentName(s)}
                        </Link>
                        <span className="flex items-center gap-1.5 text-xs text-ink-soft">
                          <span className={`size-1.5 rounded-full ${active ? "bg-ink" : "bg-rule"}`} aria-hidden="true" />
                          {active ? "Active" : "No recent lessons"}
                        </span>
                      </div>
                      <p className="text-sm text-ink-soft">
                        {yearLabel(s.year_level)}
                        {s.subjects.length ? ` · ${s.subjects.join(", ")}` : ""}
                      </p>
                      {s.goals && <p className="text-sm">{s.goals}</p>}
                      <div className="flex items-center justify-between gap-2 text-xs text-ink-soft">
                        <span>{next ? `Next: ${formatInZone(next, "EEE d MMM, h:mmaaa")}` : "No lesson booked"}</span>
                        <StudentScheduleButton studentId={s.id} name={s.first_name} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="flex flex-col gap-2 rounded-md border border-dashed border-rule p-4 text-sm text-ink-soft">
                <p>No students yet. Add your first student to schedule lessons and write reports.</p>
                <Link className="font-medium text-ink underline-offset-4 hover:underline" href={appHref("/app/students#add", locale)}>
                  Add a student →
                </Link>
              </div>
            )}
          </section>
        </div>

        <div className="grid items-start gap-5 md:grid-cols-2">
          <MeetingLinks links={links} students={students.map((s) => ({ id: s.id, name: studentName(s), subjects: s.subjects }))} />
          <CalendarConnections feedUrl={feedUrl} lastFetched={lastFetched} />
        </div>
      </DashboardProvider>
    </TutorShell>
  );
}

function Metric({ label, value, note, trend }: { label: string; value: string; note: string; trend?: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-hair bg-sheet px-4 py-3">
      <span className="font-mono text-[11px] tracking-wider text-ink-soft uppercase">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="font-serif text-3xl tabular-nums">{value}</span>
        {trend !== undefined && trend !== 0 && (
          <span className={`text-xs ${trend > 0 ? "text-ink" : "text-ink-soft"}`} aria-label={trend > 0 ? "up on last week" : "down on last week"}>
            {trend > 0 ? "▲" : "▼"}
          </span>
        )}
      </span>
      <span className="text-xs text-ink-faint">{note}</span>
    </div>
  );
}
