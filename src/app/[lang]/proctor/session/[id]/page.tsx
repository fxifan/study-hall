import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppShell, AppShellFallback } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { localizePath } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { fill } from "@/i18n/fill";
import { getDateLocale, getDictionary, getLocale } from "@/i18n/server";
import { requireRole } from "@/lib/auth";
import { breakoutMinutes, breakoutMinutesByStudent, type LoggedBreakout } from "@/lib/breakouts";
import { sessionWindow } from "@/lib/session-timer";
import { createClient } from "@/lib/supabase/server";
import { MELBOURNE, formatInZone } from "@/lib/time";
import { addCheckIn, endBreakout } from "../../actions";
import { LiveRefresh } from "@/components/live-refresh";
import { getParentReports } from "@/lib/parent-reports";
import { BreakoutForm } from "./breakout-form";
import { HelpQueue, ReportReview, StudentControls, type Attendance, type Flag, type HelpRow } from "./live";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).roles.proctor };
}

export default async function SessionRosterPage({ params }: PageProps<"/[lang]/proctor/session/[id]">) {
  const t = await getDictionary();
  return (
    <Suspense fallback={<AppShellFallback label={t.common.loading} />}>
      <SessionRoster params={params} />
    </Suspense>
  );
}

type PlanRow = {
  id: string;
  student_id: string;
  text: string;
  subject: string | null;
  outcome: "done" | "partial" | "not_done" | null;
  result: string | null;
  goal_evidence: { id: string; file_name: string }[];
};
type CheckIn = { id: string; student_id: string; template_en: string | null; template_zh: string | null; note: string | null; created_at: string };
type Template = { id: string; kind: string; text_en: string; text_zh: string };

type RosterRow = {
  student_id: string;
  first_name: string;
  last_initial: string;
  year_level: number;
  study_note: string | null;
  tutoring: boolean;
  subjects: { name: string; help: boolean }[];
};

