import { renderEmail, type EmailBlock, type EmailSection, type RenderedEmail } from "@/lib/email/bilingual";
import type { ReportBody, ReportContent, ReportLang } from "./schema";

/**
 * Renderings of a tutor report from its JSON (docs/tutor-reports-spec.md §3.4, §4): plain text for
 * WeChat/WhatsApp, and the parent email (one or both languages, English first, using Edumi's
 * email layout). Empty sections are left out; nothing here adds content.
 */
export type ReportMeta = {
  /** "Ava C." */
  student: string;
  /** Pre-formatted in each language by the caller (src/lib/time.ts). */
  date: Record<ReportLang, string>;
  time: Record<ReportLang, string>;
  subjects: string[];
  tutorName: string;
  /** Business name for the email header, or the tutor's name. */
  brand: string;
};

export const LABELS: Record<
  ReportLang,
  {
    name: string;
    colon: string;
    session: string;
    covered: string;
    wentWell: string;
    nextFocus: string;
    homework: string;
    tutorNote: string;
    subject: (student: string, date: string) => string;
    heading: (student: string) => string;
    footer: (tutor: string) => string;
  }
> = {
  en: {
    name: "English",
    colon: ": ",
    session: "Session",
    covered: "Covered",
    wentWell: "Went well",
    nextFocus: "Next focus",
    homework: "Homework",
    tutorNote: "Note from the tutor",
    subject: (s, d) => `${s}: session update, ${d}`,
    heading: (s) => `${s}'s session update`,
    footer: (t) => `Written by ${t} after the session. Reply to this email to reach ${t}.`,
  },
  "zh-CN": {
    name: "简体中文",
    colon: "：",
    session: "课程",
    covered: "学习内容",
    wentWell: "表现较好",
    nextFocus: "下一步重点",
    homework: "作业",
    tutorNote: "老师备注",
    subject: (s, d) => `${s}：课后反馈，${d}`,
    heading: (s) => `${s} 的课后反馈`,
    footer: (t) => `由 ${t} 在课后撰写。直接回复此邮件即可联系 ${t}。`,
  },
};

export function sessionLine(meta: ReportMeta, lang: ReportLang): string {
  return [meta.date[lang], meta.time[lang], meta.subjects.join(", ")].filter(Boolean).join(" · ");
}

type Section = { label: string; items: string[] };

export function sections(content: ReportContent, lang: ReportLang): Section[] {
  const t = LABELS[lang];
  return [
    { label: t.covered, items: content.covered },
    { label: t.wentWell, items: content.wentWell },
    { label: t.nextFocus, items: content.nextFocus },
    { label: t.homework, items: content.homework },
    { label: t.tutorNote, items: content.tutorNote.trim() ? [content.tutorNote.trim()] : [] },
  ].filter((s) => s.items.length > 0);
}

/** The languages a body actually carries, in report order. */
export function bodyLangs(body: ReportBody, only?: ReportLang[]): ReportLang[] {
  return (["en", "zh-CN"] as const).filter((l) => body[l] && (!only || only.includes(l)));
}

/**
 * Plain text for pasting into WeChat or WhatsApp: no markdown (WeChat shows it literally), short
 * lines, "•" bullets. Both languages: English, a divider, then Chinese.
 */
export function reportText(body: ReportBody, meta: ReportMeta, langs?: ReportLang[]): string {
  return bodyLangs(body, langs)
    .map((lang) => {
      const lines = [`${meta.student} · ${sessionLine(meta, lang)}`];
      for (const s of sections(body[lang]!, lang)) {
        lines.push("", s.label);
        for (const item of s.items) lines.push(`• ${item}`);
      }
      lines.push("", `— ${meta.tutorName}`);
      return lines.join("\n");
    })
    .join("\n\n————————\n\n");
}

export function reportEmail(body: ReportBody, meta: ReportMeta, langs: ReportLang[]): RenderedEmail {
  const used = bodyLangs(body, langs);
  const emailSections: EmailSection[] = used.map((lang) => {
    const t = LABELS[lang];
    const blocks: EmailBlock[] = [
      { kind: "heading", text: t.heading(meta.student) },
      { kind: "fields", rows: [[t.session, sessionLine(meta, lang)]] },
      ...sections(body[lang]!, lang).map((s): EmailBlock => ({ kind: "list", title: s.label, items: s.items })),
    ];
    return { label: t.name, lang, colon: t.colon, blocks, footer: t.footer(meta.tutorName) };
  });
  const subject = used.map((l) => LABELS[l].subject(meta.student, meta.date[l])).join(" · ");
  return renderEmail({ subject, sections: emailSections, brand: meta.brand, htmlLang: used[0] === "zh-CN" ? "zh-CN" : "en" });
}
