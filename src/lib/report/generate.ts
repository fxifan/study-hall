import { LlmError, type Llm } from "@/lib/llm";
import { hasSourceMaterial, quoteIsGrounded } from "./grounding";
import { DRAFT_SYSTEM_PROMPT, STUDENT_TOKEN, TRANSLATE_SYSTEM_PROMPT, draftUserPrompt, translateUserPrompt } from "./prompt";
import {
  EMPTY_CONTENT,
  MODEL_DRAFT_JSON_SCHEMA,
  MODEL_TRANSLATION_JSON_SCHEMA,
  modelDraftSchema,
  modelTranslationSchema,
  type Draft,
  type ReportContent,
  type ReportLang,
} from "./schema";
import { isSensitive } from "./sensitive";

/**
 * generateReport(): note → draft report (docs/tutor-reports-spec.md §4). The model is injected,
 * so tests run the whole pipeline with a fake.
 *
 *   1. Screen the note for sensitive content (deterministic, plus the model's own flag).
 *   2. Too little to go on → an empty draft, without calling the model. Nothing is invented.
 *   3. Swap the student's first name for a pseudonym, then ask for grounded JSON.
 *   4. Keep only items whose quote is found in the note, that don't touch sensitive content, and
 *      that don't label, compare or predict. Cap each section.
 *   5. Chinese is translated from the English JSON, never re-summarised from the note.
 *   6. Put the first name back.
 */
export type GenerateInput = {
  note: string;
  studentFirstName: string;
  subjects: string[];
  durationMin: number;
  yearLevel: number | null;
  langs: ReportLang[];
};

export type GenerateResult = { draft: Draft; tokens: number };

const CAPS = { covered: 5, wentWell: 2, nextFocus: 2, homework: 3 } as const;

/** Labels, comparisons and predictions a report must never contain (spec §4). */
const EVALUATIVE = [
  /\b(?:lazy|gifted|talented|smart|clever|bright|dumb|stupid|slow learner|careless|weak (?:at|in)|naturally good|genius|unmotivated)\b/i,
  /\b(?:better|worse|ahead|behind) (?:than|of) (?:other|most|the other|his|her|their) (?:students|kids|classmates|peers)\b/i,
  /\b(?:top|bottom) of (?:the|his|her|their) class\b/i,
  /\b(?:will|should|on track to|likely to|expect(?:ed)? to) (?:get|score|achieve|receive)\b.*\b(?:atar|mark|score|grade|band|study score|\d)/i,
  /\batar\s*(?:of|around|about)?\s*\d/i,
  /懒|聪明|天才|笨|比其他(?:同学|学生)|预计.*(?:分|ATAR)/,
];

