import { describe, expect, it } from "vitest";
import type { Llm } from "@/lib/llm";
import { resourceAccess } from "./access";
import { generatePracticeSet, generateWritingTips, offlineResourceLlm } from "./generate";
import { cleanFocus, needsAnswerCheck, practiceSetPrompt, type SetRequest } from "./prompt";
import { unresolvedFlags } from "./schema";

const request: SetRequest = {
  framework: "vce",
  subject: "Mathematical Methods",
  unitOrLevel: "Unit 3",
  points: [
    { area: "Calculus", code: null, summary: "Derivatives using the chain, product and quotient rules." },
    { area: "Calculus", code: null, summary: "Tangents and normals to curves." },
  ],
  count: 4,
  difficulty: "standard",
  types: ["short", "mcq"],
  focus: ["chain rule"],
};

/** Records what was sent, returns canned answers. */
function fakeLlm(responses: Record<string, unknown>): Llm & { sent: { schemaName: string; user: string; system: string }[] } {
  const sent: { schemaName: string; user: string; system: string }[] = [];
  return {
    sent,
    async json(req) {
      sent.push(req);
      return { data: responses[req.schemaName], tokens: 100, model: "fake" };
    },
  };
}

const q = (over: object = {}) => ({
  type: "short",
  marks: 2,
  prompt: "Differentiate (2x + 1)³.",
  options: [],
  answer: "6(2x + 1)²",
  solution: "Chain rule: 3(2x + 1)² × 2.",
  covers: [1, 7],
  ...over,
});

describe("practice sets", () => {
  it("sends only level, points, settings and confirmed topics", () => {
    const { user, system } = practiceSetPrompt(request);
    expect(user).toContain("VCE Mathematical Methods Unit 3");
    expect(user).toContain("1. [Calculus] Derivatives using the chain");
    expect(user).toContain("chain rule");
    expect(system).toMatch(/Never copy/);
  });

  it("cleans up model output and flags answers the check disagrees with", async () => {
    const llm = fakeLlm({
      practice_set: { instructions: "20 minutes.", questions: [q(), q({ marks: 40 }), q({ type: "mcq", options: ["A", "B", "C", "D"] }), q(), q()] },
      answer_check: {
        results: [
          { number: 1, own_answer: "6(2x+1)²", agrees: true, note: "" },
          { number: 2, own_answer: "3(2x+1)²", agrees: false, note: "Missing the factor of 2." },
          { number: 3, own_answer: "B", agrees: true, note: "" },
        ],
      },
    });
    const set = await generatePracticeSet(llm, request);
    expect(set.content.questions).toHaveLength(4); // capped at the requested count
    expect(set.content.questions[0].covers).toEqual([1]); // out-of-range point dropped
    expect(set.content.questions[0].options).toEqual([]);
    expect(set.content.questions[1].marks).toBe(10);
    expect(set.content.questions[1].flag).toMatch(/Missing the factor of 2\. Check's answer: 3\(2x\+1\)²/);
    expect(set.content.questions[3].flag).toMatch(/skipped this question/);
    expect(unresolvedFlags(set.content)).toBe(2);
    expect(set.tokens).toBe(200);
    expect(llm.sent[1].user).toContain("Proposed answer: 6(2x + 1)²");
  });

  it("skips the answer check outside maths and science", async () => {
    expect(needsAnswerCheck("Biology")).toBe(false);
    expect(needsAnswerCheck("Specialist Mathematics")).toBe(true);
    const llm = fakeLlm({ practice_set: { instructions: "", questions: [q()] } });
    await generatePracticeSet(llm, { ...request, subject: "Biology", count: 1 });
    expect(llm.sent.map((s) => s.schemaName)).toEqual(["practice_set"]);
  });

  it("rejects output in the wrong shape", async () => {
    await expect(generatePracticeSet(fakeLlm({ practice_set: { nope: true } }), request)).rejects.toThrow(/wrong shape/);
  });

  it("works offline, with one flag to resolve", async () => {
    const set = await generatePracticeSet(offlineResourceLlm(), request);
    expect(set.content.questions).toHaveLength(4);
    expect(unresolvedFlags(set.content)).toBe(1);
  });
});

describe("writing tips", () => {
  it("parses tips and never asks about set texts", async () => {
    const llm = fakeLlm({ writing_tips: { intro: "Hi", sections: [{ heading: "Structure", tips: ["Topic sentences."], example: "" }], mistakes: [] } });
    const tips = await generateWritingTips(llm, { outcome: "Analysing argument", summary: "Analyse how arguments persuade.", focus: [] });
    expect(tips.content.sections[0].heading).toBe("Structure");
    expect(llm.sent[0].system).toMatch(/Never discuss the content, characters or themes/);
  });
});

describe("cleanFocus", () => {
  it("keeps short topic phrases only", () => {
    expect(cleanFocus("chain rule; titration,\n x ; " + "a".repeat(80))).toEqual(["chain rule", "titration"]);
  });
});

describe("resourceAccess", () => {
  const now = new Date("2026-11-05T00:00:00Z");
  const future = "2026-11-10T00:00:00Z";
  it("gives the trial 3 in total", () => {
    expect(resourceAccess({ plan: "trial", trialEndsAt: future, thisMonth: 2, total: 2 }, now)).toEqual({ ok: true, left: 1 });
    expect(resourceAccess({ plan: "trial", trialEndsAt: future, thisMonth: 3, total: 3 }, now)).toEqual({ ok: false, reason: "trial_limit" });
    expect(resourceAccess({ plan: "trial", trialEndsAt: "2026-11-01T00:00:00Z", thisMonth: 0, total: 0 }, now)).toEqual({ ok: false, reason: "trial_ended" });
  });
  it("gives Solo 60 a month", () => {
    expect(resourceAccess({ plan: "solo", trialEndsAt: "2026-01-01T00:00:00Z", thisMonth: 59, total: 400 }, now)).toEqual({ ok: true, left: 1 });
    expect(resourceAccess({ plan: "solo", trialEndsAt: "2026-01-01T00:00:00Z", thisMonth: 60, total: 400 }, now)).toEqual({ ok: false, reason: "monthly_cap" });
  });
});
