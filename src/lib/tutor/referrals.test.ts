import { describe, expect, it } from "vitest";
import { newReferralCode, normaliseReferralCode } from "./referral-code";

describe("tutor referral codes", () => {
  it("are 8 characters with no look-alikes (no 0, 1, I or O)", () => {
    for (let i = 0; i < 200; i++) expect(newReferralCode()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it("accept a code from a link in any case, and reject anything else", () => {
    expect(normaliseReferralCode(" ab3d5f7h ")).toBe("AB3D5F7H");
    expect(normaliseReferralCode("AB3D5F7")).toBeNull();
    expect(normaliseReferralCode("AB3D5F70")).toBeNull();
    expect(normaliseReferralCode(null)).toBeNull();
  });
});
