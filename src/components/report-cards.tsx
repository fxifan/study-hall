"use client";

import { useEffect, useState } from "react";
import {
  REPORT_LANGS,
  REPORT_LANG_NAMES,
  attendanceLine,
  evidenceCount,
  goalSummary,
  outcomeLabel,
  pick,
  reportText,
  type Outcome,
  type ReportCardData,
  type ReportLabels,
  type ReportLang,
} from "@/lib/report-card";

const HTML_LANG: Record<ReportLang, string> = { en: "en", zh: "zh-CN" };

/** English / 简体中文 buttons, each name in its own language. Switching never reloads the page. */
export function ReportLanguageSwitch({
  lang,
  onChange,
  label,
  className,
  buttonClassName,
}: {
  lang: ReportLang;
  onChange: (lang: ReportLang) => void;
  label: string;
  className?: string;
  buttonClassName?: string;
}) {
  return (
    <div role="group" aria-label={label} className={className}>
      {REPORT_LANGS.map((l) => (
        <button
          key={l}
          type="button"
          lang={HTML_LANG[l]}
          aria-pressed={lang === l}
          onClick={() => onChange(l)}
          className={buttonClassName}
        >
          {REPORT_LANG_NAMES[l]}
        </button>
      ))}
    </div>
  );
}

/** Copies text to the clipboard; the state goes back to idle after a moment. */
export function useCopyText(): ["idle" | "copied" | "failed", (text: string) => Promise<void>] {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const id = setTimeout(() => setState("idle"), 1800);
    return () => clearTimeout(id);
  }, [state]);
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
  }
  return [state, copy];
}

const OUTCOME_CLASS: Record<Outcome | "unmarked", string> = {
  done: "text-ink",
  partial: "text-ink-soft",
  not_done: "text-pen",
  unmarked: "text-ink-faint",
};

/** A parent's session reports, with one language switch for the list (comprehensive brief §5). */
export function ReportCards({
  reports,
  labels,
  initialLang,
}: {
  reports: ReportCardData[];
  labels: Record<ReportLang, ReportLabels>;
  initialLang: ReportLang;
}) {
  const [lang, setLang] = useState(initialLang);
  const t = labels[lang];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ReportLanguageSwitch
          lang={lang}
          onChange={setLang}
          label={t.language}
          className="inline-flex rounded-full border border-hair p-0.5 text-sm"
          buttonClassName="rounded-full px-3 py-1 text-ink-soft aria-pressed:bg-ink aria-pressed:text-paper"
        />
        <p className="text-xs text-ink-faint">{t.asWritten}</p>
      </div>
      <ul className="flex flex-col gap-3" data-testid="report-list">
        {reports.map((report) => (
          <li key={report.id}>
            <ReportCard report={report} lang={lang} t={t} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReportCard({ report, lang, t }: { report: ReportCardData; lang: ReportLang; t: ReportLabels }) {
  const [copyState, copy] = useCopyText();
  return (
    <article lang={HTML_LANG[lang]} className="rounded-md border border-hair bg-sheet px-4 py-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">
          {report.student} · {report.date[lang]}
        </h3>
        <button
          type="button"
          onClick={() => copy(reportText(report, lang, t))}
          className="rounded-md border border-hair px-2.5 py-1 font-mono text-xs text-ink-soft hover:text-ink"
        >
          {copyState === "copied" ? t.copied : copyState === "failed" ? t.copyFailed : t.copy}
        </button>
      </header>
      <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[minmax(7rem,auto)_1fr]">
        <dt className="text-ink-soft">{t.attendance}</dt>
        <dd>{attendanceLine(report, lang, t)}</dd>
        {report.attendance.attended && (
          <>
            <dt className="text-ink-soft">{t.goals}</dt>
            <dd>
              {report.goals.length ? (
                <>
                  <p className="mb-1 font-mono text-xs text-ink-soft" data-testid="goal-summary">
                    {goalSummary(report, t)} · {t.selfReported}
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {report.goals.map((goal, i) => (
                      <li key={i}>
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          {/* What the student wrote, in their own language. */}
                          <span lang={typeof goal.text === "string" ? "" : HTML_LANG[lang]}>
                            {goal.subject && <span className="text-ink-soft">{goal.subject} · </span>}
                            {pick(goal.text, lang)}
                          </span>
                          <span className={`font-mono text-xs ${OUTCOME_CLASS[goal.outcome ?? "unmarked"]}`}>
                            {outcomeLabel(goal.outcome, t)}
                          </span>
                        </span>
                        {(goal.expected || goal.result || goal.note) && (
                          <span className="block text-xs text-ink-soft" lang="">
                            {[
                              goal.expected && `${t.expected}${t.colon}${goal.expected}`,
                              goal.result && `${t.result}${t.colon}${goal.result}`,
                              goal.note && `${t.note}${t.colon}${goal.note}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                        {goal.evidence?.length ? (
                          <span className="block text-xs">
                            <span className="text-ink-soft">{t.evidence}{t.colon}</span>
                            {goal.evidence.map((e, j) => (
                              <span key={e.id}>
                                {j > 0 && ", "}
                                <a href={`/api/evidence/${e.id}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                                  {e.name}
                                </a>
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {evidenceCount(report) > 0 && <p className="mt-1 text-xs text-ink-faint">{t.evidenceNote}</p>}
                </>
              ) : (
                <span className="text-ink-soft">{t.noGoals}</span>
              )}
            </dd>
            {report.observations.length > 0 && (
              <>
                <dt className="text-ink-soft">{t.observations}</dt>
                <dd>
                  {report.observations.map((note, i) => (
                    <p key={i} lang={typeof note === "string" ? "" : HTML_LANG[lang]}>
                      {pick(note, lang)}
                    </p>
                  ))}
                </dd>
              </>
            )}
            {report.comment && (
              <>
                <dt className="text-ink-soft">{t.comment}</dt>
                <dd lang="">{report.comment}</dd>
              </>
            )}
          </>
        )}
      </dl>
    </article>
  );
}
