import { describe, expect, it } from "vitest";
import { loginEmail } from "./login-template";

describe("personal login email", () => {
  it("greets by name, says what's waiting and carries the link", () => {
    const e = loginEmail({ first: "Mia", lines: ["Methods crew has 2 hours to go on today's goal."], url: "https://edumi.app/auth/confirm?token_hash=abc&type=magiclink", welcome: false });
    expect(e.subject).toBe("Mia, here's your Edumi login link");
    expect(e.html).toContain("Hi Mia,");
    expect(e.html).toContain("Methods crew has 2 hours to go");
    expect(e.html).toContain("token_hash=abc");
    expect(e.text).toContain("Log in");
  });
  it("welcomes new accounts and escapes names", () => {
    const e = loginEmail({ first: "<b>Al</b>", lines: [], url: "https://x", welcome: true });
    expect(e.subject).toBe("<b>Al</b>, welcome to Edumi");
    expect(e.html).not.toContain("<b>Al</b>");
  });
});
