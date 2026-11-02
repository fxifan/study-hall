import { z } from "zod";

/**
 * Tutor session report: the JSON every report is stored, edited and rendered from
 * (docs/tutor-reports-spec.md §4). The "Session" line (date, time, subjects) comes from the
 * session's metadata, never from the model.
 *
 * Fixed order: Session · Covered · Went well · Next focus · Homework (optional) · Tutor note (optional).
 * An empty section is left out of every rendering.
 */

export const REPORT_LANGS = ["en", "zh-CN"] as const;
export type ReportLang = (typeof REPORT_LANGS)[number];
export type FamilyReportLang = ReportLang | "both";

export function langsFor(pref: FamilyReportLang): ReportLang[] {
  return pref === "both" ? ["en", "zh-CN"] : [pref];
}

const item = z.string().trim().min(1).max(300);

/** One language's report content, as edited by the tutor. */
export const reportContentSchema = z.object({
  covered: z.array(item).max(8),
  wentWell: z.array(item).max(2),
  nextFocus: z.array(item).max(2),
  homework: z.array(item).max(4),
  tutorNote: z.string().trim().max(400),
});
export type ReportContent = z.infer<typeof reportContentSchema>;

export const EMPTY_CONTENT: ReportContent = { covered: [], wentWell: [], nextFocus: [], homework: [], tutorNote: "" };

/** A report in one or both languages. */
export const reportBodySchema = z
  .object({ en: reportContentSchema.optional(), "zh-CN": reportContentSchema.optional() })
  .refine((v) => v.en || v["zh-CN"], "A report needs at least one language.");
export type ReportBody = z.infer<typeof reportBodySchema>;

/** What the AI drafted, plus what the tutor needs to know about the draft (shown only to them). */
export const draftSchema = z.object({
  body: reportBodySchema,
  /** The note mentioned wellbeing or safety; that content was left out of the report. */
  sensitive: z.boolean(),
  /** The note was empty or too short to draft from; nothing was invented. */
  tooShort: z.boolean(),
  /** Items the model wrote that couldn't be matched to the note, so they were dropped. */
  dropped: z.number().int().min(0),
  model: z.string().nullable(),
});
export type Draft = z.infer<typeof draftSchema>;

// --- Model output ------------------------------------------------------------------------------

/**
 * What the drafting model must return. Each item carries a short verbatim quote from the note,
 * which the server checks against the note (grounding.ts) before keeping the item.
 */
const groundedItem = z.object({ text: z.string(), quote: z.string() });
export const modelDraftSchema = z.object({
  covered: z.array(groundedItem),
  went_well: z.array(groundedItem),
  next_focus: z.array(groundedItem),
  homework: z.array(groundedItem),
  tutor_note: groundedItem.nullable(),
  sensitive: z.boolean(),
});
export type ModelDraft = z.infer<typeof modelDraftSchema>;

/** The translation model returns the same shape, without quotes. */
export const modelTranslationSchema = z.object({
  covered: z.array(z.string()),
  went_well: z.array(z.string()),
  next_focus: z.array(z.string()),
  homework: z.array(z.string()),
  tutor_note: z.string(),
});
export type ModelTranslation = z.infer<typeof modelTranslationSchema>;

// JSON Schemas for structured output (OpenAI strict mode: every property required, no extras).
const groundedItemJson = {
  type: "object",
  additionalProperties: false,
  required: ["text", "quote"],
  properties: {
    text: { type: "string", description: "One short factual sentence or phrase for the parent." },
    quote: { type: "string", description: "The exact words from the note that this item is based on." },
  },
} as const;
const groundedList = (description: string) => ({ type: "array", description, items: groundedItemJson }) as const;

export const MODEL_DRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["covered", "went_well", "next_focus", "homework", "tutor_note", "sensitive"],
  properties: {
    covered: groundedList("What was worked on. Up to 5 items."),
    went_well: groundedList("At most 2 specific things that went well, only if the note says so."),
    next_focus: groundedList("At most 2 specific things to work on next, only if the note says so."),
    homework: groundedList("Homework set, only if the note mentions homework. Up to 3 items."),
    tutor_note: { anyOf: [groundedItemJson, { type: "null" }] },
    sensitive: {
      type: "boolean",
      description: "true if the note mentions wellbeing, mental health, safety, self-harm, abuse or family conflict.",
    },
  },
} as const;

const stringList = { type: "array", items: { type: "string" } } as const;
export const MODEL_TRANSLATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["covered", "went_well", "next_focus", "homework", "tutor_note"],
  properties: {
    covered: stringList,
    went_well: stringList,
    next_focus: stringList,
    homework: stringList,
    tutor_note: { type: "string" },
  },
} as const;

// --- Helpers -----------------------------------------------------------------------------------

export function isEmptyContent(c: ReportContent): boolean {
  return !c.covered.length && !c.wentWell.length && !c.nextFocus.length && !c.homework.length && !c.tutorNote.trim();
}

/** Words for the English limit; for Chinese, characters / 2 (roughly one word per two characters). */
export function wordCount(c: ReportContent, lang: ReportLang): number {
  const text = [...c.covered, ...c.wentWell, ...c.nextFocus, ...c.homework, c.tutorNote].join(" ");
  if (lang === "zh-CN") {
    const cjk = text.match(/[㐀-鿿]/g)?.length ?? 0;
    const latin = text.replace(/[㐀-鿿]/g, " ").split(/\s+/).filter(Boolean).length;
    return Math.ceil(cjk / 2) + latin;
  }
  return text.split(/\s+/).filter(Boolean).length;
}

/** Spec §4: under 120 words per language (the session line isn't counted). */
export const WORD_LIMIT = 120;
