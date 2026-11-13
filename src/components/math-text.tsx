import katex from "katex";
import "katex/dist/katex.min.css";

/**
 * Text with maths in it, as the AI writes it: LaTeX inside \( … \) inline or \[ … \] (or $$ … $$)
 * on its own line. Everything else is plain text. A single $ is never maths here, so prices like
 * A$11.99 stay as written. KaTeX escapes its input and `trust` is off, so model output can't
 * inject HTML or links. Works in server and client components.
 */
export type MathPart = { kind: "text"; value: string } | { kind: "math"; value: string; display: boolean };

const DELIMITED = /\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$|\\\(([\s\S]+?)\\\)/g;

export function splitMath(text: string): MathPart[] {
  const parts: MathPart[] = [];
  let last = 0;
  for (const m of text.matchAll(DELIMITED)) {
    if (m.index > last) parts.push({ kind: "text", value: text.slice(last, m.index) });
    const display = m[1] !== undefined || m[2] !== undefined;
    parts.push({ kind: "math", value: (m[1] ?? m[2] ?? m[3]).trim(), display });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", value: text.slice(last) });
  return parts;
}

function render(tex: string, display: boolean): string {
  return katex.renderToString(tex, { displayMode: display, throwOnError: false, output: "htmlAndMathml", strict: "ignore" });
}

/** Plain text with inline and display maths rendered. Keeps line breaks (use with whitespace-pre-wrap). */
export function MathText({ text }: { text: string }) {
  return (
    <>
      {splitMath(text).map((p, i) =>
        p.kind === "text" ? (
          <span key={i}>{p.value}</span>
        ) : (
          <span key={i} className={p.display ? "my-1 block overflow-x-auto overflow-y-hidden" : ""} dangerouslySetInnerHTML={{ __html: render(p.value, p.display) }} />
        ),
      )}
    </>
  );
}

/** One line of working that is all maths (with or without delimiters), e.g. `y = \frac{3x^2}{2} + C`. */
export function MathLine({ tex }: { tex: string }) {
  const inner = tex.trim().replace(/^\\\(|\\\)$/g, "").replace(/^\\\[|\\\]$/g, "").replace(/^\$\$|\$\$$/g, "").trim();
  return <span className="inline-block max-w-full overflow-x-auto overflow-y-hidden align-middle" dangerouslySetInnerHTML={{ __html: render(inner, false) }} />;
}
