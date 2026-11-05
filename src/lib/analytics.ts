/**
 * Admin analytics (coding action plan §5): every number on /admin/analytics, computed from
 * persisted records and product events. Pure functions over plain rows, so they're unit-tested.
 * Test and internal accounts are removed before rows reach here. `null` means "can't be computed
 * from what's recorded" and is shown as "Not tracked", never as zero.
 *
 * Definitions (shown on the page as the glossary):
 *   - Registered account: a parent, student or tutor account that isn't a test account.
 *   - Active user: did a meaningful product action in the period (not just logging in).
 *   - Tutor activation: first AI report drafted within 7 days of registering. Denominator: tutors
 *     registered in the period at least 7 days ago.
 *   - Trial-to-paid: tutors whose trial ended in the period and who pay (Stripe), over all whose
 *     trial ended in the period.
 *   - 4-week Study Hall retention: students attending in days 22–28 after their first attended
 *     session, over students whose first attended session was at least 28 days ago.
 *   - 30-day tutor retention: tutors active in days 22–30 after activation, over tutors activated
 *     at least 30 days ago.
 *   - MRR: active recurring subscriptions normalised to a month (weekly × 52 / 12). Past-due and
 *     cancelled subscriptions aren't counted.
 *   - Churn: paying accounts at the start of the period that cancelled during it, over paying
 *     accounts at the start.
 */

export const DAY = 86_400_000;

export type Range = { from: Date; to: Date };
const inRange = (iso: string | null | undefined, r: Range) => {
  if (!iso) return false;
  const t = Date.parse(iso);
  return t >= r.from.getTime() && t < r.to.getTime();
};
export const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const distinct = <T>(xs: T[]) => [...new Set(xs)];

// --- Inputs -------------------------------------------------------------------------------------

export type Account = { id: string; role: string; created_at: string };
export type Subscription = {
  parent_id: string;
  status: string;
  created_at: string;
  canceled_at: string | null;
  quantity: number;
  price_cents: number;
  interval: string;
  plan_name: string;
};
export type Tutor = { id: string; plan: string; trial_ends_at: string; created_at: string; stripe_customer_id: string | null };
export type Event = { name: string; product: string; user_id: string | null; created_at: string; properties: Record<string, unknown> };
export type TutorReport = { tutor_id: string; created_at: string; sent_at: string | null; drafted: boolean; langs: string[] };
export type Dated = { tutor_id: string; created_at: string };
export type Attendance = { student_id: string; starts_at: string; present: boolean };
export type Session = { starts_at: string; ends_at: string; status: string };
export type ShReport = { status: string; created_at: string; sent_at: string | null };

const PAYING = new Set(["active", "trialing"]);
const MEANINGFUL = (name: string) => name !== "user_logged_in";

/** Monthly value of a subscription, in cents. */
export function monthlyCents(s: Pick<Subscription, "price_cents" | "quantity" | "interval">): number {
  const per = s.price_cents * Math.max(1, s.quantity);
  return s.interval === "week" ? Math.round((per * 52) / 12) : s.interval === "year" ? Math.round(per / 12) : per;
}
export const TUTOR_SOLO_MONTHLY_CENTS = 1500;
/** A tutor pays when Solo came from Stripe (an admin can also switch Solo on by hand: not revenue). */
export const tutorPays = (t: Tutor) => t.plan === "solo" && Boolean(t.stripe_customer_id);

// --- Overview -----------------------------------------------------------------------------------

