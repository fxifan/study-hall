import { z } from "zod";

/**
 * Tutor resources (docs/tutor-resources-spec.md): the JSON every practice set and writing-tips
 * sheet is stored, edited and printed from. Maths is plain text with Unicode symbols (x², √, π, ∫,
 * ≤): the print pages render it as written, so nothing depends on a maths renderer.
 */

export const FRAMEWORKS = ["vce", "vc"] as const;
export type Framework = (typeof FRAMEWORKS)[number];

export const DIFFICULTIES = ["foundation", "standard", "extension"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const QUESTION_TYPES = ["short", "mcq", "extended", "calculation"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  short: "Short answer",
  mcq: "Multiple choice",
  extended: "Extended response",
  calculation: "Worked calculation",
};

const text = (max: number) => z.string().trim().min(1).max(max);

export const questionSchema = z.object({
  type: z.enum(QUESTION_TYPES),
  marks: z.number().int().min(1).max(10),
  prompt: text(1500),
  /** Four options for multiple choice; empty otherwise. */
  options: z.array(text(300)).max(5),
  answer: text(600),
  solution: text(3000),
  /** 1-based indexes into the set's curriculum points. */
  covers: z.array(z.number().int().min(1)).max(12),
  /** Set by the answer check; the tutor clears it by editing or dismissing. */
  flag: z.string().max(400).nullable(),
});
export type Question = z.infer<typeof questionSchema>;

export const practiceSetSchema = z.object({
  instructions: z.string().trim().max(600),
  questions: z.array(questionSchema).min(1).max(15),
});
export type PracticeSet = z.infer<typeof practiceSetSchema>;

export const writingTipsSchema = z.object({
  intro: z.string().trim().max(800),
  sections: z.array(z.object({ heading: text(120), tips: z.array(text(400)).min(1).max(8), example: z.string().trim().max(800) })).min(1).max(8),
  mistakes: z.array(text(300)).max(8),
});
export type WritingTips = z.infer<typeof writingTipsSchema>;

export function unresolvedFlags(set: PracticeSet): number {
  return set.questions.filter((q) => q.flag).length;
}

// --- Model output (strict JSON schemas: every property required, no extras) ------------------

const str = { type: "string" } as const;
const strs = { type: "array", items: str } as const;

export const modelPracticeSetJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["instructions", "questions"],
  properties: {
    instructions: str,
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "marks", "prompt", "options", "answer", "solution", "covers"],
        properties: {
          type: { type: "string", enum: [...QUESTION_TYPES] },
          marks: { type: "integer" },
          prompt: str,
          options: strs,
          answer: str,
          solution: str,
          covers: { type: "array", items: { type: "integer" } },
        },
      },
    },
  },
} as const;

/** Lenient on numbers and counts (the server clamps them), strict on shape. */
export const modelPracticeSetSchema = z.object({
  instructions: z.string(),
  questions: z.array(
    z.object({
      type: z.enum(QUESTION_TYPES),
      marks: z.number().int(),
      prompt: z.string(),
      options: z.array(z.string()),
      answer: z.string(),
      solution: z.string(),
      covers: z.array(z.number().int()),
    }),
  ),
});

export const modelCheckJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["number", "own_answer", "agrees", "note"],
        properties: { number: { type: "integer" }, own_answer: str, agrees: { type: "boolean" }, note: str },
      },
    },
  },
} as const;

export const modelCheckSchema = z.object({
  results: z.array(z.object({ number: z.number().int(), own_answer: z.string(), agrees: z.boolean(), note: z.string() })),
});

export const modelWritingTipsJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["intro", "sections", "mistakes"],
  properties: {
    intro: str,
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "tips", "example"],
        properties: { heading: str, tips: strs, example: str },
      },
    },
    mistakes: strs,
  },
} as const;
