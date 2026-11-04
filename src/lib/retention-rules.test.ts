import { describe, expect, it } from "vitest";
import { endedFamilies } from "./retention-rules";

const now = new Date("2026-11-20T00:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
const sub = (parent_id: string, status: string, end: number, canceled?: number) => ({
  parent_id,
  status,
  current_period_end: daysAgo(end),
  canceled_at: canceled === undefined ? null : daysAgo(canceled),
});

describe("endedFamilies", () => {
  it("deletes 7 days after the subscription ends, not before", () => {
    expect(endedFamilies([sub("a", "canceled", 8)], now)).toEqual(["a"]);
    expect(endedFamilies([sub("b", "canceled", 6)], now)).toEqual([]);
  });

  it("uses the later of period end and cancellation", () => {
    expect(endedFamilies([sub("a", "canceled", 30, 3)], now)).toEqual([]);
  });

  it("keeps a parent with any active subscription", () => {
    expect(endedFamilies([sub("a", "canceled", 30), sub("a", "active", -20)], now)).toEqual([]);
    expect(endedFamilies([sub("a", "past_due", 30)], now)).toEqual([]);
  });

  it("ignores abandoned checkouts", () => {
    expect(endedFamilies([sub("a", "incomplete", 30)], now)).toEqual([]);
    expect(endedFamilies([sub("a", "canceled", 30), sub("a", "incomplete", 1)], now)).toEqual(["a"]);
  });
});