export function breaksReportRules(text: string): boolean {
  return EVALUATIVE.some((p) => p.test(text));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function pseudonymise(note: string, firstName: string): string {
  const name = firstName.trim();
  if (!name) return note;
  return note.replace(new RegExp(`(?<!\\p{Script=Latin})${escapeRegExp(name)}(?!\\p{Script=Latin})`, "giu"), STUDENT_TOKEN);
}

export function restoreName(content: ReportContent, firstName: string): ReportContent {
  const put = (s: string) => s.split(STUDENT_TOKEN).join(firstName);
  return {
    covered: content.covered.map(put),
    wentWell: content.wentWell.map(put),
    nextFocus: content.nextFocus.map(put),
    homework: content.homework.map(put),
    tutorNote: put(content.tutorNote),
  };
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export async function generateReport(input: GenerateInput, llm: Llm): Promise<GenerateResult> {
  const noteSensitive = isSensitive(input.note);
  const empty = (): GenerateResult => ({
    draft: {
      body: Object.fromEntries((["en", ...input.langs] as ReportLang[]).map((l) => [l, { ...EMPTY_CONTENT }])),
      sensitive: noteSensitive,
      tooShort: true,
      dropped: 0,
      model: null,
    },
    tokens: 0,
  });
  if (!hasSourceMaterial(input.note)) return empty();

  const note = pseudonymise(input.note, input.studentFirstName);
  const completion = await llm.json({
    system: DRAFT_SYSTEM_PROMPT,
    user: draftUserPrompt({ note, subjects: input.subjects, durationMin: input.durationMin, yearLevel: input.yearLevel }),
    schemaName: "session_report",
    schema: MODEL_DRAFT_JSON_SCHEMA,
  });
  const parsed = modelDraftSchema.safeParse(completion.data);
  if (!parsed.success) throw new LlmError("The draft didn't match the report format.");
  const model = parsed.data;

  let dropped = 0;
  let sensitive = noteSensitive || model.sensitive;
  const keep = (items: { text: string; quote: string }[], cap: number): string[] => {
    const kept: string[] = [];
    for (const item of items) {
      const text = clean(item.text);
      if (!text) continue;
      if (isSensitive(text)) {
        sensitive = true; // never in the parent report, and the tutor is told
        continue;
      }
      if (!quoteIsGrounded(item.quote, note) || breaksReportRules(text)) {
        dropped += 1;
        continue;
      }
      if (kept.length < cap) kept.push(text.slice(0, 300));
    }
    return kept;
  };

  const en: ReportContent = {
    covered: keep(model.covered, CAPS.covered),
    wentWell: keep(model.went_well, CAPS.wentWell),
    nextFocus: keep(model.next_focus, CAPS.nextFocus),
    homework: keep(model.homework, CAPS.homework),
    tutorNote: keep(model.tutor_note ? [model.tutor_note] : [], 1)[0] ?? "",
  };

  let tokens = completion.tokens;
  const body: Draft["body"] = { en };
  if (input.langs.includes("zh-CN")) {
    const zh = await translateReport(en, llm);
    tokens += zh.tokens;
    body["zh-CN"] = zh.content;
  }

  return {
    draft: {
      body: Object.fromEntries(Object.entries(body).map(([lang, c]) => [lang, restoreName(c, input.studentFirstName)])),
      sensitive,
      tooShort: false,
      dropped,
      model: completion.model,
    },
    tokens,
  };
}

/**
 * English content → Simplified Chinese with the same items, in the same order (spec §4: translate
 * the JSON, don't re-summarise). Used for the first draft and for "Translate again" after edits.
 */
export async function translateReport(en: ReportContent, llm: Llm): Promise<{ content: ReportContent; tokens: number }> {
  const source = {
    covered: en.covered,
    went_well: en.wentWell,
    next_focus: en.nextFocus,
    homework: en.homework,
    tutor_note: en.tutorNote,
  };
  const empty = !source.covered.length && !source.went_well.length && !source.next_focus.length && !source.homework.length && !source.tutor_note;
  if (empty) return { content: { ...EMPTY_CONTENT }, tokens: 0 };

  const completion = await llm.json({
    system: TRANSLATE_SYSTEM_PROMPT,
    user: translateUserPrompt(source),
    schemaName: "session_report_zh",
    schema: MODEL_TRANSLATION_JSON_SCHEMA,
  });
  const parsed = modelTranslationSchema.safeParse(completion.data);
  const sameShape =
    parsed.success &&
    parsed.data.covered.length === source.covered.length &&
    parsed.data.went_well.length === source.went_well.length &&
    parsed.data.next_focus.length === source.next_focus.length &&
    parsed.data.homework.length === source.homework.length &&
    Boolean(parsed.data.tutor_note.trim()) === Boolean(source.tutor_note.trim());
  if (!parsed.success || !sameShape) throw new LlmError("The translation didn't match the English report.");
  const t = parsed.data;
  return {
    content: {
      covered: t.covered.map(clean),
      wentWell: t.went_well.map(clean),
      nextFocus: t.next_focus.map(clean),
      homework: t.homework.map(clean),
      tutorNote: clean(t.tutor_note),
    },
    tokens: completion.tokens,
  };
}
