import { describe, expect, it } from "vitest";
import { computeMetrics, type MetricsInput } from "./metrics";

const at = (day: string) => `${day}T07:00:00Z`; // 6pm in Melbourne
const input: MetricsInput = {
  parents: [
    { id: "p1", created_at: at("2026-10-05") },
    { id: "p2", created_at: at("2026-10-06") },
    { id: "p3", created_at: at("2026-10-07") },
  ],
  consentParents: ["p1", "p2"],
  subscriptions: [
    { parent_id: "p1", status: "active", created_at: at("2026-10-06"), canceled_at: null, cancel_reason: null, quantity: 2, price_cents: 9900 },
    { parent_id: "p2", status: "canceled", created_at: at("2026-10-06"), canceled_at: at("2026-10-14"), cancel_reason: "too_expensive", quantity: 1, price_cents: 19900 },
  ],
  enrolments: [
    { student_id: "s1", starts_at: at("2026-10-05"), attended: true, present: true },
    { student_id: "s1", starts_at: at("2026-10-06"), attended: true, present: true },
    { student_id: "s2", starts_at: at("2026-10-05"), attended: true, present: false },
    { student_id: "s2", starts_at: at("2026-10-06"), attended: false, present: false },
  ],
  goals: [
    { outcome: "done", starts_at: at("2026-10-05") },
    { outcome: "partial", starts_at: at("2026-10-05") },
  ],
  reports: [
    { status: "sent", created_at: at("2026-10-05") },
    { status: "approved", created_at: at("2026-10-05") },
  ],
};

describe("metrics", () => {
  const m = computeMetrics(input, "2026-10-05", "2026-10-18");
  it("counts families, revenue, conversion and delivery", () => {
    expect(m.paying).toBe(1);
    expect(m.revenueCents).toBe(19800);
    expect(m.funnel).toEqual({ started: 3, consented: 2, paid: 2 });
    expect(m.goalCompletion).toBe(0.5);
    expect(m.reports).toEqual({ sent: 1, failed: 0, awaiting: 1 });
    expect(m.reasons).toEqual([["too_expensive", 1]]);
  });
  it("breaks attendance, days and churn down by week", () => {
    expect(m.weeks.map((w) => w.week)).toEqual(["2026-10-05", "2026-10-12"]);
    expect(m.weeks[0]).toMatchObject({ paying: 2, added: 2, cancelled: 0, revenueCents: 39700, attendance: 0.5, days: 1.5 });
    expect(m.weeks[1]).toMatchObject({ paying: 1, cancelled: 1, attendance: null, days: null });
  });
});
