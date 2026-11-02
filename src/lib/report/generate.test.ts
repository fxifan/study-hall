import { describe, expect, it } from "vitest";
import type { JsonRequest, Llm } from "@/lib/llm";
import { FIXTURES, type Fixture } from "./fixtures/transcripts";
import { generateReport, pseudonymise, translateReport } from "./generate";
import { quoteIsGrounded } from "./grounding";
import { STUDENT_TOKEN } from "./prompt";
import { draftSchema, isEmptyContent, reportBodySchema, wordCount, type ReportContent } from "./schema";
import { isSensitive } from "./sensitive";

/** A fake model: returns the fixture's canned draft, and a canned translation. Records requests. */
function fakeLlm(fixture: Fixture, translation?: (source: Record<string, unknown>) => unknown) {
  const requests: JsonRequest[] = [];
  const llm: Llm = {
    async json(request) {
      requests.push(request);
      if (request.schemaName === "session_report") {
        if (!fixture.model) throw new Error("model should not be called for this fixture");
        return { data: fixture.model, tokens: 500, model: "fake" };
      }
      const source = JSON.parse(request.user.slice(request.user.indexOf("{")));
      const zh = (s: string) => `中文：${s}`;
      return {
        data: translation
          ? translation(source)
          : {
              covered: source.covered.map(zh),
              went_well: source.went_well.map(zh),
              next_focus: source.next_focus.map(zh),
              homework: source.homework.map(zh),
              tutor_note: source.tutor_note ? zh(source.tutor_note) : "",
            },
        tokens: 300,
        model: "fake",
      };
    },
  };
  return { llm, requests };
}

const run = (f: Fixture, langs: ("en" | "zh-CN")[] = ["en"], llm = fakeLlm(f)) =>
  generateReport({ note: f.note, studentFirstName: f.student, subjects: f.subjects, durationMin: 60, yearLevel: 11, langs }, llm.llm).then((r) => ({
    ...r,
    requests: llm.requests,
  }));

const allText = (c: ReportContent) => [...c.covered, ...c.wentWell, ...c.nextFocus, ...c.homework, c.tutorNote].join(" | ");

describe("report schema", () => {
  it("accepts a valid draft and rejects malformed ones", async () => {
    const { draft } = await run(FIXTURES.normal);
    expect(draftSchema.safeParse(draft).success).toBe(true);
    expect(reportBodySchema.safeParse({}).success).toBe(false);
    expect(reportBodySchema.safeParse({ en: { covered: [""], wentWell: [], nextFocus: [], homework: [], tutorNote: "" } }).success).toBe(false);
    expect(
      reportBodySchema.safeParse({ en: { covered: [], wentWell: ["a", "b", "c"], nextFocus: [], homework: [], tutorNote: "" } }).success,
    ).toBe(false); // at most 2 "went well"
  });

  it("rejects model output that doesn't match the format", async () => {
    const bad = { ...FIXTURES.normal, model: { covered: "not a list" } as never };
    await expect(run(bad)).rejects.toThrow(/format/);
  });
});

