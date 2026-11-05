import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { siteOrigin } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { calendarItems, computeMetrics, monthGridStart, nextAction, weekRange, type CalendarItem, type LessonRow, type SessionRow } from "@/lib/tutor/dashboard";
import { studentName } from "@/lib/tutor/format";
import { effectiveStatus, type InvoiceStatus } from "@/lib/tutor/invoice-data";
import { formatCents, sessionCharge } from "@/lib/tutor/invoice-math";
import { accessFor, requireTutor } from "@/lib/tutor/server";
import { addDaysToDateKey, dateKeyOf, formatInZone, zonedDateTimeToUtc } from "@/lib/time";
import { CalendarConnections } from "./_dashboard/calendar-connections";
import { LessonCalendar } from "./_dashboard/calendar";
import { DashboardProvider } from "./_dashboard/lesson-dialog";
import { MeetingLinks } from "./_dashboard/meeting-links";
import { QuickActions } from "./_dashboard/quick-actions";
import { StudentScheduleButton } from "./_dashboard/student-schedule-button";
import { UpcomingLessons, type UpcomingLesson } from "./_dashboard/upcoming";
import type { DashDay, DashItem, DashLink } from "./_dashboard/types";
import { PlanBanner } from "./_components/plan-banner";
import { TutorShell, appHref, yearLabel } from "./_components/shell";
import { CalendarCheck, CalendarClock, Users, Wallet, type LucideIcon } from "lucide-react";

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

  const [studentsRes, lessonsRes, sessionsRes, linksRes, draftsRes, unbilledRes, invoicesRes, access] = await Promise.all([
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
    supabase.from("tutor_invoices").select("status, total_cents, due_date").in("status", ["sent", "overdue"]).returns<{ status: InvoiceStatus; total_cents: number; due_date: string }[]>(),
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
  const toDash = (i: CalendarItem): DashItem => {
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
  };
  const allItems = calendarItems(lessons, sessions, names);
  const items: DashItem[] = allItems
    .filter((i) => Date.parse(i.startsAt) >= rangeStart.getTime() && Date.parse(i.startsAt) < rangeEnd.getTime())
    .map(toDash);
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
  // 8am–8pm unless lessons fall outside it: keeps the grid compact without hiding anything.
  const hours: [number, number] = [Math.min(8, ...startHours), Math.min(24, Math.max(20, ...endHours))];
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

  // Class link for a lesson: the one picked for it, else the student's own saved link, else the
  // tutor's general link when there's exactly one (a personal Zoom room).
  const generalLinks = links.filter((l) => !l.studentId);
  const linkFor = (meetingLinkId: string | null, studentId: string) =>
    links.find((l) => l.id === meetingLinkId) ??
    links.find((l) => l.studentId === studentId) ??
    (generalLinks.length === 1 ? generalLinks[0] : null);
  const tomorrowKey = addDaysToDateKey(todayKey, 1);
  const upcoming: UpcomingLesson[] = allItems
    .filter((i) => i.kind === "lesson" && i.status === "scheduled" && Date.parse(i.startsAt) + i.durationMin * 60_000 > now.getTime())
    .slice(0, 5)
    .map((i) => {
      const d = toDash(i);
      const link = linkFor(i.meetingLinkId, i.studentId);
      const live = Date.parse(i.startsAt) <= now.getTime();
      const dayWord = d.dateKey === todayKey ? "Today" : d.dateKey === tomorrowKey ? "Tomorrow" : formatInZone(i.startsAt, "EEE d MMM");
      return {
        item: d,
        when: `${dayWord}, ${d.timeLabel}–${d.endLabel}`,
        tag: live ? "now" : d.dateKey === todayKey ? "today" : d.dateKey === tomorrowKey ? "tomorrow" : null,
        url: link?.url ?? null,
        linkName: link?.name ?? null,
      };
    });

  // Money owed: sent invoices not yet paid, split by whether they're past due (Melbourne date).
  const outstanding = (invoicesRes.data ?? []).map((i) => ({ ...i, shown: effectiveStatus(i.status, i.due_date, todayKey) }));
  const overdue = outstanding.filter((i) => i.shown === "overdue");
  const outstandingCents = outstanding.reduce((n, i) => n + i.total_cents, 0);
  const overdueCents = overdue.reduce((n, i) => n + i.total_cents, 0);

  const next = nextAction({
    studentCount: students.length,
    lessons,
    linkUrl: (l) => linkFor(l.meeting_link_id, l.student_id)?.url ?? null,
    names,
    unloggedCount: lessons.filter((l) => l.status === "scheduled" && !l.session_id && Date.parse(l.starts_at) + l.duration_min * 60_000 < now.getTime()).length,
    unbilledCents: (unbilledRes.data ?? []).reduce((sum, s) => sum + sessionCharge(s.duration_min, s.rate_cents), 0),
    now,
  });
  const dayMonth = (key: string) => formatInZone(zonedDateTimeToUtc(key, "12:00"), "d MMM");

  const hour = Number(formatInZone(now, "H"));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const feedUrl = me.tutor.calendar_feed_token ? `${await siteOrigin()}/api/tutor/calendar/${me.tutor.calendar_feed_token}.ics` : null;
  const lastFetched = me.tutor.calendar_feed_fetched_at ? formatInZone(me.tutor.calendar_feed_fetched_at, "'on' d MMM 'at' h:mmaaa") : null;

  return (
    <TutorShell tutor={me} title="Dashboard" current="today" wide hideTitle>
      <div className="dash flex flex-col gap-6">
      <DashboardProvider
        students={students.map((s) => ({ id: s.id, name: studentName(s), subjects: s.subjects }))}
        links={links}
        todayKey={todayKey}
        logHref={appHref("/app/log", locale)}
        reportHref={appHref("/app/reports", locale)}
        studentsHref={appHref("/app/students#add", locale)}
      >
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-1.5">
            <span className="dash-label">{formatInZone(now, "EEEE d MMMM")}</span>
            <h1 className="text-[2rem] leading-tight font-medium tracking-tight sm:text-4xl">
              {greeting}, {me.tutor.display_name.split(" ")[0]}
            </h1>
            <p className="text-ink-soft">
              {todayCount ? (
                <>
                  You have <span className="font-medium text-[var(--dash-accent-text)]">{todayCount} {todayCount === 1 ? "lesson" : "lessons"}</span> today.
                </>
              ) : (
                "No lessons today."
              )}
            </p>
          </div>
          <QuickActions
            next={next}
            logHref={appHref("/app/log", locale)}
            addStudentHref={appHref("/app/students#add", locale)}
            invoicesHref={appHref("/app/invoices", locale)}
          />
        </header>

        <PlanBanner access={access} />
        {error && (
          <p role="alert" className="rounded-md border border-pen px-3 py-2 text-sm text-pen">
            Some of your dashboard couldn&apos;t load. Refresh to try again.
          </p>
        )}
        {(unlogged > 0 || drafts > 0 || unbilled.length > 0) && (
          <ul aria-label="Waiting on you" className="flex flex-wrap items-center gap-2">
            <li className="dash-label mr-1">Waiting on you</li>
            {unlogged > 0 && (
              <li className="dash-pill dash-pill--accent">
                <span className="dash-dot" aria-hidden="true" />
                {unlogged} past {unlogged === 1 ? "lesson" : "lessons"} not logged
              </li>
            )}
            {drafts > 0 && (
              <li>
                <Link className="dash-pill" href={appHref("/app/students", locale)}>
                  {drafts} {drafts === 1 ? "report" : "reports"} not sent yet
                </Link>
              </li>
            )}
            {unbilled.length > 0 && (
              <li>
                <Link className="dash-pill" href={appHref("/app/invoices", locale)}>
                  {formatCents(unbilledCents)} unbilled · invoice it
                </Link>
              </li>
            )}
          </ul>
        )}

        <section aria-label="This week" className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4" data-testid="metrics">
          <Metric icon={Users} label="Active students" value={String(metrics.activeStudents)} note="Taught in the last 30 days or booked" />
          <Metric
            icon={Wallet}
            label="Earned this week"
            value={formatCents(metrics.earningsThisWeekCents).replace(/\.00$/, "")}
            note={`Logged sessions, ${dayMonth(metrics.weekStartKey)} – ${dayMonth(metrics.weekEndKey)}`}
            trend={
              metrics.hasLastWeek
                ? {
                    delta: metrics.earningsThisWeekCents - metrics.earningsLastWeekCents,
                    text: `${formatCents(Math.abs(metrics.earningsThisWeekCents - metrics.earningsLastWeekCents)).replace(/\.00$/, "")} compared with last week`,
                  }
                : undefined
            }
          />
          <Metric
            icon={CalendarCheck}
            label="Lessons completed"
            value={String(metrics.lessonsCompletedThisWeek)}
            note="Logged this week"
            trend={
              metrics.hasLastWeek
                ? {
                    delta: metrics.lessonsCompletedThisWeek - metrics.lessonsCompletedLastWeek,
                    text: `${Math.abs(metrics.lessonsCompletedThisWeek - metrics.lessonsCompletedLastWeek)} compared with last week`,
                  }
                : undefined
            }
          />
          <Metric icon={CalendarClock} label="Upcoming lessons" value={String(metrics.upcomingLessons)} note="Scheduled in the next 7 days" />
        </section>

        {/* Phones and tablets: calendar, then the side panels, then calendar sync. Desktop: sync sits under the calendar. */}
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-w-0 flex-col gap-5 lg:col-start-1 lg:row-start-1">
          <LessonCalendar
              view={view}
              title={title}
              days={days}
              items={items}
              hours={hours}
              nowMin={days.some((d) => d.isToday) ? Number(formatInZone(now, "H")) * 60 + Number(formatInZone(now, "m")) : null}
              nav={{
                prev: href(view, step(-1)),
                next: href(view, step(1)),
                today: href(view, todayKey),
                week: href("week", anchor),
                month: href("month", anchor),
              }}
            />
          </div>

          {/* Side column: what's next, who you teach, money owed, class links. Two columns on tablets. */}
          <div className="grid items-start gap-5 md:grid-cols-2 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:grid-cols-1">
            <UpcomingLessons lessons={upcoming} />
          <section aria-labelledby="students-title" className="dash-card flex flex-col gap-3 p-4 sm:p-5" data-testid="students-panel">
              <header className="flex items-end justify-between gap-3">
                <div className="flex flex-col">
                  <span className="dash-label">Who you teach</span>
                  <h2 id="students-title" className="text-xl font-medium">
                    Students
                  </h2>
                </div>
                <Link className="dash-link" href={appHref("/app/students", locale)}>
                  View all{students.length > 5 ? ` ${students.length}` : ""} →
                </Link>
              </header>
              {overview.length ? (
                <ul className="-mx-2 flex flex-col gap-1">
                  {overview.map((s) => {
                    const next = nextLesson.get(s.id);
                    const active = Boolean(next) || recentlyTaught.has(s.id);
                    return (
                      <li key={s.id} className="dash-row flex gap-3 px-2 py-2.5">
                        <span className="dash-avatar" aria-hidden="true">
                          {s.first_name.slice(0, 1)}
                          {s.last_initial}
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <Link href={appHref(`/app/students/${s.id}`, locale)} className="font-medium underline-offset-4 hover:underline">
                              {studentName(s)}
                            </Link>
                            <span className={`dash-ui flex items-center gap-1.5 text-[11px] font-medium ${active ? "text-[var(--dash-accent-text)]" : "text-ink-faint"}`}>
                              <span className={`size-1.5 rounded-full ${active ? "bg-[var(--dash-accent)]" : "bg-[var(--dash-border-strong)]"}`} aria-hidden="true" />
                              {active ? "Active" : "No recent lessons"}
                            </span>
                          </div>
                          <p className="dash-ui text-xs text-ink-faint">
                            {yearLabel(s.year_level)}
                            {s.subjects.length ? ` · ${s.subjects.join(", ")}` : ""}
                          </p>
                          <div className="dash-ui flex items-center justify-between gap-2 text-xs text-ink-soft">
                            <span className="truncate whitespace-nowrap">{next ? `Next · ${formatInZone(next, "EEE d MMM, h:mmaaa")}` : "No lesson booked"}</span>
                            <StudentScheduleButton studentId={s.id} name={s.first_name} />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="dash-inset flex flex-col gap-2 border-dashed p-4 text-sm text-ink-soft">
                  <p>No students yet. Add your first student to schedule lessons and write reports.</p>
                  <Link className="dash-link" href={appHref("/app/students#add", locale)}>
                    Add a student →
                  </Link>
                </div>
              )}
            </section>
            <Payments
              outstandingCents={outstandingCents}
              outstandingCount={outstanding.length}
              overdueCents={overdueCents}
              overdueCount={overdue.length}
              unbilledCents={unbilledCents}
              invoicesHref={appHref("/app/invoices", locale)}
            />
            <MeetingLinks links={links} students={students.map((s) => ({ id: s.id, name: studentName(s), subjects: s.subjects }))} />
          </div>

          <div className="min-w-0 lg:col-start-1 lg:row-start-2">
            <CalendarConnections feedUrl={feedUrl} lastFetched={lastFetched} />
          </div>
        </div>
      </DashboardProvider>
      </div>
    </TutorShell>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  note,
  trend,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
  trend?: { delta: number; text: string };
}) {
  return (
    <div className="dash-card dash-metric flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="dash-label">{label}</span>
        <span className="dash-metric-icon" aria-hidden="true">
          <Icon size={16} strokeWidth={2} />
        </span>
      </div>
      <span className="font-serif text-[2.25rem] leading-none tracking-tight tabular-nums">{value}</span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {trend && trend.delta !== 0 && (
          <span className={`dash-trend ${trend.delta > 0 ? "dash-trend--up" : ""}`}>
            <span aria-hidden="true">{trend.delta > 0 ? "↑" : "↓"}</span>
            <span className="sr-only">{trend.delta > 0 ? "Up" : "Down"}</span>
            {trend.text}
          </span>
        )}
        {trend && trend.delta === 0 && <span className="dash-trend">Same as last week</span>}
        <span className="dash-ui text-xs text-ink-faint">{note}</span>
      </span>
    </div>
  );
}

/** Money owed (dashboard review §6): from sent invoices only; logged work not yet invoiced is shown apart. */
function Payments({
  outstandingCents,
  outstandingCount,
  overdueCents,
  overdueCount,
  unbilledCents,
  invoicesHref,
}: {
  outstandingCents: number;
  outstandingCount: number;
  overdueCents: number;
  overdueCount: number;
  unbilledCents: number;
  invoicesHref: string;
}) {
  const money = (c: number) => formatCents(c).replace(/\.00$/, "");
  return (
    <section aria-labelledby="payments-title" className="dash-card flex flex-col gap-3 p-4 sm:p-5" data-testid="payments-panel">
      <header className="flex items-end justify-between gap-3">
        <div className="flex flex-col">
          <span className="dash-label">Invoices</span>
          <h2 id="payments-title" className="text-xl font-medium">
            Outstanding payments
          </h2>
        </div>
        <Link className="dash-link" href={invoicesHref}>
          View all →
        </Link>
      </header>
      {outstandingCount ? (
        <>
          <p className="flex items-baseline gap-2">
            <span className="font-serif text-3xl leading-none tabular-nums">{money(outstandingCents)}</span>
            <span className="dash-ui text-xs text-ink-soft">
              owed on {outstandingCount} {outstandingCount === 1 ? "invoice" : "invoices"}
            </span>
          </p>
          <ul className="dash-ui flex flex-col gap-1.5 text-sm">
            {outstandingCount - overdueCount > 0 && (
              <li className="flex items-center justify-between gap-2">
                <span className="dash-tag dash-tag--blue">Not yet due</span>
                <span className="tabular-nums">{money(outstandingCents - overdueCents)}</span>
              </li>
            )}
            {overdueCount > 0 && (
              <li className="flex items-center justify-between gap-2">
                <span className="dash-tag dash-tag--now">
                  {overdueCount} overdue
                </span>
                <span className="font-semibold text-[var(--dash-accent-text)] tabular-nums">{money(overdueCents)}</span>
              </li>
            )}
          </ul>
        </>
      ) : (
        <p className="dash-ui flex items-center gap-2 text-sm text-ink-soft">
          <span className="dash-tag dash-tag--green">All paid</span> Nothing outstanding on sent invoices.
        </p>
      )}
      {unbilledCents > 0 && (
        <p className="dash-ui text-xs text-ink-soft">
          Plus {money(unbilledCents)} of logged lessons not invoiced yet.{" "}
          <Link className="dash-link" href={invoicesHref}>
            Invoice it
          </Link>
        </p>
      )}
    </section>
  );
}
