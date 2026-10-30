import { describe, expect, it } from "vitest";
import { en } from "./dictionaries/en";
import { zh } from "./dictionaries/zh";
import { helpScopeSummary } from "./help-scope";

describe("helpScopeSummary", () => {
  it("names the subjects the brief lists, in each language", () => {
    expect(helpScopeSummary(en.helpScope, "en")).toBe(
      "VCE Mathematical Methods, General Mathematics, Chemistry, Biology, and Accounting; Years 7–10 Mathematics, English, Science, and Business and Commerce",
    );
    expect(helpScopeSummary(zh.helpScope, "zh")).toContain("VCE：");
    expect(zh.helpScope.vce).toHaveLength(en.helpScope.vce.length);
    expect(zh.helpScope.junior).toHaveLength(en.helpScope.junior.length);
  });
});