describe("grounding", () => {
  it("empty and very short notes: empty draft, no model call, nothing invented", async () => {
    for (const f of [FIXTURES.empty, FIXTURES.tooShort]) {
      const { draft, requests, tokens } = await run(f, ["en", "zh-CN"]);
      expect(requests).toHaveLength(0);
      expect(tokens).toBe(0);
      expect(draft.tooShort).toBe(true);
      expect(isEmptyContent(draft.body.en!)).toBe(true);
      expect(isEmptyContent(draft.body["zh-CN"]!)).toBe(true);
    }
  });

  it("keeps grounded items from an ordinary note, in the fixed sections", async () => {
    const { draft } = await run(FIXTURES.normal);
    const en = draft.body.en!;
    expect(en.covered).toHaveLength(2);
    expect(en.wentWell).toEqual(["Mole conversions done with no mistakes"]);
    expect(en.homework).toEqual(["Questions 4.12–4.20"]);
    expect(en.tutorNote).toBe("The SAC is on the 14th.");
    expect(draft.dropped).toBe(0);
    expect(draft.sensitive).toBe(false);
    expect(wordCount(en, "en")).toBeLessThan(120);
  });

  it("off-topic chatter: drops items the note doesn't support", async () => {
    const { draft } = await run(FIXTURES.offTopic);
    expect(draft.body.en!.covered).toEqual(["Essay introduction for The Crucible, including the thesis statement"]);
    expect(draft.body.en!.wentWell).toEqual([]); // "engaged well" was invented
    expect(draft.dropped).toBe(2);
    expect(allText(draft.body.en!)).not.toMatch(/footy|dog|TEEL/i);
  });

  it("no homework in the note: invented homework is dropped and the section stays empty", async () => {
    const { draft } = await run(FIXTURES.inventedHomework);
    expect(draft.body.en!.homework).toEqual([]);
    expect(draft.dropped).toBe(1);
  });

  it("mixed English and Mandarin: Chinese quotes are matched against the note", async () => {
    const { draft } = await run(FIXTURES.mixed);
    const en = draft.body.en!;
    expect(en.covered).toHaveLength(1);
    expect(en.wentWell).toHaveLength(1);
    expect(en.nextFocus).toHaveLength(1);
    expect(en.homework).toEqual(["Chapter 5 exercises 5.1–5.6"]);
    expect(draft.dropped).toBe(0);
  });

  it("drops labels, comparisons with other students and mark predictions", async () => {
    const { draft } = await run(FIXTURES.labels);
    expect(draft.body.en!.wentWell).toEqual([]);
    expect(draft.body.en!.nextFocus).toEqual([]);
    expect(draft.body.en!.covered).toHaveLength(1);
    expect(draft.dropped).toBe(3);
  });

  it("quote matching forgives punctuation and small transcription slips, not invention", () => {
    const note = "Homework is questions 4.12 to 4.20, and um, the practice SAC.";
    expect(quoteIsGrounded("homework is questions 4.12 to 4.20", note)).toBe(true);
    expect(quoteIsGrounded("Homework is questions 4.12 to 4.20 and the practice SAC", note)).toBe(true);
    expect(quoteIsGrounded("finish the worksheet", note)).toBe(false);
    expect(quoteIsGrounded("", note)).toBe(false);
  });
});

describe("sensitive content", () => {
  it("is never put in the parent report, and the tutor is told", async () => {
    const { draft } = await run(FIXTURES.sensitive, ["en", "zh-CN"]);
    expect(draft.sensitive).toBe(true);
    expect(draft.body.en!.tutorNote).toBe("");
    for (const c of [draft.body.en!, draft.body["zh-CN"]!]) expect(allText(c)).not.toMatch(/bull|cry|霸凌|欺负/i);
    expect(draft.body.en!.covered).toEqual(["Chain rule and product rule (exercise 6B)"]);
  });

  it("flags the note even when the model doesn't", () => {
    expect(isSensitive(FIXTURES.sensitive.note)).toBe(true);
    expect(isSensitive("她说想死，不想活了")).toBe(true);
    expect(isSensitive("Kid said they want to die")).toBe(true);
  });

  it("doesn't flag ordinary subject words", () => {
    for (const note of [FIXTURES.normal.note, FIXTURES.mixed.note, "Alcohols and esters in organic chemistry", "Sexual reproduction in plants", "Police powers in Legal Studies"]) {
      expect(isSensitive(note), note).toBe(false);
    }
  });
});

describe("privacy and translation", () => {
  it("sends a pseudonym, not the student's name, and puts the name back", async () => {
    const { draft, requests } = await run(FIXTURES.sensitive);
    expect(requests[0].user).toContain(STUDENT_TOKEN);
    expect(requests[0].user).not.toMatch(/\bAva\b/);
    expect(pseudonymise("ava did 6B. Avalanche questions. 和Ava一起", "Ava")).toBe(`${STUDENT_TOKEN} did 6B. Avalanche questions. 和${STUDENT_TOKEN}一起`);
    expect(allText(draft.body.en!)).not.toContain(STUDENT_TOKEN);
  });

  it("translates the English JSON (not the note) into Chinese, item for item", async () => {
    const { draft, requests, tokens } = await run(FIXTURES.normal, ["zh-CN"]);
    expect(requests).toHaveLength(2);
    expect(requests[1].user).not.toContain("stoichiometry, mostly"); // the note isn't re-sent
    expect(draft.body["zh-CN"]!.covered).toEqual(draft.body.en!.covered.map((s) => `中文：${s}`));
    expect(draft.body["zh-CN"]!.tutorNote).toBe("中文：The SAC is on the 14th.");
    expect(tokens).toBe(800);
  });

  it("refuses a translation that adds or drops items", async () => {
    const en = { covered: ["A", "B"], wentWell: [], nextFocus: [], homework: [], tutorNote: "" };
    const { llm } = fakeLlm(FIXTURES.normal, () => ({ covered: ["甲"], went_well: [], next_focus: [], homework: [], tutor_note: "" }));
    await expect(translateReport(en, llm)).rejects.toThrow(/translation/);
  });
});
