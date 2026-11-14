"use client";

import { useLayoutEffect, useRef, useState, type RefObject, type TextareaHTMLAttributes } from "react";
import { autoMath, hasMath, insertMath, MATH_KEYS } from "@/lib/math-input";
import { MathLine, MathText } from "./math-text";

type Field = HTMLInputElement | HTMLTextAreaElement;

/**
 * The maths keyboard: buttons that insert LaTeX at the cursor of `target` (fractions, powers,
 * roots, calculus, symbols). Buttons don't take focus, so the student keeps typing where they were.
 */
export function MathKeyboard({ target, value, onChange }: { target: RefObject<Field | null>; value: string; onChange: (value: string) => void }) {
  const [group, setGroup] = useState(MATH_KEYS[0].group);
  // Where the cursor goes once the inserted text is on screen. Set after React commits the new
  // value: setting it earlier loses the race, and the controlled field puts the cursor at the end.
  const caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = target.current;
    if (caret.current === null || !el || el.value !== value) return;
    el.focus();
    el.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [value, target]);
  const press = (snippet: string) => {
    const el = target.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const out = insertMath(value, start, end, snippet);
    caret.current = out.caret;
    onChange(out.value);
  };
  const keys = MATH_KEYS.find((g) => g.group === group)?.keys ?? [];
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-rule bg-paper p-2" role="group" aria-label="Maths keyboard">
      <div className="flex gap-1 text-xs" role="tablist" aria-label="Maths keys">
        {MATH_KEYS.map((g) => (
          <button
            key={g.group}
            type="button"
            role="tab"
            aria-selected={g.group === group}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setGroup(g.group)}
            className={`rounded-full px-3 py-1 font-medium ${g.group === group ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`}
          >
            {g.group}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
        {keys.map((k) => (
          <button
            key={k.id}
            type="button"
            title={k.title}
            aria-label={k.title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => press(k.snippet)}
            className="grid h-11 place-items-center overflow-hidden rounded-lg border border-rule bg-sheet text-sm hover:bg-paper-deep active:bg-paper-deep"
          >
            <span aria-hidden className="pointer-events-none">
              <MathLine tex={k.label} />
            </span>
          </button>
        ))}
      </div>
      <p className="px-1 text-[11px] text-ink-faint">
        Or type LaTeX yourself, like <span className="font-mono">\frac&#123;1&#125;&#123;2&#125;</span> or <span className="font-mono">x^&#123;2&#125;</span>. Select something first to put it inside a fraction or root.
      </p>
    </div>
  );
}

/** A typeset preview of what the student has typed, shown only when it has maths in it. */
export function MathPreview({ text }: { text: string }) {
  if (!hasMath(text)) return null;
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-[var(--tiles-sage-soft)] px-3 py-2 text-sm" aria-live="polite">
      <span className="font-mono text-[10px] font-semibold tracking-wide text-[var(--tiles-sage-ink)] uppercase">Preview</span>
      <span className="break-words whitespace-pre-wrap">
        <MathText text={autoMath(text)} />
      </span>
    </div>
  );
}

/** The "∑ Maths" button that opens and closes the keyboard. */
export function MathToggle({ open, onToggle, className = "" }: { open: boolean; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onToggle}
      aria-pressed={open}
      aria-label={open ? "Hide maths keyboard" : "Show maths keyboard"}
      className={`inline-flex shrink-0 items-center justify-center gap-1 rounded-full border px-3 text-sm font-medium ${open ? "border-ink bg-ink text-paper" : "border-rule bg-sheet text-ink hover:bg-paper-deep"} ${className}`}
    >
      <span aria-hidden className="font-serif text-base leading-none">∑</span>
      <span className="hidden sm:inline">Maths</span>
    </button>
  );
}

/**
 * A textarea with the maths keyboard and preview, for plain forms (e.g. the Ask page). Holds its
 * own value and submits it under `name`.
 */
export function MathTextarea({ name, defaultValue = "", ...rest }: { name: string; defaultValue?: string } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "name" | "value" | "defaultValue" | "onChange">) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [el, setEl] = useState<HTMLTextAreaElement | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <textarea {...rest} ref={setEl} name={name} value={value} onChange={(e) => setValue(e.target.value)} />
      <MathPreview text={value} />
      <div>
        <MathToggle open={open} onToggle={() => setOpen(!open)} className="h-9" />
      </div>
      {open && <MathKeyboard target={{ current: el }} value={value} onChange={setValue} />}
    </div>
  );
}
