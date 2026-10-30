"use client";

import { useEffect, useRef, useState } from "react";
import { ReportLanguageSwitch, useCopyText } from "@/components/report-cards";
import type { LandingCopy } from "@/i18n/dictionaries/landing.en";
import { fill } from "@/i18n/fill";
import { attendanceParts, outcomeLabel, pick, reportText, type ReportLabels, type ReportLang } from "@/lib/report-card";
import { Circled, OutcomeMark, vars } from "./marks";
import { SAMPLES, type Variant } from "./sample-data";

/**
 * The report lines, shared by the hero sheet (circled minutes, no annotations) and the interactive
 * sample (numbered annotations matching the legend).
 */
export function ReportLines({
  variant,
  lang,
  t,
  annotate = false,
  circled = false,
}: {
  variant: Variant;
  lang: ReportLang;
  t: ReportLabels;
  annotate?: boolean;
  circled?: boolean;
}) {
  const { report } = SAMPLES[variant];
  const a = report.attendance;
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
  const [times, minutes] = a.attended ? attendanceParts(a, lang, t) : ["", ""];

  return (
    <>
      {line(
        "",
        <span className="t">
          <b>{report.student}</b> · {report.date[lang]}
        </span>,
      )}
      {!a.attended ? (
        line("", <span className="t">{fill(t.absent, { name: report.student, session: report.session[lang] })}</span>)
      ) : (
        <>
          {line(
            "",
            <span className="t">
              <span className="dim">
                {t.attendance}
                {t.colon}
              </span>
              {times}
              {minutes.startsWith(" ") && " "}
              {circled ? <Circled>{minutes.trim()}</Circled> : minutes.trim()}
            </span>,
            1,
          )}
          {line("", <span className="t dim">{t.goals + t.colon.trimEnd()}</span>, 2)}
          {report.goals.map((goal) =>
            line(
              "goal",
              <>
                <span className="mk">
                  <OutcomeMark outcome={goal.outcome!} />
                </span>
                <span className="t">
                  {pick(goal.text, lang)}
                  <span className="dim"> · {outcomeLabel(goal.outcome, t)}</span>
                </span>
              </>,
            ),
          )}
          {report.observations.map((note) =>
            line(
              "",
              <span className="t">
                <span className="dim">
                  {t.observations}
                  {t.colon}
                </span>
                {pick(note, lang)}
              </span>,
              3,
            ),
          )}
        </>
      )}
    </>
  );
}

/** The interactive sample: attended or absent, in English or Simplified Chinese, with copy as text. */
export function SampleReport({
  copies,
  labels,
  initialLang,
}: {
  copies: Record<ReportLang, LandingCopy["report"]>;
  labels: Record<ReportLang, ReportLabels>;
  initialLang: ReportLang;
}) {
  const [variant, setVariant] = useState<Variant>("attended");
  const [lang, setLang] = useState<ReportLang>(initialLang);
  const [copyState, copy] = useCopyText();
  const sheet = useRef<HTMLElement>(null);
  const { report, sent } = SAMPLES[variant];
  const c = copies[lang];
  const t = labels[lang];

  // Reveal once when scrolled into view (variant and language changes re-animate via the key below).
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

  return (
    <>
      <div className="sample-ctls">
        <div className="seg-ctl" role="group" aria-label={c.variantsLabel}>
          {(Object.keys(c.variants) as Variant[]).map((key) => (
            <button key={key} type="button" aria-pressed={variant === key} onClick={() => setVariant(key)}>
              {c.variants[key]}
            </button>
          ))}
        </div>
        <ReportLanguageSwitch lang={lang} onChange={setLang} label={t.language} className="seg-ctl" />
      </div>
      <figure
        ref={sheet}
        className="sheet report-sheet draw"
        data-own-reveal
        aria-label={t.sampleTitle}
        lang={lang === "zh" ? "zh-CN" : "en"}
      >
        <figcaption className="sheet-head">
          <span>{t.sampleTitle}</span>
          <span>{fill(c.sent, { time: sent[lang] })}</span>
        </figcaption>
        <div className="ruled" key={`${variant}-${lang}`} aria-live="polite">
          <ReportLines variant={variant} lang={lang} t={t} annotate />
        </div>
        <div className="sheet-foot">
          <span className="note">{report.attendance.attended ? c.footNote : c.absentNote}</span>
          <button
            type="button"
            className={`copy-btn ${copyState === "copied" ? "done" : ""}`}
            onClick={() => copy(reportText(report, lang, t, true))}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="8" y="8" width="12" height="12" rx="2" />
              <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
            </svg>
            <span>{copyState === "copied" ? t.copied : copyState === "failed" ? t.copyFailed : t.copy}</span>
          </button>
        </div>
      </figure>
      <p className="disclaimer">{c.disclaimer}</p>
    </>
  );
}
