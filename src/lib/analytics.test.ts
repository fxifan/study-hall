import { describe, expect, it } from "vitest";
import { DAY, churn, fourWeekRetention, monthlyCents, overview, studyHall, tutorsMetrics, withConversion, type Tutor } from "./analytics";

const now = new Date("2026-11-30T00:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * DAY).toISOString();
const range = { from: new Date(now.getTime() - 30 * DAY), to: now };

describe("money", () => {
  it("normalises weekly plans to a month", () => {
    expect(monthlyCents({ price_cents: 9900, quantity: 2, interval: "week" })).toBe(Math.round((9900 * 2 * 52) / 12));
  });
});

describe("overview", () => {
  it("counts registrations, paying accounts, MRR and active users without double counting", () => {
    const o = overview({
      accounts: [
        { id: "p1", role: "parent", created_at: ago(5) },
        { id: "p2", role: "parent", created_at: ago(60) },
        { id: "t1", role: "tutor", created_at: ago(3) },
      ],
      subscriptions: [
        { parent_id: "p1", status: "active", created_at: ago(4), canceled_at: null, quantity: 1, price_cents: 9900, interval: "week", plan_name: "Supervised Study" },
        { parent_id: "p2", status: "past_due", created_at: ago(50), canceled_at: null, quantity: 1, price_cents: 9900, interval: "week", plan_name: "Supervised Study" },
      ],
      tutors: [
        { id: "t1", plan: "solo", trial_ends_at: ago(-10), created_at: ago(3), stripe_customer_id: "cus_1" },
        { id: "t2", plan: "solo", trial_ends_at: ago(-10), created_at: ago(3), stripe_customer_id: null }, // set by hand: not revenue
      ],
      events: [
        { name: "user_logged_in", product: "platform", user_id: "p2", created_at: ago(1), properties: {} }, // login alone isn't activity
        { name: "lesson_report_generated", product: "tutors", user_id: "t1", created_at: ago(1), properties: {} },
      ],
      activeFromRecords: ["t1", "s9"],
      range,
      now,
    });
    expect(o.registered).toEqual({ parents: 2, students: 0, tutors: 1 });
    expect(o.newRegistrations.parents).toBe(1);
    expect(o.activeUsers).toBe(2); // t1 (once) and s9
    expect(o.payingFamilies).toBe(1); // past_due isn't paying
    expect(o.payingTutors).toBe(1);
    expect(o.mrrCents.total).toBe(monthlyCents({ price_cents: 9900, quantity: 1, interval: "week" }) + 1500);
    expect(o.billingAttention).toBe(1);
  });

  it("works out churn against accounts paying at the start", () => {
    const base = { status: "canceled", quantity: 1, price_cents: 9900, interval: "week", plan_name: "x" };
    const c = churn(
      [
        { ...base, parent_id: "a", created_at: ago(60), canceled_at: ago(10) },
        { ...base, parent_id: "b", created_at: ago(60), canceled_at: null, status: "active" },
        { ...base, parent_id: "c", created_at: ago(5), canceled_at: ago(1) }, // joined in the period: not in the denominator
      ],
      range,
    );
    expect(c).toEqual({ rate: 0.5, cancelled: 1, atStart: 2 });
  });
});

describe("Study Hall", () => {
  it("counts attendance, no-shows, returns and 4-week retention", () => {
    const attendance = [
      { student_id: "s1", starts_at: ago(29), present: true },
      { student_id: "s1", starts_at: ago(25), present: true },
      { student_id: "s1", starts_at: ago(5), present: true }, // day 24 after first: retained
      { student_id: "s2", starts_at: ago(20), present: false },
      { student_id: "s3", starts_at: ago(40), present: true }, // first 40 days ago, never back
    ];
    const sh = studyHall({ attendance, sessions: [], reports: [], subscriptions: [], range, now });
    expect(sh.attendances).toBe(3);
    expect(sh.noShowRate).toBeCloseTo(1 / 4);
    expect(sh.return7.rate).toBe(1); // s1 came back within 7 days of their first session in the period
    expect(fourWeekRetention(attendance, now)).toEqual({ rate: 0.5, eligible: 2 });
  });
});

describe("tutors", () => {
  const tutor = (id: string, days: number, extra: Partial<Tutor> = {}): Tutor => ({ id, plan: "trial", trial_ends_at: ago(days - 14), created_at: ago(days), stripe_customer_id: null, ...extra });
  it("builds the activation funnel and rates", () => {
    const m = tutorsMetrics({
      tutors: [tutor("a", 20, { plan: "solo", stripe_customer_id: "cus" }), tutor("b", 20), tutor("c", 2)],
      reports: [
        { tutor_id: "a", created_at: ago(19), sent_at: ago(19), drafted: true, langs: ["en", "zh-CN"] },
        { tutor_id: "b", created_at: ago(5), sent_at: null, drafted: true, langs: ["en"] }, // after day 7: not activated
      ],
      students: [{ tutor_id: "a", created_at: ago(19.5) }, { tutor_id: "b", created_at: ago(6) }],
      invoices: [],
      lessons: [],
      resources: [],
      events: [
        { name: "transcription_completed", product: "tutors", user_id: "a", created_at: ago(1), properties: {} },
        { name: "transcription_failed", product: "tutors", user_id: "a", created_at: ago(1), properties: {} },
      ],
      range,
      now,
    });
    expect(withConversion(m.funnel).map((s) => s.count)).toEqual([3, 2, 2, 1, 1, 0]);
    expect(m.activation).toEqual({ rate: 0.5, activated: 1, eligible: 2 }); // c is too new to count
    expect(m.trialsEnded).toBe(2);
    expect(m.trialToPaid).toBe(0.5);
    expect(m.transcriptionFailureRate).toBe(0.5);
    expect(m.reportsChinese).toBe(1);
  });
});
