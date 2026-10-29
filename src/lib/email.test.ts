import { describe, expect, it } from "vitest";
import { emailLimitKind, isReservedTestEmail } from "./email";

describe("isReservedTestEmail", () => {
  it("flags reserved test domains", () => {
    expect(isReservedTestEmail("parent.a@studyhall.test")).toBe(true);
    expect(isReservedTestEmail("x@EXAMPLE.com")).toBe(true);
    expect(isReservedTestEmail("x@foo.invalid")).toBe(true);
  });
  it("lets real addresses through", () => {
    expect(isReservedTestEmail("someone@gmail.com")).toBe(false);
    expect(isReservedTestEmail("a@test.com.au")).toBe(false);
  });
});

describe("emailLimitKind", () => {
  it("tells the per-address cooldown from the hourly quota", () => {
    expect(emailLimitKind({ status: 429, code: "over_email_send_rate_limit", message: "For security purposes, you can only request this after 37 seconds." })).toBe("cooldown");
    expect(emailLimitKind({ status: 429, code: "over_email_send_rate_limit", message: "email rate limit exceeded" })).toBe("quota");
    expect(emailLimitKind({ status: 400, code: "otp_disabled", message: "Signups not allowed for otp" })).toBeNull();
  });
});
