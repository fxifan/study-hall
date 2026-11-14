import { describe, expect, it } from "vitest";
import { autoMath, hasMath, insertMath, insideMath, MATH_KEYS, plainMath } from "./math-input";

const key = (id: string) => MATH_KEYS.flatMap((g) => g.keys).find((k) => k.id === id)!.snippet;

describe("maths keyboard", () => {
  it("wraps a snippet in \\( … \\) outside maths and puts the cursor in its first slot", () => {
    const out = insertMath("y = ", 4, 4, key("frac"));
    expect(out.value).toBe(String.raw`y = \(\frac{}{}\)`);
    expect(out.value.slice(0, out.caret)).toBe(String.raw`y = \(\frac{`);
  });

  it("inserts as is inside maths", () => {
    const text = String.raw`\(x\)`;
    const out = insertMath(text, 3, 3, key("pow"));
    expect(out.value).toBe(String.raw`\(x^{}\)`);
    expect(out.caret).toBe(5);
  });

  it("moves the selection into the slot: select x, press √", () => {
    expect(insertMath("x", 0, 1, key("sqrt")).value).toBe(String.raw`\(\sqrt{x}\)`);
  });

  it("keeps a literal | in absolute value", () => {
    expect(insertMath("", 0, 0, key("abs")).value).toBe(String.raw`\(\left|\right|\)`);
  });

  it("every key has a cursor marker", () => {
    for (const k of MATH_KEYS.flatMap((g) => g.keys)) expect(k.snippet).toContain("§");
  });

  it("knows when the cursor is inside maths", () => {
    const text = String.raw`a \(b\) c \(d`;
    expect(insideMath(text, 1)).toBe(false);
    expect(insideMath(text, 5)).toBe(true);
    expect(insideMath(text, 9)).toBe(false);
    expect(insideMath(text, text.length)).toBe(true);
  });
});

describe("LaTeX typed without delimiters", () => {
  it("treats a line that is all LaTeX as maths", () => {
    expect(autoMath(String.raw`y = \frac{3x^2}{2} + C`)).toBe(String.raw`\(y = \frac{3x^2}{2} + C\)`);
    expect(autoMath("x^{2} = 9")).toBe(String.raw`\(x^{2} = 9\)`);
  });

  it("leaves sentences, plain answers and already-delimited text alone", () => {
    expect(autoMath(String.raw`Solve \frac{x}{2} = 4 please`)).toBe(String.raw`Solve \frac{x}{2} = 4 please`);
    expect(autoMath("x = 5")).toBe("x = 5");
    expect(autoMath(String.raw`I got \(x = 5\)`)).toBe(String.raw`I got \(x = 5\)`);
  });

  it("works line by line", () => {
    expect(autoMath(String.raw`My working:` + "\n" + String.raw`2g = 16`)).toBe(String.raw`My working:` + "\n" + "2g = 16");
    expect(autoMath(String.raw`My working:` + "\n" + String.raw`g = \frac{16}{2}`)).toBe(String.raw`My working:` + "\n" + String.raw`\(g = \frac{16}{2}\)`);
  });

  it("says when there's something to preview", () => {
    expect(hasMath("x = 5")).toBe(false);
    expect(hasMath(String.raw`\sqrt{16}`)).toBe(true);
    expect(hasMath(String.raw`it's \(\pi\)`)).toBe(true);
  });
});

describe("plain-text maths for titles", () => {
  it("turns common LaTeX into readable text", () => {
    expect(plainMath(String.raw`How do I solve \(\frac{dy}{dx} = 5x^{2}\)?`)).toBe("How do I solve dy/dx = 5x²?");
    expect(plainMath(String.raw`\(\sqrt{x+1} \le \pi\)`)).toBe("√(x+1) ≤ π");
    expect(plainMath(String.raw`\(\int_{0}^{1} x^{n} \, dx\)`)).toBe("∫_0¹ xⁿ dx");
    expect(plainMath(String.raw`\(\frac{x+1}{2}\)`)).toBe("(x+1)/2");
  });

  it("leaves ordinary text alone", () => {
    expect(plainMath("Why do you change the sign")).toBe("Why do you change the sign");
    expect(plainMath("Costs A$2.99")).toBe("Costs A$2.99");
  });
});