/** The session's students with their subjects and current-work notes, so staff can prepare. */
async function SessionRoster({ params }: Pick<PageProps<"/[lang]/proctor/session/[id]">, "params">) {
  const [profile, t, locale, dateLocale, { id }] = await Promise.all([
    requireRole("proctor"),
    getDictionary(),
    getLocale(),
    getDateLocale(),
    params,
  ]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  // RLS: staff only see sessions they're assigned to; the roster and breakout functions check the same.
  const [
    { data: session },
    { data: roster },
    { data: breakoutRows },
    { data: adultRows },
    { data: plans },
    { data: checkIns },
    { data: templates },
    { data: attendance },
    { data: flags },
    { data: help },
    { data: reports },
    { data: studentLogins },
    reportCards,
  ] = await Promise.all([
    supabase.from("sessions").select("id, starts_at, ends_at, status, rooms(name)").eq("id", id).maybeSingle<{
      id: string;
      starts_at: string;
      ends_at: string;
      status: string;
      rooms: { name: string } | null;
    }>(),
    supabase.rpc("session_roster", { p_session: id }),
    supabase.rpc("session_breakouts", { p_session: id }),
    supabase.rpc("breakout_adults", { p_session: id }),
    // Each student's plan and uploads, to compare with the work in the room (staff RLS).
    supabase
      .from("goals")
      .select("id, student_id, text, subject, outcome, result, goal_evidence(id, file_name)")
      .eq("session_id", id)
      .order("position")
      .returns<PlanRow[]>(),
    supabase
      .from("session_checkins")
      .select("id, student_id, template_en, template_zh, note, created_at")
      .eq("session_id", id)
      .order("created_at")
      .returns<CheckIn[]>(),
    supabase.from("report_templates").select("id, kind, text_en, text_zh").order("sort").returns<Template[]>(),
    supabase.from("attendance").select("student_id, status, check_in_at").eq("session_id", id).returns<Attendance[]>(),
    supabase.from("focus_flags").select("id, student_id, type, created_at").eq("session_id", id).order("created_at").returns<Flag[]>(),
    // Tutoring students first, then oldest (help_requests_queue_idx).
    supabase
      .from("help_requests")
      .select("id, student_id, subject, description, status, priority, created_at, messages(id, sender_id, body, created_at)")
      .eq("session_id", id)
      .order("priority", { ascending: false })
      .order("created_at")
      .returns<HelpRow[]>(),
    supabase.from("reports").select("student_id, status, proctor_comment").eq("session_id", id),
    supabase.from("enrolments").select("students(profile_id)").eq("session_id", id).returns<{ students: { profile_id: string | null } | null }[]>(),
    getParentReports(supabase, { sessionId: id, includeUnreleased: true }),
  ]);
  if (!session) notFound();
  const s = t.proctor.session;
  const students: RosterRow[] = roster ?? [];
  const breakouts: LoggedBreakout[] = breakoutRows ?? [];
  const breakoutTotals = breakoutMinutesByStudent(breakouts, session.ends_at);
  const helpRows = help ?? [];
  const names = students.map((r): [string, string] => [r.student_id, `${r.first_name} ${r.last_initial}.`]);
  const clock = (iso: string) => formatInZone(iso, t.formats.time, MELBOURNE, dateLocale);
  const when = `${formatInZone(session.starts_at, t.formats.longDate, MELBOURNE, dateLocale)}, ${formatInZone(session.starts_at, t.formats.time, MELBOURNE, dateLocale)}`;
  // Same window as check-in and public.start_breakout.
  const open = session.status !== "cancelled" && sessionWindow(session.starts_at, session.ends_at).open;

  return (
    <AppShell profile={profile} title={`${session.rooms?.name ?? t.proctor.room} · ${when}`}>
      <Link href={localizePath("/proctor", locale)} className="text-sm text-ink-soft underline-offset-4 hover:underline">
        ← {s.back}
      </Link>
      {open && <LiveRefresh />}
      <p className="font-mono text-sm text-ink-soft" data-testid="live-summary">
        {fill(s.summary, { count: students.length, tutoring: students.filter((r) => r.tutoring).length })} ·{" "}
        {fill(s.live.joined, { joined: (attendance ?? []).filter((a) => a.check_in_at).length, total: students.length })} ·{" "}
        {fill(s.live.openHelp, { n: helpRows.filter((h) => h.status === "open").length })}
      </p>
      <HelpQueue
        help={helpRows.filter((h) => h.status !== "resolved").concat(helpRows.filter((h) => h.status === "resolved"))}
        names={new Map(names)}
        studentProfiles={new Set((studentLogins ?? []).flatMap((e) => (e.students?.profile_id ? [e.students.profile_id] : [])))}
        profileId={profile.id}
        t={s.live}
        time={clock}
      />
      <Breakouts
        sessionId={session.id}
        endsAt={session.ends_at}
        open={open}
        breakouts={breakouts}
        adults={adultRows ?? []}
        students={students.map((r) => ({ id: r.student_id, name: `${r.first_name} ${r.last_initial}.` }))}
        t={s.breakouts}
        time={(iso) => formatInZone(iso, t.formats.time, MELBOURNE, dateLocale)}
      />
      {students.length ? (
        <ul className="divide-y divide-rule rounded-md border border-hair bg-sheet" data-testid="roster">
          {students.map((r) => (
            <li key={r.student_id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="font-medium">
                  {r.first_name} {r.last_initial}.
                </span>
                <span className="font-mono text-xs text-ink-soft">{fill(t.student.year, { year: r.year_level })}</span>
                {r.tutoring && (
                  <span className="rounded-full border border-pen-faint px-2 font-mono text-xs text-pen">{s.tutoring}</span>
                )}
                {(breakoutTotals.get(r.student_id) ?? 0) > 0 && (
                  <span className="font-mono text-xs text-ink-soft">
                    {fill(s.breakoutTime, { minutes: breakoutTotals.get(r.student_id) ?? 0 })}
                  </span>
                )}
              </div>
              {r.subjects.length ? (
                <ul className="flex flex-wrap gap-1.5 text-sm">
                  {r.subjects.map((sub) => (
                    <li
                      key={sub.name}
                      className={`rounded-md border px-2 py-0.5 ${sub.help ? "border-pen-faint text-pen" : "border-hair text-ink-soft"}`}
                    >
                      {sub.name}
                      {sub.help && <span className="ml-1 font-mono text-xs">· {s.help}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-faint">{s.noSubjects}</p>
              )}
              {r.study_note && (
                <p className="text-sm">
                  <span className="text-ink-soft">{s.note}:</span> {r.study_note}
                </p>
              )}
              <StudentControls
                ids={{ sessionId: session.id, studentId: r.student_id }}
                name={`${r.first_name} ${r.last_initial}.`}
                attendance={attendance?.find((a) => a.student_id === r.student_id)}
                flags={(flags ?? []).filter((f) => f.student_id === r.student_id)}
                t={s.live}
                time={clock}
              />
              <StudentPlan
                sessionId={session.id}
                studentId={r.student_id}
                plan={(plans ?? []).filter((g) => g.student_id === r.student_id)}
                checkIns={(checkIns ?? []).filter((c) => c.student_id === r.student_id)}
                templates={templates ?? []}
                locale={locale}
                t={t}
                time={(iso) => formatInZone(iso, t.formats.time, MELBOURNE, dateLocale)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-soft">{s.empty}</p>
      )}
      {students.length > 0 && (
        <ReportReview
          sessionId={session.id}
          students={names.map(([studentId, name]) => ({ id: studentId, name }))}
          cards={reportCards}
          reports={reports ?? []}
          locale={locale}
          t={s.review}
        />
      )}
      <p className="text-xs text-ink-faint">{s.privacy}</p>
    </AppShell>
  );
}

/**
 * One student's session plan (tasks, how they marked them, uploads) next to the supervisor's
 * check-ins, with a quick form to add one from a template or as a short note.
 */
function StudentPlan({
  sessionId,
  studentId,
  plan,
  checkIns,
  templates,
  locale,
  t,
  time,
}: {
  sessionId: string;
  studentId: string;
  plan: PlanRow[];
  checkIns: CheckIn[];
  templates: Template[];
  locale: "en" | "zh";
  t: Dictionary;
  time: (iso: string) => string;
}) {
  const s = t.proctor.session;
  return (
    <div className="grid gap-3 rounded-md bg-paper-deep/40 p-3 text-sm md:grid-cols-2" data-testid={`plan-${studentId}`}>
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-xs tracking-widest text-ink-soft uppercase">{s.plan}</h3>
        {plan.length ? (
          <ul className="flex flex-col gap-1">
            {plan.map((g) => (
              <li key={g.id}>
                {g.subject && <span className="text-ink-soft">{g.subject} · </span>}
                {g.text}
                <span className="ml-2 font-mono text-xs text-ink-soft">
                  {t.reportCard.outcomes[g.outcome ?? "unmarked"]}
                  {g.result && ` · ${g.result}`}
                </span>
                {g.goal_evidence.map((e) => (
                  <a key={e.id} href={`/api/evidence/${e.id}`} target="_blank" rel="noreferrer" className="ml-2 text-xs underline underline-offset-4">
                    {e.file_name}
                  </a>
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-faint">{s.noPlan}</p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-xs tracking-widest text-ink-soft uppercase">{s.checkIns}</h3>
        {checkIns.map((c) => (
          <p key={c.id}>
            <span className="font-mono text-xs text-ink-soft">{time(c.created_at)}</span>{" "}
            {c.template_en && (locale === "zh" ? c.template_zh : c.template_en)}
            {c.template_en && c.note && " "}
            {c.note}
          </p>
        ))}
        <form action={addCheckIn} className="flex flex-col gap-1.5" aria-label={s.addCheckIn}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="studentId" value={studentId} />
          <select name="templateId" aria-label={s.checkInTemplate} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">
            <option value="">{s.checkInNoTemplate}</option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {locale === "zh" ? tpl.text_zh : tpl.text_en}
              </option>
            ))}
          </select>
          <input
            name="note"
            maxLength={200}
            aria-label={s.checkInNote}
            placeholder={s.checkInNote}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          />
          <Button type="submit" variant="outline" size="sm" className="self-start">
            {s.addCheckIn}
          </Button>
          <p className="text-xs text-ink-faint">{s.checkInHelp}</p>
        </form>
      </div>
    </div>
  );
}

/** The Zoom breakout log: the rule, the form while the session runs, and what's been logged. */
function Breakouts({
  sessionId,
  endsAt,
  open,
  breakouts,
  adults,
  students,
  t,
  time,
}: {
  sessionId: string;
  endsAt: string;
  open: boolean;
  breakouts: LoggedBreakout[];
  adults: { id: string; name: string; session_role: "tutor" | "supervisor" | null }[];
  students: { id: string; name: string }[];
  t: Dictionary["proctor"]["session"]["breakouts"];
  time: (iso: string) => string;
}) {
  const busyStudentIds = breakouts.filter((b) => !b.ended_at).flatMap((b) => b.students.map((s) => s.id));
  return (
    <section className="flex flex-col gap-3 rounded-md border border-hair bg-sheet px-4 py-3" data-testid="breakouts">
      <h2 className="font-medium">{t.heading}</h2>
      <p className="text-sm font-medium text-pen">{t.rule}</p>
      {open ? (
        adults.length ? (
          <>
            <p className="text-sm text-ink-soft">{t.howTo}</p>
            <BreakoutForm
              key={breakouts.length}
              sessionId={sessionId}
              adults={adults}
              students={students}
              busyStudentIds={busyStudentIds}
              t={t}
            />
          </>
        ) : (
          <p className="text-sm text-ink-soft">{t.noAdults}</p>
        )
      ) : (
        <p className="text-sm text-ink-soft">{t.closed}</p>
      )}
      {breakouts.length ? (
        <ul className="divide-y divide-rule border-t border-rule text-sm" data-testid="breakout-list">
          {breakouts.map((b) => (
            <li key={b.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
              <span className="font-mono text-xs text-ink-soft">
                {b.ended_at
                  ? fill(t.range, { start: time(b.started_at), end: time(b.ended_at), minutes: breakoutMinutes(b, endsAt) })
                  : fill(t.open, { start: time(b.started_at) })}
              </span>
              <span>{b.students.map((s) => s.name).join(", ")}</span>
              <span className="text-ink-soft">
                {b.second_adult_name
                  ? fill(t.withSecond, { name: b.adult_name, second: b.second_adult_name })
                  : fill(t.runBy, { name: b.adult_name })}
              </span>
              {!b.ended_at && (
                <form action={endBreakout} className="ml-auto">
                  <input type="hidden" name="breakoutId" value={b.id} />
                  <Button type="submit" variant="outline" size="sm">
                    {t.end}
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-faint">{t.empty}</p>
      )}
    </section>
  );
}
