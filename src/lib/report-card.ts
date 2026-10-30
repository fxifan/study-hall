import type { Dictionary } from "@/i18n/dictionaries/en";
import { fill } from "@/i18n/fill";

/**
 * Session report cards (comprehensive brief §5): one structured report, shown in English or
 * Simplified Chinese. Only labels and fixed text change language. Anything a person wrote (goals,
 * supervisor notes) is a plain string and is shown as written; demo content can carry both languages.
 */
export type ReportLang = "en" | "zh";
export const REPORT_LANGS: ReportLang[] = ["en", "zh"];
export const REPORT_LANG_NAMES: Record<ReportLang, string> = { en: "English", zh: "简体中文" };

export type ReportLabels = Dictionary["reportCard"];
/** Written by a person (kept as is), or fixed demo text in both languages. */
export type Localized = string | Record<ReportLang, string>;
export type Outcome = "done" | "partial" | "not_done";

export type ReportCardData = {
  id: string;
  student: string;
  date: Record<ReportLang, string>;
  session: Record<ReportLang, string>;
  attendance:
    | { attended: false }
    | { attended: true; from: Record<ReportLang, string>; to: Record<ReportLang, string>; minutes: number; total: number };
  goals: { text: Localized; outcome: Outcome | null }[];
  observations: Localized[];
  comment: string | null;
};

export function pick(text: Localized, lang: ReportLang): string {
  return typeof text === "string" ? text : text[lang];
}

export function attendanceLine(report: ReportCardData, lang: ReportLang, t: ReportLabels): string {
  const a = report.attendance;
  if (!a.attended) return fill(t.absent, { name: report.student, session: report.session[lang] });
  const [times, minutes] = attendanceParts(a, lang, t);
  return times + minutes;
}

/** The times and the "(… minutes of …)" part of an attendance line, separately. */
export function attendanceParts(
  a: Extract<ReportCardData["attendance"], { attended: true }>,
  lang: ReportLang,
  t: ReportLabels,
): [string, string] {
  return [fill(t.attendedTimes, { from: a.from[lang], to: a.to[lang] }), fill(t.attendedMinutes, { minutes: a.minutes, total: a.total })];
}

export function outcomeLabel(outcome: Outcome | null, t: ReportLabels): string {
  return t.outcomes[outcome ?? "unmarked"];
}

/** Plain text for copying into WhatsApp or WeChat, in one language. */
export function reportText(report: ReportCardData, lang: ReportLang, t: ReportLabels, sample = false): string {
  const lines = [
    ...(sample ? [t.sampleTag] : []),
    `${report.student} · ${report.date[lang]}`,
    `${t.attendance}${t.colon}${attendanceLine(report, lang, t)}`,
  ];
  if (report.attendance.attended) {
    lines.push(t.goals + t.colon.trimEnd());
    if (!report.goals.length) lines.push(`  ${t.noGoals}`);
    for (const goal of report.goals) lines.push(`  - ${pick(goal.text, lang)} · ${outcomeLabel(goal.outcome, t)}`);
    for (const note of report.observations) lines.push(`${t.observations}${t.colon}${pick(note, lang)}`);
    if (report.comment) lines.push(`${t.comment}${t.colon}${report.comment}`);
  }
  return lines.join("\n");
}
