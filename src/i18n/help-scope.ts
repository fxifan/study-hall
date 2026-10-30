import type { Locale } from "./config";
import type { Dictionary } from "./dictionaries/en";
import { fill } from "./fill";

/** One line naming the subjects academic help covers, e.g. for FAQ answers and sign-up copy. */
export function helpScopeSummary(scope: Dictionary["helpScope"], locale: Locale): string {
  // en-US: the serial comma keeps "Science, and Business and Commerce" readable.
  const list = new Intl.ListFormat(locale === "zh" ? "zh-CN" : "en-US", { type: "conjunction" });
  return fill(scope.summary, {
    vceLabel: scope.vceLabel,
    vce: list.format(scope.vce),
    juniorLabel: scope.juniorLabel,
    junior: list.format(scope.junior),
  });
}
