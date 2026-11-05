import type { Difficulty, Framework, PracticeSet, QuestionType } from "./schema";
import { QUESTION_TYPE_LABELS } from "./schema";

/**
 * Prompts for tutor resources (docs/tutor-resources-spec.md §3, §5). Pure functions, so tests can
 * check exactly what leaves the app: the level, subject, curriculum points, settings and, if the
 * tutor confirmed them, short topic phrases. Never a student's name, notes or report text.
 */

export type PointForPrompt = { area: string; code: string | null; summary: string };

export type SetRequest = {
  framework: Framework;
  subject: string;
  unitOrLevel: string;
  points: PointForPrompt[];
  count: number;
  difficulty: Difficulty;
  types: QuestionType[];
  /** Topic phrases the tutor confirmed on screen (e.g. "chain rule"). */
  focus: string[];
};

/** Subjects whose answers get the second "solve it yourself" check (spec §3). */
export function needsAnswerCheck(subject: string): boolean {
  return /math|methods|specialist|chemistry|physics|science/i.test(subject);
}

const levelName = (r: Pick<SetRequest, "framework" | "subject" | "unitOrLevel">) =>
  r.framework === "vce" ? `VCE ${r.subject} ${r.unitOrLevel}` : `${r.unitOrLevel} ${r.subject} (Victorian Curriculum)`;

const pointLines = (points: PointForPrompt[]) =>
  points.map((p, i) => `${i + 1}. [${p.area}${p.code ? `, ${p.code}` : ""}] ${p.summary}`).join("\n");

const RULES = `Rules:
- Write original questions. Never copy or closely paraphrase textbook, study guide or past VCAA exam questions.
- Australian spelling and metric units. Use VCAA command terms where they fit (explain, describe, analyse, evaluate, justify, calculate, show that).
- Write maths as plain text with Unicode symbols (x², √, π, ∫, ≤, →, ×, ÷). No LaTeX.
- Every question must be answerable from the question alone: give all data needed.
- No real people, brands or news events. No sensitive or distressing topics.`;

export function practiceSetPrompt(r: SetRequest): { system: string; user: string } {
  const system = `You write practice questions for tutors in Victoria, Australia. ${RULES}
- Each question covers one or more of the numbered curriculum points; list them in "covers" by number.
- "answer" is the final answer; "solution" is a full worked solution a student could follow, with the marking points for extended responses.
- Multiple choice: exactly four options in "options", with the correct option stated in "answer" (e.g. "B: 12"). Other types: "options" is empty.
- "marks" follows the work needed: 1 for a recall step, up to 10 for an extended response.
- "instructions": one or two sentences for the student (time suggestion, whether calculators are allowed).`;
  const user = `Level: ${levelName(r)}
Curriculum points:
${pointLines(r.points)}

Write ${r.count} questions at ${r.difficulty} difficulty.
Question types to use: ${r.types.map((t) => QUESTION_TYPE_LABELS[t]).join(", ")}.${
    r.focus.length ? `\nThe tutor's recent topics with this student (use as context only): ${r.focus.join("; ")}.` : ""
  }`;
  return { system, user };
}

/** The answer check: solve each question first, then compare with the proposed answer. */
export function answerCheckPrompt(r: Pick<SetRequest, "framework" | "subject" | "unitOrLevel">, set: Pick<PracticeSet, "questions">) {
  const system = `You check practice questions for ${levelName(r)}. For each numbered question, solve it yourself step by step, then compare your answer with the proposed answer. Set "agrees" to false if the proposed answer is wrong, incomplete, or the question can't be answered from what it gives. "note" is one short sentence for the tutor when "agrees" is false, otherwise empty.`;
  const user = set.questions
    .map((q, i) => `Question ${i + 1}: ${q.prompt}${q.options.length ? `\nOptions: ${q.options.join(" | ")}` : ""}\nProposed answer: ${q.answer}`)
    .join("\n\n");
  return { system, user };
}

export type TipsRequest = { outcome: string; summary: string; focus: string[] };

/** VCE English writing tips for one study design outcome (spec §2). */
export function writingTipsPrompt(r: TipsRequest): { system: string; user: string } {
  const system = `You write writing guides for tutors of VCE English students in Victoria, Australia. ${RULES}
- General writing advice only: structure, topic sentences, using and embedding evidence, analysing language and authorial choices, conclusions, timing in the exam. Never discuss the content, characters or themes of any particular set text.
- "sections": 3 to 6 headed sections of short, practical tips. "example" in each section is a short model sentence or paragraph about an invented text or issue (empty if not useful).
- "mistakes": common mistakes that lose marks, each with the fix.`;
  const user = `Outcome: ${r.outcome}
What it asks of students: ${r.summary}${r.focus.length ? `\nThe tutor wants extra focus on: ${r.focus.join("; ")}.` : ""}`;
  return { system, user };
}

/** Topic phrases a tutor typed or confirmed: short, no names or sentences (spec §5). */
export function cleanFocus(raw: string): string[] {
  return raw
    .split(/[;\n,]/)
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter((s) => s.length >= 2 && s.length <= 60)
    .slice(0, 6);
}
