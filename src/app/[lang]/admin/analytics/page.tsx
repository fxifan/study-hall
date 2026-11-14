import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppShellFallback } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { overview, studyHall, tutorPays, tutorsMetrics, withConversion, type Range } from "@/lib/analytics";
import { loadAnalytics } from "@/lib/analytics-data";
import { EVENTS } from "@/lib/events";
import { formatAudCents } from "@/lib/tutor/costs";
import { addDaysToDateKey, dateKeyOf, formatInZone, zonedDateTimeToUtc } from "@/lib/time";
import { AdminFrame, fieldClass } from "../admin-frame";
import { edumiMetrics } from "@/lib/social/analytics";
import { loadEdumiRows } from "@/lib/social/analytics-load";

export const metadata: Metadata = { title: "Analytics" };

/**
 * /admin/analytics (coding action plan §5): Edumi's business and product numbers, split by product
 * (Edumi Study Hall, Edumi for Tutors) with an overview on top. Real records and server-side events
 * only; test accounts are excluded in the loader. "Not tracked" means the product doesn't collect
 * that data yet, which is different from zero.
 */
export default function AnalyticsPage({ searchParams }: PageProps<"/[lang]/admin/analytics">) {
  return (
    <Suspense fallback={<AppShellFallback label="Loading…" />}>
      <Analytics searchParams={searchParams} />
    </Suspense>
  );
}

const TABS = [
  ["overview", "Overview"],
  ["edumi", "Edumi students"],
  ["study-hall", "Study Hall"],
  ["tutors", "Edumi for Tutors"],
  ["operations", "Operations"],
  ["accounts", "Accounts"],
] as const;
type Tab = (typeof TABS)[number][0];
const PRESETS = ["7", "30", "90"] as const;
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

function parseRange(q: Record<string, string | string[] | undefined>, now: Date): { range: Range; label: string; key: string; fromKey: string; toKey: string } {
  const today = dateKeyOf(now);
  if (q.range === "custom" && isDay(q.from) && isDay(q.to) && q.from <= q.to) {
    return {
      range: { from: zonedDateTimeToUtc(q.from, "00:00"), to: zonedDateTimeToUtc(addDaysToDateKey(q.to, 1), "00:00") },
      label: `${q.from} to ${q.to}`,
      key: "custom",
      fromKey: q.from,
      toKey: q.to,
    };
  }
  const days = PRESETS.includes(q.range as (typeof PRESETS)[number]) ? Number(q.range) : 30;
  const fromKey = addDaysToDateKey(today, -(days - 1));
  return {
    range: { from: zonedDateTimeToUtc(fromKey, "00:00"), to: zonedDateTimeToUtc(addDaysToDateKey(today, 1), "00:00") },
    label: `Last ${days} days (${fromKey} to ${today})`,
    key: String(days),
    fromKey,
    toKey: today,
  };
}

const pct = (r: number | null) => (r === null ? null : `${Math.round(r * 1000) / 10}%`);
const money = (c: number) => formatAudCents(c).replace(/\.00$/, "");

