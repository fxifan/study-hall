"use client";

import { useEffect, useRef, useState } from "react";
import type { LandingCopy } from "@/i18n/dictionaries/landing.en";
import { fill } from "@/i18n/fill";
import { Circled, OutcomeMark, vars, type Outcome } from "./marks";

/**
 * Fictional sample reports in the spec §4.5 format, with neutral observations (product brief §5).
 * The report body stays in English on every locale because real reports are sent in English.
 * Never real student data.
 */
const NAME = "Mia";
const DAY = "Thursday";
const SESSION = "4:00–8:00pm";

export type Variant = "full" | "late" | "absent";
type Night =
  | { sent: string; attended: [string, string]; goals: [Outcome, string][]; supervisor: string }
  | { sent: string; absent: true };

const SAMPLE_NIGHTS: Record<Variant, Night> = {
  full: {
    sent: "8:41pm",
    attended: ["Attended 4:02–7:55pm", "(233 min of 240)"],
    goals: [
      ["done", "Biology: revision questions, chapter 6"],
      ["partial", "Chemistry: review equilibrium notes"],
      ["not_done", "English: essay plan"],
    ],
    supervisor: "Phone visible once during the session.",
  },
  late: {
    sent: "8:52pm",
    attended: ["Attended 4:31–8:00pm", "(209 min of 240)"],
    goals: [
      ["done", "Methods: Exercise 3C"],
      ["done", "Physics: chapter 5 summary notes"],
      ["partial", "Biology: practice questions"],
    ],
    supervisor: "Joined 31 minutes after the start. Phone visible twice.",
  },
  absent: { sent: "8:15pm", absent: true },
};

const SYMBOL: Record<Outcome, string> = { done: "✓", partial: "~", not_done: "✗" };
const LABEL: Record<Outcome, string> = { done: "Done", partial: "Partial", not_done: "Not done" };

function sampleReportText(night: Night): string {
  const head = ["[Sample report, fictional student]", `${NAME}: ${DAY}`];
  if ("absent" in night) return [...head, `${NAME} didn't attend today's session (${SESSION}).`].join("\n");
  return [
    ...head,
    night.attended.join(" "),
    "Goals:",
    ...night.goals.map(([o, text]) => ` ${SYMBOL[o]} ${text}${o === "partial" ? " (partial)" : ""}`),
    `Supervisor: ${night.supervisor}`,
  ].join("\n");
}

/**
 * The report lines, shared by the hero sheet (circled minutes, no annotations) and the interactive
 * sample (numbered annotations matching the legend).
 */
export function ReportLines({
  variant,
  annotate = false,
  circled = false,
}: {
  variant: Variant;
  annotate?: boolean;
  circled?: boolean;
}) {
  const night = SAMPLE_NIGHTS[variant];
  let i = 0;
  const line = (cls: string, content: React.ReactNode, anno?: number) => (
    <div key={i} className={`ln ${cls}`} style={vars({ "--i": i++ })}>
      {content}
      {annotate && anno ? (
        <span className="anno" aria-hidden="true">
          {anno}
        </span>
      ) : null}
    </div>
  );

  return (
    <>
      {line(
        "",
        <span className="t">
          <b>{NAME}:</b> {DAY}
        </span>,
      )}
      {"absent" in night ? (
        line("", <span className="t">{`${NAME} didn't attend today's session (${SESSION}).`}</span>)
      ) : (
        <>
          {line(
            "",
            <span className="t">
              {night.attended[0]} {circled ? <Circled>{night.attended[1]}</Circled> : night.attended[1]}
            </span>,
            1,
          )}
          {line("", <span className="t">Goals:</span>, 2)}
          {night.goals.map(([o, text]) =>
            line(
              "goal",
              <>
                <span className="mk">
                  <OutcomeMark outcome={o} />
                  <span className="vh">{LABEL[o]}:</span>
                </span>
                <span className="t">
                  {text}
                  {o === "partial" && <span className="dim"> (partial)</span>}
                </span>
              </>,
            ),
          )}
          {line(
            "",
            <span className="t">
              <span className="dim">Supervisor:</span> {night.supervisor}
            </span>,
            3,
          )}
        </>
      )}
    </>
  );
}

export function SampleReport({ copy }: { copy: LandingCopy["report"] }) {
  const [variant, setVariant] = useState<Variant>("full");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const sheet = useRef<HTMLElement>(null);
  const night = SAMPLE_NIGHTS[variant];

  // Reveal once when scrolled into view (the variants re-animate via the key below).
  useEffect(() => {
    const el = sheet.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("go");
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (copyState === "idle") return;
    const id = setTimeout(() => setCopyState("idle"), 1800);
    return () => clearTimeout(id);
  }, [copyState]);

  async function copyText() {
    try {
      await navigator.clipboard.writeText(sampleReportText(night));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <>
      <div className="seg-ctl" role="group" aria-label={copy.variantsLabel}>
        {(Object.keys(copy.variants) as Variant[]).map((key) => (
          <button key={key} type="button" aria-pressed={variant === key} onClick={() => setVariant(key)}>
            {copy.variants[key]}
          </button>
        ))}
      </div>
      {copy.languageNote && <p className="lang-note">{copy.languageNote}</p>}
      <figure ref={sheet} className="sheet report-sheet draw" data-own-reveal aria-label={copy.sheetLabel}>
        <figcaption className="sheet-head">
          <span>{copy.sheetLabel}</span>
          <span>{fill(copy.sent, { time: night.sent })}</span>
        </figcaption>
        <div className="ruled" key={variant} aria-live="polite" lang="en">
          <ReportLines variant={variant} annotate />
        </div>
        <div className="sheet-foot">
          <span className="note">{"absent" in night ? copy.absentNote : copy.footNote}</span>
          <button type="button" className={`copy-btn ${copyState === "copied" ? "done" : ""}`} onClick={copyText}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="8" y="8" width="12" height="12" rx="2" />
              <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
            </svg>
            <span>{copyState === "copied" ? copy.copied : copyState === "failed" ? copy.copyFailed : copy.copy}</span>
          </button>
        </div>
      </figure>
      <p className="disclaimer">{copy.disclaimer}</p>
    </>
  );
}
