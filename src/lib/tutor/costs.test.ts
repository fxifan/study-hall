import { describe, expect, it } from "vitest";
import { costAudCents, sumUsage } from "./costs";

describe("cost estimates", () => {
  it("sums usage by kind and prices it in AUD", () => {
    const totals = sumUsage([
      { kind: "transcribe_seconds", amount: 60 },
      { kind: "llm_tokens", amount: "1700" },
      { kind: "email", amount: 1 },
    ]);
    expect(totals).toEqual({ transcribe_seconds: 60, llm_tokens: 1700, email: 1 });
    const cost = costAudCents(totals);
    // One typical report: 1 min audio + one draft + one email, well under the A$0.02 target.
    expect(cost.total).toBeGreaterThan(0);
    expect(cost.total).toBeLessThan(2);
  });
});
