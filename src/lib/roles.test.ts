import { describe, expect, it } from "vitest";
import { canEnterArea, roleForPath } from "./roles";

describe("role areas", () => {
  it("lets admins use the supervisor pages, and nobody else cross over", () => {
    expect(canEnterArea("admin", "admin")).toBe(true);
    expect(canEnterArea("admin", "proctor")).toBe(true);
    expect(canEnterArea("admin", "parent")).toBe(false);
    expect(canEnterArea("proctor", "admin")).toBe(false);
    expect(canEnterArea("parent", "student")).toBe(false);
    expect(roleForPath("/proctor/session/1")).toBe("proctor");
  });

  it("gives independent tutors /app, and keeps them out of Edumi's areas", () => {
    expect(roleForPath("/app")).toBe("tutor");
    expect(roleForPath("/app/log")).toBe("tutor");
    expect(roleForPath("/apply")).toBeNull();
    expect(roleForPath("/tutors")).toBeNull(); // the public tutor landing page
    expect(canEnterArea("tutor", "tutor")).toBe(true);
    expect(canEnterArea("tutor", "proctor")).toBe(false);
    expect(canEnterArea("admin", "tutor")).toBe(true); // their own tutor workspace
    expect(canEnterArea("tutor", "admin")).toBe(false);
    expect(canEnterArea("proctor", "tutor")).toBe(false);
  });
});
