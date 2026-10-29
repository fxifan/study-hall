import { describe, expect, it } from "vitest";
import { stagesForYear } from "./subjects";

describe("stagesForYear", () => {
  it("offers junior subjects to Years 7–9, both lists to Year 10, VCE to 11–12", () => {
    expect(stagesForYear(7)).toEqual(["junior"]);
    expect(stagesForYear(9)).toEqual(["junior"]);
    expect(stagesForYear(10)).toEqual(["junior", "vce"]);
    expect(stagesForYear(12)).toEqual(["vce"]);
  });
});
