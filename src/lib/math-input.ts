/**
 * Typing maths: the maths keyboard inserts LaTeX snippets at the cursor, and text a student types
 * in LaTeX is shown typeset. Maths is LaTeX inside \( … \) (inline) or \[ … \] (own line), the
 * same convention the AI uses (src/components/math-text.tsx renders it).
 */

/** A snippet to insert; "§" marks where the cursor (or the selected text) goes. */
export type MathKey = { id: string; label: string; snippet: string; title: string };

export const MATH_KEYS: { group: string; keys: MathKey[] }[] = [
  {
    group: "Build",
    keys: [
      { id: "frac", label: String.raw`\frac{a}{b}`, snippet: String.raw`\frac{§}{}`, title: "Fraction" },
      { id: "pow", label: "x^{n}", snippet: "^{§}", title: "Power" },
      { id: "sub", label: "x_{n}", snippet: "_{§}", title: "Subscript" },
      { id: "sqrt", label: String.raw`\sqrt{x}`, snippet: String.raw`\sqrt{§}`, title: "Square root" },
      { id: "nroot", label: String.raw`\sqrt[n]{x}`, snippet: String.raw`\sqrt[§]{}`, title: "nth root" },
      { id: "abs", label: "|x|", snippet: String.raw`\left|§\right|`, title: "Absolute value" },
      { id: "paren", label: "(x)", snippet: String.raw`\left(§\right)`, title: "Brackets" },
    ],
  },
  {
    group: "Calculus",
    keys: [
      { id: "dydx", label: String.raw`\frac{dy}{dx}`, snippet: String.raw`\frac{dy}{dx}§`, title: "dy/dx" },
      { id: "ddx", label: String.raw`\frac{d}{dx}`, snippet: String.raw`\frac{d}{dx}§`, title: "d/dx" },
      { id: "int", label: String.raw`\int`, snippet: String.raw`\int § \, dx`, title: "Integral" },
      { id: "defint", label: String.raw`\int_a^b`, snippet: String.raw`\int_{§}^{} \, dx`, title: "Definite integral" },
      { id: "lim", label: String.raw`\lim`, snippet: String.raw`\lim_{x \to §}`, title: "Limit" },
      { id: "sum", label: String.raw`\sum`, snippet: String.raw`\sum_{§}^{}`, title: "Sum" },
      { id: "exp", label: "e^{x}", snippet: "e^{§}", title: "e to the power" },
    ],
  },
  {
    group: "Symbols",
    keys: [
      { id: "pi", label: String.raw`\pi`, snippet: String.raw`\pi §`, title: "Pi" },
      { id: "theta", label: String.raw`\theta`, snippet: String.raw`\theta §`, title: "Theta" },
      { id: "inf", label: String.raw`\infty`, snippet: String.raw`\infty §`, title: "Infinity" },
      { id: "times", label: String.raw`\times`, snippet: String.raw`\times §`, title: "Times" },
      { id: "div", label: String.raw`\div`, snippet: String.raw`\div §`, title: "Divide" },
      { id: "pm", label: String.raw`\pm`, snippet: String.raw`\pm §`, title: "Plus or minus" },
      { id: "le", label: String.raw`\le`, snippet: String.raw`\le §`, title: "Less than or equal to" },
      { id: "ge", label: String.raw`\ge`, snippet: String.raw`\ge §`, title: "Greater than or equal to" },
      { id: "ne", label: String.raw`\ne`, snippet: String.raw`\ne §`, title: "Not equal to" },
      { id: "deg", label: String.raw`x^\circ`, snippet: String.raw`^\circ §`, title: "Degrees" },
      { id: "to", label: String.raw`\to`, snippet: String.raw`\to §`, title: "Tends to" },
      { id: "sin", label: String.raw`\sin`, snippet: String.raw`\sin §`, title: "sin" },
      { id: "cos", label: String.raw`\cos`, snippet: String.raw`\cos §`, title: "cos" },
      { id: "tan", label: String.raw`\tan`, snippet: String.raw`\tan §`, title: "tan" },
      { id: "log", label: String.raw`\log`, snippet: String.raw`\log_{§}`, title: "log" },
      { id: "ln", label: String.raw`\ln`, snippet: String.raw`\ln §`, title: "Natural log" },
    ],
  },
];

