import type { Llm } from "@/lib/llm";
import { answerCheckPrompt, needsAnswerCheck, practiceSetPrompt, writingTipsPrompt, type SetRequest, type TipsRequest } from "./prompt";
import {
  modelCheckJsonSchema,
  modelCheckSchema,
  modelPracticeSetJsonSchema,
  modelPracticeSetSchema,
  modelWritingTipsJsonSchema,
  practiceSetSchema,
  writingTipsSchema,
  type PracticeSet,
  type WritingTips,
} from "./schema";

/**
 * Generation for tutor resources (spec §3). Takes an `Llm`, so tests pass a fake one. Returns
 * the parsed content plus tokens used (for usage logging) and the raw model output (kept on the
 * row as draft_json for quality checks).
 */
export type Generated<T> = { content: T; tokens: number; model: string; raw: unknown };

export class ResourceError extends Error {}

export async function generatePracticeSet(llm: Llm, request: SetRequest): Promise<Generated<PracticeSet>> {
  const { system, user } = practiceSetPrompt(request);
  const draft = await llm.json({ system, user, schemaName: "practice_set", schema: modelPracticeSetJsonSchema });
  const parsed = modelPracticeSetSchema.safeParse(draft.data);
  if (!parsed.success) throw new ResourceError("The practice set came back in the wrong shape. Try again.");

  const max = request.points.length;
  const questions = parsed.data.questions.slice(0, request.count).map((q) => ({
    ...q,
    prompt: q.prompt.trim().slice(0, 1500),
    answer: q.answer.trim().slice(0, 600),
    solution: q.solution.trim().slice(0, 3000),
    options: q.type === "mcq" ? q.options.map((o) => o.trim().slice(0, 300)).filter(Boolean).slice(0, 5) : [],
    marks: Math.min(10, Math.max(1, q.marks)),
    covers: [...new Set(q.covers.filter((n) => n >= 1 && n <= max))],
    flag: q.type === "mcq" && q.options.length < 2 ? "Multiple choice without enough options: add or rewrite them." : null,
  }));
  let set: PracticeSet = { instructions: parsed.data.instructions.trim().slice(0, 600), questions: questions.filter((x) => x.prompt && x.answer && x.solution) };
  let tokens = draft.tokens;

  if (needsAnswerCheck(request.subject)) {
    const check = await checkAnswers(llm, request, set);
    set = check.set;
    tokens += check.tokens;
  }
  const valid = practiceSetSchema.safeParse(set);
  if (!valid.success) throw new ResourceError("The practice set came back incomplete. Try again.");
  return { content: valid.data, tokens, model: draft.model, raw: draft.data };
}

/** Flags every question whose proposed answer the checker disagrees with. */
export async function checkAnswers(
  llm: Llm,
  request: Pick<SetRequest, "framework" | "subject" | "unitOrLevel">,
  set: PracticeSet,
): Promise<{ set: PracticeSet; tokens: number }> {
  const { system, user } = answerCheckPrompt(request, set);
  const result = await llm.json({ system, user, schemaName: "answer_check", schema: modelCheckJsonSchema });
  const parsed = modelCheckSchema.safeParse(result.data);
  if (!parsed.success) {
    // A failed check never passes silently: every question is marked for the tutor to check.
    return { set: { ...set, questions: set.questions.map((q) => ({ ...q, flag: q.flag ?? "The answer check didn't run. Check this answer." })) }, tokens: result.tokens };
  }
  const byNumber = new Map(parsed.data.results.map((r) => [r.number, r]));
  return {
    set: {
      ...set,
      questions: set.questions.map((q, i) => {
        const r = byNumber.get(i + 1);
        if (!r) return { ...q, flag: q.flag ?? "The answer check skipped this question. Check this answer." };
        if (r.agrees) return q;
        const note = r.note.trim() || "The check got a different answer.";
        return { ...q, flag: `${note} Check's answer: ${r.own_answer.trim() || "none"}`.slice(0, 400) };
      }),
    },
    tokens: result.tokens,
  };
}

export async function generateWritingTips(llm: Llm, request: TipsRequest): Promise<Generated<WritingTips>> {
  const { system, user } = writingTipsPrompt(request);
  const draft = await llm.json({ system, user, schemaName: "writing_tips", schema: modelWritingTipsJsonSchema });
  const parsed = writingTipsSchema.safeParse(draft.data);
  if (!parsed.success) throw new ResourceError("The writing tips came back in the wrong shape. Try again.");
  return { content: parsed.data, tokens: draft.tokens, model: draft.model, raw: draft.data };
}

/**
 * Offline stand-in for local development and tests (no OPENAI_API_KEY): fixed, clearly labelled
 * content in the right shape, so every page can be exercised. Never used in production.
 */
export function offlineResourceLlm(): Llm {
  return {
    async json({ schemaName, user }) {
      if (schemaName === "answer_check") {
        const count = (user.match(/^Question \d+:/gm) ?? []).length;
        // The second question always disagrees, so the flag flow can be tested.
        const results = Array.from({ length: count }, (_, i) => ({
          number: i + 1,
          own_answer: i === 1 ? "x = 4" : "same",
          agrees: i !== 1,
          note: i === 1 ? "Offline check: pretend disagreement." : "",
        }));
        return { data: { results }, tokens: 0, model: "offline" };
      }
      if (schemaName === "writing_tips") {
        return {
          data: {
            intro: "Offline sample: writing tips appear here when the AI service is connected.",
            sections: [{ heading: "Structure", tips: ["Open each paragraph with a clear topic sentence."], example: "" }],
            mistakes: ["Retelling instead of analysing: name the technique and its effect."],
          },
          tokens: 0,
          model: "offline",
        };
      }
      const count = Number(/Write (\d+) questions/.exec(user)?.[1] ?? 5);
      const questions = Array.from({ length: count }, (_, i) => ({
        type: i === 0 ? "mcq" : "short",
        marks: 2,
        prompt: `Offline sample question ${i + 1}: solve 2x + ${i + 1} = ${i + 9}.`,
        options: i === 0 ? ["A: x = 4", "B: x = 5", "C: x = 3", "D: x = 8"] : [],
        answer: i === 0 ? "A: x = 4" : "x = 4",
        solution: `Subtract ${i + 1} from both sides: 2x = 8, so x = 4.`,
        covers: [1],
      }));
      return { data: { instructions: "Offline sample. 20 minutes, calculator allowed.", questions }, tokens: 0, model: "offline" };
    },
  };
}
