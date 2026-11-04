import { describe, expect, it } from "vitest";
import { MONTHLY_DRAFT_CAP } from "./config";
import { canWork, draftAccess, trialDaysLeft } from "./plan";

const now = new Date("2026-11-02T00:00:00Z");
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();

describe("plans", () => {
  it("trial: 14 days of full use, then blocked until Solo", () => {
    expect(trialDaysLeft(inDays(14), now)).toBe(14);
    expect(canWork({ plan: "trial", trialEndsAt: inDays(0.5) }, now)).toBe(true);
    expect(canWork({ plan: "trial", trialEndsAt: inDays(-1) }, now)).toBe(false);
    expect(draftAccess({ plan: "trial", trialEndsAt: inDays(-1), draftsThisMonth: 0 }, now)).toEqual({ ok: false, reason: "trial_ended", plan: "trial" });
    expect(canWork({ plan: "solo", trialEndsAt: inDays(-100) }, now)).toBe(true);
  });

  it("fair-use cap applies on every plan", () => {
    expect(draftAccess({ plan: "solo", trialEndsAt: inDays(-1), draftsThisMonth: MONTHLY_DRAFT_CAP }, now)).toMatchObject({ ok: false, reason: "fair_use" });
    expect(draftAccess({ plan: "solo", trialEndsAt: inDays(-1), draftsThisMonth: MONTHLY_DRAFT_CAP - 1 }, now)).toMatchObject({ ok: true, draftsLeft: 1 });
    expect(draftAccess({ plan: "trial", trialEndsAt: inDays(3), draftsThisMonth: 10 }, now)).toMatchObject({ ok: true, trialDaysLeft: 3 });
  });
});