const OPEN = "\\(";
const CLOSE = "\\)";

/** True when the cursor sits inside an unclosed \( … \) (or \[ … \]). */
export function insideMath(text: string, at: number): boolean {
  const before = text.slice(0, at);
  const opens = before.split(OPEN).length - 1 + (before.split("\\[").length - 1);
  const closes = before.split(CLOSE).length - 1 + (before.split("\\]").length - 1);
  return opens > closes;
}

/**
 * Insert a keyboard snippet at the cursor. Outside maths it's wrapped in \( … \) so it renders;
 * inside, it goes in as is. Selected text moves into the snippet's first slot (select x, press √ →
 * \sqrt{x}). Returns the new text and where the cursor should go.
 */
export function insertMath(text: string, start: number, end: number, snippet: string): { value: string; caret: number } {
  const selected = text.slice(start, end);
  const [beforeCaret, afterCaret = ""] = snippet.split("§");
  const wrap = !insideMath(text, start);
  const head = (wrap ? OPEN : "") + beforeCaret + selected;
  const tail = afterCaret + (wrap ? CLOSE : "");
  const value = text.slice(0, start) + head + tail + text.slice(end);
  return { value, caret: start + head.length };
}

/** Does this text have maths worth previewing (delimited LaTeX, or a line that is LaTeX)? */
export function hasMath(text: string): boolean {
  return /\\\(|\\\[|\$\$/.test(text) || autoMath(text) !== text;
}

const LATEX_HINT = /\\[a-zA-Z]+|[\^_]\{/;

/**
 * A student may type LaTeX without the \( … \) around it, e.g. `\frac{3x^2}{2} + C`. A line with
 * LaTeX in it and no ordinary words left once the commands are removed is treated as maths; lines
 * with words ("Solve x^2 = 4") are left as written. Text that already has delimiters is unchanged.
 */
export function autoMath(text: string): string {
  if (/\\\(|\\\[|\$\$/.test(text)) return text;
  return text
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (!t || !LATEX_HINT.test(t)) return line;
      const words = t.replace(/\\[a-zA-Z]+/g, " ").match(/[A-Za-z]{4,}/g);
      return words ? line : line.replace(t, `${OPEN}${t}${CLOSE}`);
    })
    .join("\n");
}

const SYMBOLS: Record<string, string> = {
  pi: "π", theta: "θ", alpha: "α", beta: "β", infty: "∞", int: "∫", sum: "Σ", times: "×", div: "÷", cdot: "·",
  pm: "±", le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", to: "→", circ: "°", approx: "≈", degree: "°",
};
const SUPERSCRIPT: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻", n: "ⁿ" };

/**
 * Plain-text maths for places that can't typeset, like page and chat titles:
 * `\(\frac{dy}{dx} = 5x^{2}\)` becomes `dy/dx = 5x²`.
 */
export function plainMath(text: string): string {
  let s = text.replace(/\\\(|\\\)|\\\[|\\\]|\$\$/g, "").replace(/\\left|\\right/g, "").replace(/\\[,;!]/g, " ");
  // Innermost first, so nested fractions and roots unwrap.
  for (let i = 0; i < 6; i++) {
    const before = s;
    s = s
      .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a: string, b: string) => `${a.length > 1 && /[+\-\s]/.test(a) ? `(${a})` : a}/${b.length > 1 && /[+\-\s]/.test(b) ? `(${b})` : b}`)
      .replace(/\\sqrt\[([^{}\]]*)\]\{([^{}]*)\}/g, "$1√($2)")
      .replace(/\\sqrt\{([^{}]*)\}/g, (_, a: string) => (a.length > 1 ? `√(${a})` : `√${a}`))
      .replace(/\^\{([^{}]*)\}/g, (_, a: string) => ([...a].every((c) => SUPERSCRIPT[c]) ? [...a].map((c) => SUPERSCRIPT[c]).join("") : `^(${a})`))
      .replace(/_\{([^{}]*)\}/g, "_$1");
    if (s === before) break;
  }
  return s
    .replace(/\^([0-9n])/g, (_, c: string) => SUPERSCRIPT[c] ?? `^${c}`)
    .replace(/\\([a-zA-Z]+)/g, (_, name: string) => SYMBOLS[name] ?? name)
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
