/**
 * Bilingual email layout (comprehensive brief §6): one email, the complete English version first,
 * a separator, then the complete Simplified Chinese version. Simple table HTML with inline styles
 * (no external fonts, scripts or animation) and a plain-text alternative. Every piece of text is
 * escaped, so names, goals and notes can't break the markup.
 */
export type EmailBlock =
  | { kind: "heading"; text: string }
  | { kind: "p"; text: string }
  | { kind: "small"; text: string }
  | { kind: "button"; label: string; url: string }
  | { kind: "fields"; rows: [label: string, value: string][] }
  | { kind: "list"; title: string; items: string[] };

export type EmailSection = {
  /** Shown above the section: "English" or "简体中文". */
  label: string;
  lang: "en" | "zh-CN";
  /** ": " in English, "：" in Chinese. */
  colon: string;
  blocks: EmailBlock[];
  footer: string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

// Single quotes: this goes inside style="…" attributes.
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";
const INK = "#25283b"; // Edumi charcoal
const SOFT = "#667085"; // slate
const RULE = "#e6e8f0";
const LAVENDER = "#a99aff";
const MIDNIGHT = "#171a35";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function blockHtml(block: EmailBlock, colon: string): string {
  switch (block.kind) {
    case "heading":
      return `<h2 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:600;color:${INK};">${escapeHtml(block.text)}</h2>`;
    case "p":
      return `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${INK};">${escapeHtml(block.text)}</p>`;
    case "small":
      return `<p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:${SOFT};">${escapeHtml(block.text)}</p>`;
    case "button":
      return `<p style="margin:16px 0 20px;"><a href="${escapeHtml(block.url)}" style="display:inline-block;background:${INK};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:11px 20px;border-radius:6px;">${escapeHtml(block.label)}</a></p>`;
    case "fields":
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px;font-size:15px;line-height:1.5;color:${INK};">${block.rows
        .map(
          ([label, value]) =>
            `<tr><td style="padding:2px 12px 2px 0;color:${SOFT};vertical-align:top;white-space:nowrap;">${escapeHtml(label + colon.trimEnd())}</td><td style="padding:2px 0;vertical-align:top;">${escapeHtml(value)}</td></tr>`,
        )
        .join("")}</table>`;
    case "list":
      return `<p style="margin:0 0 4px;font-size:15px;line-height:1.5;color:${SOFT};">${escapeHtml(block.title + colon.trimEnd())}</p><ul style="margin:0 0 12px;padding-left:20px;font-size:15px;line-height:1.6;color:${INK};">${block.items
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("")}</ul>`;
  }
}

function blockText(block: EmailBlock, colon: string): string {
  switch (block.kind) {
    case "heading":
      return block.text;
    case "p":
    case "small":
      return block.text;
    case "button":
      return `${block.label}${colon}${block.url}`;
    case "fields":
      return block.rows.map(([label, value]) => `${label}${colon}${value}`).join("\n");
    case "list":
      return [block.title + colon.trimEnd(), ...block.items.map((item) => `  - ${item}`)].join("\n");
  }
}

function sectionHtml(section: EmailSection): string {
  return `<tr><td lang="${section.lang}" style="padding:24px 28px 8px;font-family:${FONT};">
<p style="margin:0 0 14px;font-size:12px;line-height:1;letter-spacing:.08em;text-transform:uppercase;font-weight:600;color:${SOFT};">${escapeHtml(section.label)}</p>
${section.blocks.map((b) => blockHtml(b, section.colon)).join("\n")}
<p style="margin:16px 0 8px;font-size:13px;line-height:1.5;color:${SOFT};">${escapeHtml(section.footer)}</p>
</td></tr>`;
}

function sectionText(section: EmailSection): string {
  return [section.label, "=".repeat(section.label === "English" ? 7 : 8), "", ...section.blocks.map((b) => blockText(b, section.colon)), "", section.footer].join("\n");
}

/** One email with the English section first and the Simplified Chinese section below it. */
export function renderBilingualEmail({
  subject,
  en,
  zh,
}: {
  subject: { en: string; zh: string };
  en: EmailSection;
  zh: EmailSection;
}): RenderedEmail {
  return renderEmail({ subject: `${subject.en} · ${subject.zh}`, sections: [en, zh] });
}

/**
 * The same layout with any number of language sections (one for a single-language email), and an
 * optional brand line in place of "Edumi" (tutor reports carry the tutor's business name).
 */
export function renderEmail({
  subject: fullSubject,
  sections,
  brand = "Edumi",
  htmlLang = "en",
}: {
  subject: string;
  sections: EmailSection[];
  brand?: string;
  htmlLang?: string;
}): RenderedEmail {
  const separator = `<tr><td style="padding:8px 28px;"><hr style="border:0;border-top:1px solid ${RULE};margin:0;"></td></tr>`;
  const html = `<!doctype html>
<html lang="${escapeHtml(htmlLang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(fullSubject)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f3ec;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f3ec;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;">
<tr><td style="padding:24px 28px 0;font-family:${FONT};font-size:${brand === "Edumi" ? "22px;font-weight:800;letter-spacing:-0.5px" : "16px;font-weight:600"};color:${brand === "Edumi" ? MIDNIGHT : INK};">${brand === "Edumi" ? `edumi<span style="color:${LAVENDER};">.</span>` : escapeHtml(brand)}</td></tr>
${sections.map(sectionHtml).join(`\n${separator}\n`)}
</table>
</td></tr>
</table>
</body>
</html>
`;
  const text = `${sections.map(sectionText).join("\n\n---\n\n")}\n`;
  return { subject: fullSubject, html, text };
}

/**
 * The plain-text body only, for an email the tutor sends from their own app (mailto: or share).
 * No footer; language headings only when there's more than one language.
 */
export function plainTextBody(sections: EmailSection[], signOff?: string): string {
  const parts = sections.map((section) => {
    const lines = section.blocks.map((b) => blockText(b, section.colon));
    return (sections.length > 1 ? [section.label, ...lines] : lines).join("\n\n");
  });
  const body = parts.join("\n\n---\n\n");
  return signOff ? `${body}\n\n${signOff}` : body;
}