export function overview(input: {
  accounts: Account[];
  subscriptions: Subscription[];
  tutors: Tutor[];
  events: Event[];
  activeFromRecords: string[];
  range: Range;
  now: Date;
}) {
  const { accounts, subscriptions, tutors, events, range, now } = input;
  const byRole = (role: string) => accounts.filter((a) => a.role === role);
  const payingFamilies = distinct(subscriptions.filter((s) => PAYING.has(s.status)).map((s) => s.parent_id));
  const payingTutors = tutors.filter(tutorPays);
  const mrrFamilies = subscriptions.filter((s) => PAYING.has(s.status)).reduce((n, s) => n + monthlyCents(s), 0);
  const mrrTutors = payingTutors.length * TUTOR_SOLO_MONTHLY_CENTS;
  const active = distinct([
    ...events.filter((e) => MEANINGFUL(e.name) && e.user_id && inRange(e.created_at, range)).map((e) => e.user_id!),
    ...input.activeFromRecords,
  ]);
  return {
    registered: { parents: byRole("parent").length, students: byRole("student").length, tutors: byRole("tutor").length },
    newRegistrations: {
      parents: byRole("parent").filter((a) => inRange(a.created_at, range)).length,
      students: byRole("student").filter((a) => inRange(a.created_at, range)).length,
      tutors: byRole("tutor").filter((a) => inRange(a.created_at, range)).length,
    },
    activeUsers: active.length,
    payingFamilies: payingFamilies.length,
    payingTutors: payingTutors.length,
    activeTrials: tutors.filter((t) => t.plan === "trial" && Date.parse(t.trial_ends_at) > now.getTime()).length,
    newPaying:
      subscriptions.filter((s) => inRange(s.created_at, range) && PAYING.has(s.status)).length +
      events.filter((e) => e.name === "subscription_started" && e.product === "tutors" && inRange(e.created_at, range)).length,
    mrrCents: { families: mrrFamilies, tutors: mrrTutors, total: mrrFamilies + mrrTutors },
    cancellations:
      subscriptions.filter((s) => inRange(s.canceled_at, range)).length +
      events.filter((e) => e.name === "subscription_cancelled" && e.product === "tutors" && inRange(e.created_at, range)).length,
    billingAttention: subscriptions.filter((s) => s.status === "past_due" || s.status === "unpaid").length,
    failedPayments: events.filter((e) => e.name === "payment_failed" && inRange(e.created_at, range)).length,
    familyChurn: churn(subscriptions, range),
  };
}

/** Families paying at the start of the period who cancelled during it, over those paying at the start. */
export function churn(subscriptions: Subscription[], range: Range): { rate: number | null; cancelled: number; atStart: number } {
  const start = range.from.getTime();
  const payingAtStart = subscriptions.filter((s) => Date.parse(s.created_at) < start && (!s.canceled_at || Date.parse(s.canceled_at) >= start));
  const cancelled = payingAtStart.filter((s) => inRange(s.canceled_at, range)).length;
  return { rate: ratio(cancelled, payingAtStart.length), cancelled, atStart: payingAtStart.length };
}

// --- Study Hall ---------------------------------------------------------------------------------

export function studyHall(input: { attendance: Attendance[]; sessions: Session[]; reports: ShReport[]; subscriptions: Subscription[]; range: Range; now: Date }) {
  const { attendance, sessions, reports, subscriptions, range, now } = input;
  const inPeriod = attendance.filter((a) => inRange(a.starts_at, range));
  const present = inPeriod.filter((a) => a.present);
  const activeStudents = distinct(present.map((a) => a.student_id));
  const weeks = Math.max(1, (Math.min(range.to.getTime(), now.getTime()) - range.from.getTime()) / (7 * DAY));

  // Returning within 7 / 28 days after a student's first attended session in the period.
  const byStudent = new Map<string, number[]>();
  for (const a of attendance.filter((x) => x.present)) byStudent.set(a.student_id, [...(byStudent.get(a.student_id) ?? []), Date.parse(a.starts_at)]);
  const returning = (days: number) => {
    let eligible = 0;
    let back = 0;
    for (const id of activeStudents) {
      const times = byStudent.get(id)!.toSorted((x, y) => x - y);
      const first = times.find((t) => t >= range.from.getTime());
      if (first === undefined || first + days * DAY > now.getTime()) continue;
      eligible++;
      if (times.some((t) => t > first + 12 * 3600_000 && t <= first + days * DAY)) back++;
    }
    return { rate: ratio(back, eligible), eligible };
  };

  const sessionsInPeriod = sessions.filter((s) => inRange(s.starts_at, range));
  const byPlan = new Map<string, { families: number; mrr: number }>();
  for (const s of subscriptions.filter((x) => PAYING.has(x.status))) {
    const v = byPlan.get(s.plan_name) ?? { families: 0, mrr: 0 };
    v.families++;
    v.mrr += monthlyCents(s);
    byPlan.set(s.plan_name, v);
  }
  const payingFamilies = distinct(subscriptions.filter((s) => PAYING.has(s.status)).map((s) => s.parent_id)).length;
  const mrr = [...byPlan.values()].reduce((n, v) => n + v.mrr, 0);

  return {
    sessionsScheduled: sessionsInPeriod.filter((s) => s.status !== "cancelled").length,
    sessionsCompleted: sessionsInPeriod.filter((s) => s.status !== "cancelled" && Date.parse(s.ends_at) < now.getTime()).length,
    sessionsCancelled: sessionsInPeriod.filter((s) => s.status === "cancelled").length,
    attendances: present.length,
    noShowRate: ratio(inPeriod.filter((a) => !a.present).length, inPeriod.length),
    activeStudents: activeStudents.length,
    sessionsPerStudentPerWeek: activeStudents.length ? present.length / activeStudents.length / weeks : null,
    return7: returning(7),
    return28: returning(28),
    retention4w: fourWeekRetention(attendance, now),
    reportsApproved: reports.filter((r) => (r.status === "approved" || r.status === "sent") && inRange(r.created_at, range)).length,
    reportsDelivered: reports.filter((r) => r.status === "sent" && inRange(r.sent_at, range)).length,
    revenueByPlan: [...byPlan.entries()].map(([plan, v]) => ({ plan, ...v })),
    arpuCents: payingFamilies ? Math.round(mrr / payingFamilies) : null,
  };
}

