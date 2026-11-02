import { afterEach, describe, expect, it } from "vitest";
import { tutorEmailMode } from "./send";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("tutor email mode", () => {
  it("sends from the tutor's own email until a verified sender is set up", () => {
    delete process.env.TUTOR_EMAIL_MODE;
    delete process.env.RESEND_API_KEY;
    expect(tutorEmailMode()).toBe("own");
    process.env.RESEND_API_KEY = "re_test";
    process.env.REPORTS_FROM_EMAIL = "Study Hall <onboarding@resend.dev>";
    expect(tutorEmailMode()).toBe("own"); // Resend's shared test sender only reaches the account owner
    process.env.REPORTS_FROM_EMAIL = "Study Hall <reports@studyhall.example>";
    expect(tutorEmailMode()).toBe("app");
  });

  it("can be forced either way", () => {
    process.env.TUTOR_EMAIL_MODE = "app";
    delete process.env.RESEND_API_KEY;
    expect(tutorEmailMode()).toBe("app");
    process.env.TUTOR_EMAIL_MODE = "own";
    process.env.RESEND_API_KEY = "re_test";
    process.env.REPORTS_FROM_EMAIL = "Study Hall <reports@studyhall.example>";
    expect(tutorEmailMode()).toBe("own");
  });
});
