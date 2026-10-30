import { addDaysToDateKey, dateKeyOf, isoWeekdayOfDateKey } from "./time";

/** The numbers on /admin/metrics (spec §9), worked out from recorded rows. Pure, so it's testable. */
export type MetricsInput = {
  parents: { id: string; created_at: string }[];
  consentParents: string[];
  subscriptions: {
    parent_id: string;
    status: string;
    created_at: string;
    canceled_at: string | null;
    cancel_reason: string | null;
    quantity: number;
    price_cents: number;
  }[];
  /** Enrolments in sessions that have ended. */
  enrolments: { student_id: string; starts_at: string; attended: boolean; present: boolean }[];
  goals: { outcome: string | null; starts_at: string }[];
  reports: { status: string; created_at: string }[];
};

const LIVE = ["active", "trialing", "past_due"];
const mondayOf = (day: string) => addDaysToDateKey(day, 1 - isoWeekdayOfDateKey(day));
const ratio = (a: number, b: number) => (b ? a / b : null);

export function computeMetrics(input: MetricsInput, from: string, to: string) {
  const inRange = (iso: string) => {
    const day = dateKeyOf(iso);
    return day >= from && day <= to;
  };
  const live = input.subscriptions.filter((s) => LIVE.includes(s.status));
  const paidParents = new Set(input.subscriptions.map((s) => s.parent_id));
  const started = input.parents.filter((p) => inRange(p.created_at));
  const consented = new Set(input.consentParents);
  const enrolled = input.enrolments.filter((e) => inRange(e.starts_at));
  const goals = input.goals.filter((g) => inRange(g.starts_at));
  const reports = input.reports.filter((r) => inRange(r.created_at));
  const countReports = (status: string) => reports.filter((r) => r.status === status).length;

  const weeks: {
    week: string;
    paying: number;
    added: number;
    cancelled: number;
    revenueCents: number;
    attendance: number | null;
    days: number | null;
  }[] = [];
  for (let week = mondayOf(from); week <= to; week = addDaysToDateKey(week, 7)) {
    const end = addDaysToDateKey(week, 6);
    const inWeek = (iso: string) => dateKeyOf(iso) >= week && dateKeyOf(iso) <= end;
    const payingThen = input.subscriptions.filter(
      (s) => dateKeyOf(s.created_at) <= end && (s.canceled_at ? dateKeyOf(s.canceled_at) > end : LIVE.includes(s.status)),
    );
    const sessions = input.enrolments.filter((e) => inWeek(e.starts_at));
    const attended = sessions.filter((e) => e.attended);
    const studentDays = new Set(attended.map((e) => `${e.student_id}:${dateKeyOf(e.starts_at)}`));
    weeks.push({
      week,
      paying: payingThen.length,
      added: input.subscriptions.filter((s) => inWeek(s.created_at)).length,
      cancelled: input.subscriptions.filter((s) => s.canceled_at && inWeek(s.canceled_at)).length,
      revenueCents: payingThen.reduce((sum, s) => sum + s.price_cents * s.quantity, 0),
      attendance: ratio(sessions.filter((e) => e.present).length, sessions.length),
      days: ratio(studentDays.size, new Set(attended.map((e) => e.student_id)).size),
    });
  }

  const reasons = new Map<string, number>();
  for (const s of input.subscriptions) {
    if (s.cancel_reason && s.canceled_at && inRange(s.canceled_at)) reasons.set(s.cancel_reason, (reasons.get(s.cancel_reason) ?? 0) + 1);
  }

  return {
    paying: live.length,
    revenueCents: live.reduce((sum, s) => sum + s.price_cents * s.quantity, 0),
    funnel: {
      started: started.length,
      consented: started.filter((p) => consented.has(p.id)).length,
      paid: started.filter((p) => paidParents.has(p.id)).length,
    },
    attendance: ratio(enrolled.filter((e) => e.present).length, enrolled.length),
    goalCompletion: ratio(goals.filter((g) => g.outcome === "done").length, goals.length),
    reports: { sent: countReports("sent"), failed: countReports("failed"), awaiting: countReports("approved") },
    weeks,
    reasons: [...reasons.entries()],
  };
}
