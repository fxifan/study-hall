import { describe, expect, it } from "vitest";
import { splitMath } from "./math-text";

describe("maths in AI text", () => {
  it("finds inline \\( … \\) and display \\[ … \\] maths", () => {
    expect(splitMath(String.raw`A simple example is \(\frac{dy}{dx} = 3x\), so \[y = \int 3x\,dx\] works.`)).toEqual([
      { kind: "text", value: "A simple example is " },
      { kind: "math", value: String.raw`\frac{dy}{dx} = 3x`, display: false },
      { kind: "text", value: ", so " },
      { kind: "math", value: String.raw`y = \int 3x\,dx`, display: true },
      { kind: "text", value: " works." },
    ]);
  });

  it("treats $$ … $$ as display maths but leaves a single $ (prices) alone", () => {
    expect(splitMath("Costs A$2.99 and $$x^2$$")).toEqual([
      { kind: "text", value: "Costs A$2.99 and " },
      { kind: "math", value: "x^2", display: true },
    ]);
    expect(splitMath("A$11.99 a month, A$2.99 for AI")).toEqual([{ kind: "text", value: "A$11.99 a month, A$2.99 for AI" }]);
  });

  it("leaves plain text and Unicode maths untouched", () => {
    expect(splitMath("Solve 3x + 5 = 20, then x² ≤ 9.")).toEqual([{ kind: "text", value: "Solve 3x + 5 = 20, then x² ≤ 9." }]);
  });
});
