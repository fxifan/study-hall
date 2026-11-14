import { describe, expect, it } from "vitest";
import { FREE_DRAFT_CAP, FREE_STUDENT_LIMIT, MONTHLY_DRAFT_CAP } from "./config";
import { canAddStudent, canWork, draftAccess, tierFor, trialDaysLeft } from "./plan";

const now = new Date("2026-11-02T00:00:00Z");
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();

describe("plans", () => {
  it("trial: full use until it ends, with any number of students", () => {
    expect(trialDaysLeft(inDays(14), now)).toBe(14);
    expect(tierFor({ plan: "trial", trialEndsAt: inDays(0.5), students: 12 }, now)).toBe("trial");
    expect(canWork({ plan: "trial", trialEndsAt: inDays(0.5), students: 12 }, now)).toBe(true);
    expect(canAddStudent({ plan: "trial", trialEndsAt: inDays(0.5), students: 12 }, now)).toBe(true);
  });

  it("free plan: no plan and up to 3 students keeps working, with no end date", () => {
    const free = { plan: "trial" as const, trialEndsAt: inDays(-400), students: FREE_STUDENT_LIMIT };
    expect(tierFor(free, now)).toBe("free");
    expect(canWork(free, now)).toBe(true);
    expect(canAddStudent(free, now)).toBe(false);
    expect(canAddStudent({ ...free, students: FREE_STUDENT_LIMIT - 1 }, now)).toBe(true);
    expect(draftAccess({ ...free, draftsThisMonth: 0 }, now)).toMatchObject({ ok: true, tier: "free", draftsLeft: FREE_DRAFT_CAP });
  });

  it("over the free limit with no plan: locked until Solo (or fewer students)", () => {
    const over = { plan: "trial" as const, trialEndsAt: inDays(-1), students: FREE_STUDENT_LIMIT + 1 };
    expect(tierFor(over, now)).toBe("locked");
    expect(canWork(over, now)).toBe(false);
    expect(draftAccess({ ...over, draftsThisMonth: 0 }, now)).toEqual({ ok: false, reason: "over_free_limit", plan: "trial", students: FREE_STUDENT_LIMIT + 1 });
  });

  it("Solo has no student limit", () => {
    const solo = { plan: "solo" as const, trialEndsAt: inDays(-100), students: 40 };
    expect(canWork(solo, now)).toBe(true);
    expect(canAddStudent(solo, now)).toBe(true);
  });

  it("draft caps: the free allowance on the free plan, fair use otherwise", () => {
    const free = { plan: "trial" as const, trialEndsAt: inDays(-1), students: 2 };
    expect(draftAccess({ ...free, draftsThisMonth: FREE_DRAFT_CAP }, now)).toMatchObject({ ok: false, reason: "free_cap" });
    expect(draftAccess({ plan: "solo", trialEndsAt: inDays(-1), students: 9, draftsThisMonth: MONTHLY_DRAFT_CAP }, now)).toMatchObject({ ok: false, reason: "fair_use" });
    expect(draftAccess({ plan: "solo", trialEndsAt: inDays(-1), students: 9, draftsThisMonth: MONTHLY_DRAFT_CAP - 1 }, now)).toMatchObject({ ok: true, draftsLeft: 1 });
    expect(draftAccess({ plan: "trial", trialEndsAt: inDays(3), students: 9, draftsThisMonth: 10 }, now)).toMatchObject({ ok: true, tier: "trial", trialDaysLeft: 3 });
  });
});
