import { localizePath } from "@/i18n/config";
import { en } from "@/i18n/dictionaries/en";
import { zh } from "@/i18n/dictionaries/zh";
import { fill } from "@/i18n/fill";
import { CONTACT_EMAIL } from "@/lib/contact";
import { attendanceLine, outcomeLabel, pick, type ReportCardData, type ReportLang } from "@/lib/report-card";
import { renderBilingualEmail, type EmailBlock, type EmailSection, type RenderedEmail } from "./bilingual";

/**
 * Every automated parent email Study Hall sends, in one place (comprehensive brief §6):
 *   - "login" and "signup": Supabase Auth's Magic Link and Confirm signup templates. Generated into
 *     supabase/templates by `npm run emails` and pasted into the Supabase dashboard. Supabase fills
 *     the {{ … }} placeholders. The token_hash link works on any device (src/app/auth/confirm).
 *   - "report": the session report and absence note, rendered by the app from a ReportCardData.
 */
const DICTS = { en, zh } as const;
const LANGS: ReportLang[] = ["en", "zh"];

/** Supabase's redirect (our /auth/confirm) plus the one-time token. */
export const AUTH_LINK = "{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email";

function section(lang: ReportLang, blocks: EmailBlock[]): EmailSection {
  const d = DICTS[lang];
  return {
    label: d.emails.label,
    lang: lang === "zh" ? "zh-CN" : "en",
    colon: d.reportCard.colon,
    blocks,
    footer: fill(d.emails.footer, { email: CONTACT_EMAIL }),
  };
}

function bilingual(subject: (lang: ReportLang) => string, blocks: (lang: ReportLang) => EmailBlock[]): RenderedEmail {
  const [enSection, zhSection] = LANGS.map((lang) => section(lang, blocks(lang)));
  return renderBilingualEmail({ subject: { en: subject("en"), zh: subject("zh") }, en: enSection, zh: zhSection });
}

export function authEmail(kind: "login" | "signup"): RenderedEmail {
  return bilingual(
    (lang) => DICTS[lang].emails[kind].subject,
    (lang) => {
      const e = DICTS[lang].emails[kind];
      return [
        { kind: "heading", text: e.heading },
        { kind: "p", text: e.body },
        { kind: "button", label: e.button, url: AUTH_LINK },
        { kind: "small", text: e.ignore },
      ];
    },
  );
}

/** A session report (or absence note). Goals and supervisor notes appear as written in both parts. */
export function reportEmail(report: ReportCardData, origin: string): RenderedEmail {
  return bilingual(
    (lang) => fill(DICTS[lang].emails.report.subject, { name: report.student, date: report.date[lang] }),
    (lang) => {
      const d = DICTS[lang];
      const t = d.reportCard;
      const blocks: EmailBlock[] = [
        { kind: "heading", text: fill(d.emails.report.heading, { name: report.student }) },
        {
          kind: "fields",
          rows: [
            [t.date, report.date[lang]],
            [t.attendance, attendanceLine(report, lang, t)],
          ],
        },
      ];
      if (report.attendance.attended) {
        blocks.push(
          report.goals.length
            ? { kind: "list", title: t.goals, items: report.goals.map((g) => `${pick(g.text, lang)} · ${outcomeLabel(g.outcome, t)}`) }
            : { kind: "p", text: t.noGoals },
        );
        const notes: [string, string][] = [
          ...report.observations.map((note): [string, string] => [t.observations, pick(note, lang)]),
          ...(report.comment ? [[t.comment, report.comment] as [string, string]] : []),
        ];
        if (notes.length) blocks.push({ kind: "fields", rows: notes });
        blocks.push({ kind: "small", text: t.asWritten }, { kind: "small", text: d.landing.report.disclaimer });
      }
      blocks.push({ kind: "button", label: d.emails.report.button, url: origin + localizePath("/parent", lang) });
      return blocks;
    },
  );
}
