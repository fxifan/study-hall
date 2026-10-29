import type { CSSProperties, ReactNode } from "react";

// Red-pen marks from design/landing.html. --i/--j stagger the draw-on animation (landing.css).

export function vars(values: Record<string, number | string>): CSSProperties {
  return values as CSSProperties;
}

export type Outcome = "done" | "partial" | "not_done";

const OUTCOME_PATHS: Record<Outcome, string[]> = {
  done: ["M4 13.2c1.9 1.4 3.6 3.2 5 5.3C11.6 12.4 15.4 7.6 20.5 4"],
  partial: ["M3.5 13.5c1.6-2.6 3.4-3.6 5.4-2.2 2.1 1.5 3.6 3.4 6 2 1.6-.9 2.9-2.4 5.6-3.6"],
  not_done: ["M6 5.5c3.8 4 7.6 8.6 12 13.2", "M18.5 5.2C14 9.4 10.2 13.6 5.6 18.8"],
};

export function OutcomeMark({ outcome }: { outcome: Outcome }) {
  return (
    <svg className="pen" viewBox="0 0 24 24" aria-hidden="true">
      {OUTCOME_PATHS[outcome].map((d, j) => (
        <path key={d} pathLength={1} d={d} style={j ? vars({ "--j": j }) : undefined} />
      ))}
    </svg>
  );
}

export function Tick({ className }: { className?: string }) {
  return (
    <svg className={`pen ${className ?? ""}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d={OUTCOME_PATHS.done[0]} />
    </svg>
  );
}

export function Cross() {
  return (
    <svg className="pen" viewBox="0 0 24 24" aria-hidden="true">
      {OUTCOME_PATHS.not_done.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export function Underline() {
  return (
    <svg className="pen uline" viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden="true" style={vars({ "--i": 5 })}>
      <path pathLength={1} d="M3 12.5C70 6.5 160 4.5 297 8" />
      <path pathLength={1} style={vars({ "--j": 1 })} d="M46 16.5C120 12.5 200 11.5 268 13" />
    </svg>
  );
}

export function Circled({ children }: { children: ReactNode }) {
  return (
    <span className="circled">
      {children}
      <svg className="pen" viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true" style={vars({ "--i": 7 })}>
        <path pathLength={1} d="M24 41C9 31 22 12 72 8c50-4 108 1 118 18 9 17-30 27-90 28C42 55 6 48 9 32 11 21 30 13 58 11" />
      </svg>
    </span>
  );
}

/** Renders **bold** segments of a dictionary string. */
export function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split("**").map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))}
    </>
  );
}

/** A visible note for the product owner where policy isn't decided yet. Must be gone before launch. */
export function OwnerNote({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="todo" data-owner-note>
      <b>{label}:</b> {children}
    </p>
  );
}
