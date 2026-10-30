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
});