async function Analytics({ searchParams }: Pick<PageProps<"/[lang]/admin/analytics">, "searchParams">) {
  await requireRole("admin"); // before the service-role reads
  const query = await searchParams;
  const now = new Date();
  const tab: Tab = TABS.some(([k]) => k === query.tab) ? (query.tab as Tab) : "overview";
  const { range, label, key, fromKey, toKey } = parseRange(query, now);
  const [data, edumiRows] = await Promise.all([loadAnalytics(range), tab === "edumi" ? loadEdumiRows(range.from) : null]);
  const ed = edumiRows ? edumiMetrics(edumiRows, range, now) : null;
  const tm = tutorsMetrics({
    tutors: data.tutors,
    reports: data.tutorReports,
    students: data.tutorStudents,
    invoices: data.tutorInvoices,
    lessons: data.tutorLessons,
    resources: data.tutorResources,
    events: data.events,
    range,
    now,
  });
  const sh = studyHall({ attendance: data.attendance, sessions: data.sessions, reports: data.shReports, subscriptions: data.subscriptions, range, now });
  const activeTutorIds = [
    ...data.tutorReports,
    ...data.tutorStudents,
    ...data.tutorInvoices,
    ...data.tutorLessons,
    ...data.tutorResources,
  ]
    .filter((r) => Date.parse(r.created_at) >= range.from.getTime() && Date.parse(r.created_at) < range.to.getTime())
    .map((r) => r.tutor_id);
  const activeStudentKeys = data.attendance
    .filter((a) => a.present && Date.parse(a.starts_at) >= range.from.getTime() && Date.parse(a.starts_at) < range.to.getTime())
    .map((a) => `student:${a.student_id}`);
  const ov = overview({
    accounts: data.accounts,
    subscriptions: data.subscriptions,
    tutors: data.tutors,
    events: data.events,
    activeFromRecords: [...activeTutorIds, ...activeStudentKeys],
    range,
    now,
  });
  const trackedSince = data.events.length ? data.events.reduce((m, e) => (e.created_at < m ? e.created_at : m), data.events[0].created_at) : null;
  const href = (params: Record<string, string>) => {
    const p = new URLSearchParams({ tab, range: key, ...(key === "custom" ? { from: fromKey, to: toKey } : {}), ...params });
    return `?${p}`;
  };

  return (
    <AdminFrame title="Analytics" current="analytics">
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap items-end gap-2">
          {PRESETS.map((d) => (
            <Link key={d} href={href({ range: d })} className={`dash-pill ${key === d ? "dash-pill--accent" : ""}`} aria-current={key === d ? "true" : undefined}>
              Last {d} days
            </Link>
          ))}
          <form className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="tab" value={tab} />
            <input type="hidden" name="range" value="custom" />
            <label className="flex flex-col gap-1 text-xs">
              From
              <input type="date" name="from" defaultValue={fromKey} className={fieldClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              To
              <input type="date" name="to" defaultValue={toKey} className={fieldClass} />
            </label>
            <Button type="submit" size="sm" variant="outline">
              Apply
            </Button>
          </form>
        </div>
        <p className="text-xs text-ink-soft" data-testid="analytics-period">
          Period: {label}, Melbourne time. Updated {formatInZone(now, "d MMM yyyy, h:mmaaa")} (live from the database). Test accounts excluded.
          {trackedSince ? ` Event tracking since ${formatInZone(trackedSince, "d MMM yyyy")}.` : " No tracked events yet."}
        </p>
        <nav aria-label="Analytics sections" className="flex flex-wrap gap-1 border-b border-rule pb-2">
          {TABS.map(([k, name]) => (
            <Link key={k} href={href({ tab: k })} aria-current={tab === k ? "page" : undefined} className={`rounded-md px-3 py-1.5 ${tab === k ? "bg-brand-soft font-medium text-brand" : "text-ink-soft hover:text-ink"}`}>
              {name}
            </Link>
          ))}
        </nav>
      </div>

      {tab === "overview" && (
        <>
          <Grid>
            <Stat label="Registered accounts" value={ov.registered.parents + ov.registered.students + ov.registered.tutors} note={`${ov.registered.parents} parents · ${ov.registered.students} students · ${ov.registered.tutors} tutors`} />
            <Stat label="New registrations" value={ov.newRegistrations.parents + ov.newRegistrations.students + ov.newRegistrations.tutors} note={`${ov.newRegistrations.parents} parents · ${ov.newRegistrations.students} students · ${ov.newRegistrations.tutors} tutors`} />
            <Stat label="Active users" value={ov.activeUsers} note="Did something meaningful (not just a login)" />
            <Stat label="MRR" value={money(ov.mrrCents.total)} note={`${money(ov.mrrCents.families)} families · ${money(ov.mrrCents.tutors)} tutors`} />
            <Stat label="Paying families" value={ov.payingFamilies} note="Active Stripe subscriptions" />
            <Stat label="Paying tutors" value={ov.payingTutors} note="Solo through Stripe" />
            <Stat label="Tutor trials active" value={ov.activeTrials} />
            <Stat label="New paying customers" value={ov.newPaying} />
            <Stat label="Cancellations" value={ov.cancellations} />
            <Stat label="Family churn" value={pct(ov.familyChurn.rate)} note={`${ov.familyChurn.cancelled} of ${ov.familyChurn.atStart} paying at the start`} />
            <Stat label="Needs billing attention" value={ov.billingAttention} note="Subscriptions past due or unpaid now" warn={ov.billingAttention > 0} />
            <Stat label="Failed payments" value={ov.failedPayments} note="Past-due events in the period" />
          </Grid>
          <Glossary />
        </>
      )}

      {tab === "edumi" && ed && (
        <>
          <h2 className="text-lg font-medium">Acquisition and plans</h2>
          <Grid>
            <Stat label="Student sign-ups" value={ed.acquisition.signups} note="Students 13+ who signed themselves up" />
            <Stat label="Trials started" value={ed.acquisition.trialsStarted} />
            <Stat label="On trial now" value={ed.acquisition.trialing} />
            <Stat label="Students with groups on" value={ed.acquisition.enabled} note="Self sign-ups plus children a parent switched on" />
            <Stat label="Paying students" value={ed.plans.paying} note={`${ed.plans.byStudent} paid by the student · ${ed.plans.byParent} by a parent`} />
            <Stat label="Student MRR" value={money(ed.plans.mrrCents)} note="Paying students × A$3.99" />
            <Stat label="Trial to paid" value={pct(ed.plans.trialConversion)} note={`Of ${ed.plans.trialsEnded} trials that ended in the period`} />
          </Grid>
          <h2 className="text-lg font-medium">Pilot funnel</h2>
          <Funnel stages={ed.funnel} />
          <h2 className="text-lg font-medium">Groups and study</h2>
          <Grid>
            <Stat label="Groups created" value={ed.groups.created} />
            <Stat label="Active groups" value={ed.groups.active} note="A member studied 1+ minute" />
            <Stat label="Groups with 2+ studying" value={ed.groups.activeWithTwo} />
            <Stat label="Members per active group" value={ed.groups.membersPerActiveGroup === null ? null : ed.groups.membersPerActiveGroup.toFixed(1)} />
            <Stat label="Verified study minutes" value={ed.study.minutes.toLocaleString("en-AU")} note={`${ed.study.sessions} sessions`} />
            <Stat label="Students studying" value={ed.study.studiers} />
            <Stat label="Minutes per student per week" value={ed.study.minutesPerStudierPerWeek === null ? null : Math.round(ed.study.minutesPerStudierPerWeek)} />
            <Stat label="Group goals hit" value={`${ed.groups.goalsHit} of ${ed.groups.goalDays}`} note="Group days that reached their target" />
            <Stat label="Chat messages" value={ed.groups.messages} />
            <Stat label="Help requests" value={ed.help.requests} note={`${pct(ed.help.rate)} accepted or resolved`} />
          </Grid>
          <h2 className="text-lg font-medium">Practice</h2>
          <Grid>
            <Stat label="Resources made" value={ed.practice.generated} note={`${ed.practice.quizzes} quizzes`} />
            <Stat label="From the curriculum" value={pct(ed.practice.curriculumShare)} />
            <Stat label="Quiz attempts" value={ed.practice.attempts} />
            <Stat label="Average quiz score" value={pct(ed.practice.avgScore)} note="Marks earned of marks available" />
            <Stat label="Flagged as wrong" value={ed.practice.flags} warn={ed.practice.flags > 0} />
          </Grid>
        </>
      )}

      {tab === "study-hall" && (
        <>
          <h2 className="text-lg font-medium">Acquisition</h2>
          <Grid>
            <Stat label="Parent enquiries" value={null} note="No enquiry form exists; families sign up directly." />
            <Stat label="Trial bookings" value={null} note="There's no trial booking; the first week is refundable instead." />
            <Stat label="New parent accounts" value={ov.newRegistrations.parents} />
          </Grid>
          <h2 className="text-lg font-medium">Sessions and engagement</h2>
          <Grid>
            <Stat label="Sessions scheduled" value={sh.sessionsScheduled} />
            <Stat label="Sessions completed" value={sh.sessionsCompleted} />
            <Stat label="Sessions cancelled" value={sh.sessionsCancelled} />
            <Stat label="Attendances" value={sh.attendances} note="Students marked present, late or left early" />
            <Stat label="Active students" value={sh.activeStudents} />
            <Stat label="No-show rate" value={pct(sh.noShowRate)} note="Marked absent, of all attendance records" />
            <Stat label="Sessions per active student per week" value={sh.sessionsPerStudentPerWeek === null ? null : sh.sessionsPerStudentPerWeek.toFixed(1)} />
            <Stat label="Back within 7 days" value={pct(sh.return7.rate)} note={`${sh.return7.eligible} students eligible`} />
            <Stat label="Back within 28 days" value={pct(sh.return28.rate)} note={`${sh.return28.eligible} students eligible`} />
            <Stat label="4-week retention" value={pct(sh.retention4w.rate)} note={`${sh.retention4w.eligible} students 28+ days in`} />
            <Stat label="Parent reports approved" value={sh.reportsApproved} />
            <Stat label="Parent reports sent" value={sh.reportsDelivered} note="Marked sent by an admin (emails are sent by hand)" />
          </Grid>
          <h2 className="text-lg font-medium">Revenue</h2>
          <Grid>
            <Stat label="Paying families" value={ov.payingFamilies} />
            <Stat label="MRR" value={money(ov.mrrCents.families)} />
            <Stat label="Average revenue per family" value={sh.arpuCents === null ? null : `${money(sh.arpuCents)}/mo`} />
            {sh.revenueByPlan.map((p) => (
              <Stat key={p.plan} label={p.plan} value={`${money(p.mrr)}/mo`} note={`${p.families} subscriptions`} />
            ))}
          </Grid>
        </>
      )}

      {tab === "tutors" && (
        <>
          <h2 className="text-lg font-medium">Activation funnel (tutors registered in the period)</h2>
          <Funnel stages={withConversion(tm.funnel)} />
          <Grid>
            <Stat label="Activation rate" value={pct(tm.activation.rate)} note={`First report drafted within 7 days: ${tm.activation.activated} of ${tm.activation.eligible}`} />
            <Stat label="Median time to first report" value={tm.medianHoursToFirstReport === null ? null : `${Math.round(tm.medianHoursToFirstReport)} h`} />
            <Stat label="Weekly active tutors" value={tm.weeklyActive} note="Last 7 days of the period" />
            <Stat label="Monthly active tutors" value={tm.monthlyActive} note="Last 30 days of the period" />
          </Grid>
          <h2 className="text-lg font-medium">Usage</h2>
          <Grid>
            <Stat label="Reports drafted" value={tm.reportsDrafted} />
            <Stat label="Reports sent or shared" value={tm.reportsSent} />
            <Stat label="Sent in English" value={tm.reportsEnglish} />
            <Stat label="Sent in Simplified Chinese" value={tm.reportsChinese} />
            <Stat label="Reports per active tutor per week" value={tm.reportsPerActiveTutorPerWeek === null ? null : tm.reportsPerActiveTutorPerWeek.toFixed(1)} />
            <Stat label="Invoices created" value={tm.invoices} />
            <Stat label="Voice notes" value={trackedSince ? tm.voiceNotes : null} note="From events" />
            <Stat label="Transcription failure rate" value={pct(tm.transcriptionFailureRate)} note="From events" />
            <Stat label="Report drafting failure rate" value={pct(tm.draftFailureRate)} note="From events" />
            <Stat label="Reports edited before sending" value={null} note="Not tracked yet: needs a draft-vs-final comparison." />
          </Grid>
          <h2 className="text-lg font-medium">Trials, conversion and revenue</h2>
          <Grid>
            <Stat label="Active trials" value={tm.activeTrials} />
            <Stat label="Trials ended in the period" value={tm.trialsEnded} />
            <Stat label="Trial-to-paid" value={pct(tm.trialToPaid)} />
            <Stat label="Paying tutors" value={tm.payingTutors} />
            <Stat label="MRR" value={money(tm.mrrCents)} note="A$15 per paying tutor" />
            <Stat label="Cancellations" value={tm.cancellations} note="From events" />
            <Stat label="30-day retention" value={pct(tm.retention30.rate)} note={`${tm.retention30.eligible} tutors activated 30+ days ago`} />
            <Stat label="Average revenue per paying tutor" value={tm.payingTutors ? "A$15/mo" : null} />
          </Grid>
        </>
      )}

      {tab === "operations" && <Operations events={data.events} range={range} billingAttention={ov.billingAttention} />}

      {tab === "accounts" && <Accounts data={data} q={typeof query.q === "string" ? query.q : ""} tab={tab} rangeKey={key} now={now} />}
    </AdminFrame>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{children}</section>;
}

function Stat({ label, value, note, warn = false }: { label: string; value: number | string | null; note?: string; warn?: boolean }) {
  return (
    <div className="dash-card flex flex-col gap-1 px-4 py-3" data-testid="stat">
      <p className="text-xs text-ink-soft">{label}</p>
      {value === null ? (
        <p className="text-lg text-ink-faint" title="This data isn't collected yet, or there isn't enough of it to compute.">
          Not tracked
        </p>
      ) : (
        <p className={`font-serif text-2xl tabular-nums ${warn ? "text-pen" : ""}`}>{value}</p>
      )}
      {note && <p className="text-xs text-ink-faint">{note}</p>}
    </div>
  );
}

function Funnel({ stages }: { stages: { stage: string; count: number; fromPrevious: number | null }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <ol className="dash-card flex flex-col gap-2 p-4 text-sm" data-testid="funnel">
      {stages.map((s, i) => (
        <li key={s.stage} className="grid grid-cols-[12rem_1fr_7rem] items-center gap-3">
          <span>
            {i + 1}. {s.stage}
          </span>
          <span className="h-2.5 rounded-full bg-paper-deep">
            <span className="block h-2.5 rounded-full bg-lavender" style={{ width: `${(s.count / max) * 100}%` }} />
          </span>
          <span className="text-right tabular-nums">
            {s.count}
            {s.fromPrevious !== null && <span className="text-xs text-ink-faint"> · {pct(s.fromPrevious)}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Operations({ events, range, billingAttention }: { events: { name: string; created_at: string }[]; range: Range; billingAttention: number }) {
  const failures = new Map<string, number>();
  for (const e of events) {
    if (!e.name.endsWith("_failed")) continue;
    const t = Date.parse(e.created_at);
    if (t < range.from.getTime() || t >= range.to.getTime()) continue;
    failures.set(e.name, (failures.get(e.name) ?? 0) + 1);
  }
  return (
    <>
      <Grid>
        <Stat label="Workflow failures" value={[...failures.values()].reduce((a, b) => a + b, 0)} note="Transcription, drafting and payment failures from events" />
        <Stat label="Payment issues now" value={billingAttention} warn={billingAttention > 0} />
        <Stat label="Support requests" value={null} note="Not tracked: support is by email (no ticketing yet)." />
        <Stat label="Rejected or duplicate events" value={null} note="Duplicates are dropped by their dedupe key and not counted." />
      </Grid>
      <table className="w-full text-sm">
        <thead className="text-left text-ink-soft">
          <tr>
            <th className="py-1 font-normal">Failure</th>
            <th className="py-1 text-right font-normal">Count</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {[...failures.entries()].map(([name, n]) => (
            <tr key={name}>
              <td className="py-1.5">
                <code>{name}</code> <span className="text-ink-faint">· {EVENTS[name as keyof typeof EVENTS] ?? ""}</span>
              </td>
              <td className="text-right tabular-nums">{n}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!failures.size && <p className="text-sm text-ink-soft">No failures recorded in this period.</p>}
    </>
  );
}

function Accounts({ data, q, tab, rangeKey, now }: { data: Awaited<ReturnType<typeof loadAnalytics>>; q: string; tab: string; rangeKey: string; now: Date }) {
  const lastActive = new Map<string, string>();
  const bump = (id: string, at: string) => {
    if (!lastActive.has(id) || lastActive.get(id)! < at) lastActive.set(id, at);
  };
  for (const e of data.events) if (e.user_id && e.name !== "user_logged_in") bump(e.user_id, e.created_at);
  for (const r of [...data.tutorReports, ...data.tutorStudents, ...data.tutorInvoices, ...data.tutorLessons, ...data.tutorResources]) bump(r.tutor_id, r.created_at);
  const tutor = new Map(data.tutors.map((t) => [t.id, t]));
  const subs = new Map<string, string>();
  for (const s of data.subscriptions) if (!subs.has(s.parent_id) || s.status === "active") subs.set(s.parent_id, s.status);
  const count = (rows: { tutor_id: string }[], id: string) => rows.filter((r) => r.tutor_id === id).length;
  const needle = q.trim().toLowerCase();
  const rows = data.accounts
    .filter((a) => !needle || a.email.toLowerCase().includes(needle) || (a.name ?? "").toLowerCase().includes(needle))
    .toSorted((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 200);
  const status = (a: (typeof rows)[number]) => {
    if (a.role === "tutor") {
      const t = tutor.get(a.id);
      return !t ? "No profile" : tutorPays(t) ? "Solo (paying)" : t.plan === "solo" ? "Solo (set by admin)" : Date.parse(t.trial_ends_at) > now.getTime() ? "Trial" : "Trial ended";
    }
    if (a.role === "parent") return subs.get(a.id) ?? "No subscription";
    return "—";
  };
  return (
    <>
      <form className="flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="tab" value={tab} />
        <input type="hidden" name="range" value={rangeKey} />
        <label className="flex flex-col gap-1">
          Search name or email
          <input name="q" defaultValue={q} className={fieldClass} />
        </label>
        <Button type="submit" size="sm" variant="outline">
          Search
        </Button>
        <a href="/api/admin/accounts" className="dash-link ml-auto text-sm" download>
          Export all as CSV
        </a>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm" data-testid="accounts-table">
          <thead className="text-left text-ink-soft">
            <tr>
              <th className="py-1 font-normal">Account</th>
              <th className="py-1 font-normal">Product · role</th>
              <th className="py-1 font-normal">Created</th>
              <th className="py-1 font-normal">Status</th>
              <th className="py-1 font-normal">Last active</th>
              <th className="py-1 text-right font-normal">Usage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="py-1.5">
                  {a.name ?? "—"}
                  <br />
                  <span className="text-xs text-ink-soft">{a.email}</span>
                </td>
                <td>{a.role === "tutor" ? "Tutors · tutor" : `Study Hall · ${a.role}`}</td>
                <td className="tabular-nums">{formatInZone(a.created_at, "d MMM yyyy")}</td>
                <td>{status(a)}</td>
                <td className="tabular-nums">{lastActive.has(a.id) ? formatInZone(lastActive.get(a.id)!, "d MMM yyyy") : "—"}</td>
                <td className="text-right text-xs text-ink-soft tabular-nums">
                  {a.role === "tutor"
                    ? `${count(data.tutorStudents, a.id)} students · ${count(data.tutorReports, a.id)} reports · ${count(data.tutorInvoices, a.id)} invoices`
                    : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-faint">Up to 200 accounts, newest first. Staff and test accounts aren&apos;t listed. Last 60+ days of activity.</p>
    </>
  );
}

function Glossary() {
  return (
    <details className="dash-card p-4 text-sm" data-testid="glossary">
      <summary className="cursor-pointer font-medium">How these numbers are worked out</summary>
      <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-[12rem_1fr]">
        {[
          ["Registered account", "A parent, student or tutor account that isn't a test account (*.test, example.com) or staff."],
          ["Active user", "Did a meaningful action in the period: a session attended, a goal set, a report or invoice made, a student added. Logging in alone doesn't count."],
          ["Paying", "Families: an active Stripe subscription. Tutors: Solo through Stripe (Solo switched on by an admin isn't revenue)."],
          ["MRR", "Active recurring subscriptions per month (weekly prices × 52 ÷ 12). Past-due and cancelled ones aren't counted."],
          ["Churn", "Families paying at the start of the period who cancelled during it, divided by families paying at the start."],
          ["Tutor activation", "First AI report drafted within 7 days of registering. Out of tutors registered in the period at least 7 days ago."],
          ["Trial-to-paid", "Tutors whose 14-day trial ended in the period and who now pay, divided by all whose trial ended in the period."],
          ["4-week retention", "Students who attended in days 22–28 after their first session, out of students whose first session was 28+ days ago."],
          ["30-day tutor retention", "Tutors active in days 22–30 after their first report, out of tutors whose first report was 30+ days ago."],
          ["From events", "Counted from product events, which began when tracking was added. Earlier activity isn't included."],
          ["Not tracked", "The product doesn't record this yet, or there's too little data. It's not the same as zero."],
        ].map(([term, def]) => (
          <div key={term} className="contents">
            <dt className="font-medium">{term}</dt>
            <dd className="text-ink-soft">{def}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-ink-faint">Event catalogue: docs/events.md. Week: Monday to Sunday; all dates in Melbourne time.</p>
    </details>
  );
}

