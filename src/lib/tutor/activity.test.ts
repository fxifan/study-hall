import { describe, expect, it } from "vitest";
import { activityFor, tutorActivity } from "./activity";

const now = new Date("2026-11-04T00:00:00Z");
const day = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString();

describe("tutorActivity", () => {
  const map = tutorActivity(
    {
      families: [{ tutor_id: "a" }, { tutor_id: "a" }, { tutor_id: "b" }],
      students: [{ tutor_id: "a" }],
      sessions: [
        { tutor_id: "a", starts_at: day(-2), duration_min: 90 },
        { tutor_id: "a", starts_at: day(-40), duration_min: 60 },
      ],
      lessons: [
        { tutor_id: "a", starts_at: day(3), status: "scheduled" },
        { tutor_id: "a", starts_at: day(4), status: "cancelled" },
        { tutor_id: "a", starts_at: day(-1), status: "scheduled" },
      ],
      reports: [
        { tutor_id: "a", sent_at: day(-1) },
        { tutor_id: "a", sent_at: null },
      ],
      invoices: [
        { tutor_id: "a", status: "draft", total_cents: 999 },
        { tutor_id: "a", status: "sent", total_cents: 6000 },
        { tutor_id: "a", status: "paid", total_cents: 9000 },
      ],
    },
    now,
  );

  it("counts each tutor's own rows", () => {
    const a = activityFor(map, "a");
    expect(a).toMatchObject({ families: 2, students: 1, sessions: 2, sessions30d: 1, hours30d: 1.5, upcomingLessons: 1 });
    expect(a).toMatchObject({ reportsDrafted: 2, reportsSent: 1, invoicesSent: 2, invoicedCents: 15000, paidCents: 9000 });
    expect(a.lastActivity).toBe(day(-1));
    expect(activityFor(map, "b").families).toBe(1);
  });

  it("gives zeros for a tutor with no rows", () => {
    expect(activityFor(map, "nobody")).toMatchObject({ sessions: 0, lastActivity: null });
  });
});
