import { describe, expect, it } from "vitest";
import { planForStatus } from "./plan";

describe("planForStatus", () => {
  it("is Solo while the subscription is active, trial otherwise", () => {
    expect(planForStatus("active")).toBe("solo");
    expect(planForStatus("past_due")).toBe("solo");
    expect(planForStatus("canceled")).toBe("trial");
    expect(planForStatus("unpaid")).toBe("trial");
  });
});
