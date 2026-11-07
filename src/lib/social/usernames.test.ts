import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isAdult, normaliseUsername, usernameProblem } from "./usernames";

describe("usernames", () => {
  it("normalise what people type", () => {
    expect(normaliseUsername("  @Mia.Studies ")).toBe("mia.studies");
    expect(normaliseUsername("@@leo_k")).toBe("leo_k");
  });

  it("accept the allowed shapes", () => {
    for (const u of ["mia.studies", "leo_k", "abc", "a1.b2_c3", "x".repeat(20), "ishita", "peacock"]) expect(usernameProblem(u), u).toBeNull();
  });

  it("reject bad lengths, characters, edges, double dots and blocked words", () => {
    expect(usernameProblem("ab")).toMatch(/3 to 20/);
    expect(usernameProblem("x".repeat(21))).toMatch(/3 to 20/);
    expect(usernameProblem("Mia")).toMatch(/lowercase/);
    expect(usernameProblem("mia studies")).toMatch(/lowercase/);
    expect(usernameProblem(".mia")).toMatch(/Start and end/);
    expect(usernameProblem("mia_")).toMatch(/Start and end/);
    expect(usernameProblem("mia..s")).toMatch(/double dots/);
    expect(usernameProblem("edumi.help")).toMatch(/different/);
    expect(usernameProblem("real_admin1")).toMatch(/different/);
  });

  it("match the database check", () => {
    const sql = readFileSync("supabase/migrations/20261107004031_friends_dms.sql", "utf8");
    expect(sql).toContain("'^[a-z0-9._]{3,20}$'");
  });
});

describe("adult or under 18", () => {
  const now = new Date("2026-11-07T00:00:00+11:00");
  it("counts 18 from the birth month, and treats unknowns as under 18", () => {
    expect(isAdult({ birth_year: 2008, birth_month: 11 }, now)).toBe(true);
    expect(isAdult({ birth_year: 2008, birth_month: 12 }, now)).toBe(false);
    expect(isAdult({ birth_year: 2005, birth_month: null }, now)).toBe(true);
    expect(isAdult({ birth_year: 2008, birth_month: null }, now)).toBe(false);
    expect(isAdult({ birth_year: null, birth_month: null }, now)).toBe(false);
  });
});