/** Students attending in days 22–28 after their first attended session, over those 28+ days in. */
export function fourWeekRetention(attendance: Attendance[], now: Date) {
  const first = new Map<string, number>();
  const all = new Map<string, number[]>();
  for (const a of attendance.filter((x) => x.present)) {
    const t = Date.parse(a.starts_at);
    first.set(a.student_id, Math.min(first.get(a.student_id) ?? Infinity, t));
    all.set(a.student_id, [...(all.get(a.student_id) ?? []), t]);
  }
  let eligible = 0;
  let kept = 0;
  for (const [id, t0] of first) {
    if (t0 + 28 * DAY > now.getTime()) continue;
    eligible++;
    if (all.get(id)!.some((t) => t >= t0 + 21 * DAY && t < t0 + 28 * DAY)) kept++;
  }
  return { rate: ratio(kept, eligible), eligible };
}

// --- Tutors -------------------------------------------------------------------------------------

export function tutorsMetrics(input: {
  tutors: Tutor[];
  reports: TutorReport[];
  students: Dated[];
  invoices: Dated[];
  lessons: Dated[];
  resources: Dated[];
  events: Event[];
  range: Range;
  now: Date;
}) {
  const { tutors, reports, students, invoices, range, now } = input;
  const cohort = tutors.filter((t) => inRange(t.created_at, range));
  const firstOf = (rows: Dated[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.tutor_id, Math.min(m.get(r.tutor_id) ?? Infinity, Date.parse(r.created_at)));
    return m;
  };
  const firstStudent = firstOf(students);
  const firstDraft = firstOf(reports.filter((r) => r.drafted));
  const firstSent = firstOf(reports.filter((r) => r.sent_at).map((r) => ({ tutor_id: r.tutor_id, created_at: r.sent_at! })));

  // Meaningful actions, from records (complete history) and events (since tracking began).
  const actions: Dated[] = [
    ...reports.map((r) => ({ tutor_id: r.tutor_id, created_at: r.created_at })),
    ...students,
    ...invoices,
    ...input.lessons,
    ...input.resources,
    ...input.events.filter((e) => e.product === "tutors" && MEANINGFUL(e.name) && e.user_id).map((e) => ({ tutor_id: e.user_id!, created_at: e.created_at })),
  ];
  const activeIn = (from: number, to: number) => distinct(actions.filter((a) => Date.parse(a.created_at) >= from && Date.parse(a.created_at) < to).map((a) => a.tutor_id));
  const end = Math.min(range.to.getTime(), now.getTime());
  const activeTutors = activeIn(range.from.getTime(), range.to.getTime());

  // Activation: first draft within 7 days of registering, among the cohort registered 7+ days ago.
  const matured = cohort.filter((t) => Date.parse(t.created_at) + 7 * DAY <= now.getTime());
  const activated = matured.filter((t) => (firstDraft.get(t.id) ?? Infinity) <= Date.parse(t.created_at) + 7 * DAY);
  const hoursToFirst = cohort
    .filter((t) => firstDraft.has(t.id))
    .map((t) => (firstDraft.get(t.id)! - Date.parse(t.created_at)) / 3600_000)
    .toSorted((a, b) => a - b);

  // Trials that ended in the period, and how many of those tutors pay.
  const trialsEnded = tutors.filter((t) => inRange(t.trial_ends_at, range) && Date.parse(t.trial_ends_at) <= now.getTime());
  const converted = trialsEnded.filter(tutorPays);

  // 30-day retention after activation (first draft).
  let retEligible = 0;
  let retKept = 0;
  for (const t of tutors) {
    const a = firstDraft.get(t.id);
    if (a === undefined || a + 30 * DAY > now.getTime()) continue;
    retEligible++;
    if (actions.some((x) => x.tutor_id === t.id && Date.parse(x.created_at) >= a + 21 * DAY && Date.parse(x.created_at) < a + 30 * DAY)) retKept++;
  }

  const reportsInPeriod = reports.filter((r) => r.drafted && inRange(r.created_at, range));
  const sentInPeriod = reports.filter((r) => inRange(r.sent_at, range));
  const weeks = Math.max(1, (end - range.from.getTime()) / (7 * DAY));
  const ev = (name: string) => input.events.filter((e) => e.name === name && inRange(e.created_at, range)).length;
  const transcribeTried = ev("transcription_completed") + ev("transcription_failed");
  const draftTried = ev("lesson_report_generated") + ev("lesson_report_failed");

  return {
    funnel: [
      { stage: "Registered", count: cohort.length },
      { stage: "First student added", count: cohort.filter((t) => firstStudent.has(t.id)).length },
      { stage: "First report drafted", count: cohort.filter((t) => firstDraft.has(t.id)).length },
      { stage: "First report sent", count: cohort.filter((t) => firstSent.has(t.id)).length },
      { stage: "Paying (Solo via Stripe)", count: cohort.filter(tutorPays).length },
      {
        stage: "Active 30 days after registering",
        count: cohort.filter((t) => {
          const c = Date.parse(t.created_at);
          return c + 30 * DAY <= now.getTime() && actions.some((x) => x.tutor_id === t.id && Date.parse(x.created_at) >= c + 21 * DAY && Date.parse(x.created_at) < c + 30 * DAY);
        }).length,
      },
    ],
    activation: { rate: ratio(activated.length, matured.length), activated: activated.length, eligible: matured.length },
    medianHoursToFirstReport: hoursToFirst.length ? hoursToFirst[Math.floor(hoursToFirst.length / 2)] : null,
    weeklyActive: activeIn(end - 7 * DAY, end).length,
    monthlyActive: activeIn(end - 30 * DAY, end).length,
    activeTutors: activeTutors.length,
    reportsDrafted: reportsInPeriod.length,
    reportsSent: sentInPeriod.length,
    reportsEnglish: sentInPeriod.filter((r) => r.langs.includes("en")).length,
    reportsChinese: sentInPeriod.filter((r) => r.langs.includes("zh-CN")).length,
    reportsPerActiveTutorPerWeek: activeTutors.length ? reportsInPeriod.length / activeTutors.length / weeks : null,
    invoices: invoices.filter((i) => inRange(i.created_at, range)).length,
    voiceNotes: ev("voice_note_uploaded"),
    transcriptionFailureRate: ratio(ev("transcription_failed"), transcribeTried),
    draftFailureRate: ratio(ev("lesson_report_failed"), draftTried),
    activeTrials: tutors.filter((t) => t.plan === "trial" && Date.parse(t.trial_ends_at) > now.getTime()).length,
    trialsEnded: trialsEnded.length,
    trialToPaid: ratio(converted.length, trialsEnded.length),
    payingTutors: tutors.filter(tutorPays).length,
    mrrCents: tutors.filter(tutorPays).length * TUTOR_SOLO_MONTHLY_CENTS,
    cancellations: input.events.filter((e) => e.name === "subscription_cancelled" && e.product === "tutors" && inRange(e.created_at, range)).length,
    retention30: { rate: ratio(retKept, retEligible), eligible: retEligible },
  };
}

/** Each stage's count and its conversion from the previous stage. */
export function withConversion(stages: { stage: string; count: number }[]) {
  return stages.map((s, i) => ({ ...s, fromPrevious: i === 0 ? null : ratio(s.count, stages[i - 1].count) }));
}
