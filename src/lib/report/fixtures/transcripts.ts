/**
 * Fixture notes for the report pipeline tests (docs/tutor-reports-spec.md §4). Each pairs a note with
 * what a model might return for it, including the bad outputs the pipeline must catch. All fictional.
 * `npm run report:eval` sends the same notes to the real model (needs OPENAI_API_KEY).
 */
import type { ModelDraft } from "../schema";

export type Fixture = { name: string; note: string; student: string; subjects: string[]; model?: ModelDraft };

const item = (text: string, quote: string) => ({ text, quote });
const none = { covered: [], went_well: [], next_focus: [], homework: [], tutor_note: null, sensitive: false };

export const FIXTURES = {
  empty: { name: "empty note", note: "   ", student: "Ava", subjects: ["Maths Methods"] },
  tooShort: { name: "very short note", note: "Good session.", student: "Ava", subjects: ["Maths Methods"] },
  normal: {
    name: "ordinary chemistry session",
    student: "Leo",
    subjects: ["Chemistry"],
    note:
      "Okay so today with Leo we did stoichiometry, mostly limiting reagent questions from chapter 4, and some mole conversions. " +
      "He got the mole conversions really quickly, no mistakes on those. Still mixing up which reagent is limiting when the ratio isn't one to one, so next week we'll do more of those. " +
      "Homework is questions 4.12 to 4.20. Tell mum the SAC is on the 14th.",
    model: {
      ...none,
      covered: [item("Stoichiometry: limiting reagent questions (chapter 4)", "we did stoichiometry, mostly limiting reagent questions from chapter 4"), item("Mole conversions", "some mole conversions")],
      went_well: [item("Mole conversions done with no mistakes", "no mistakes on those")],
      next_focus: [item("Finding the limiting reagent when the ratio isn't 1:1", "which reagent is limiting when the ratio isn't one to one")],
      homework: [item("Questions 4.12–4.20", "Homework is questions 4.12 to 4.20")],
      tutor_note: item("The SAC is on the 14th.", "the SAC is on the 14th"),
    },
  },
  offTopic: {
    name: "off-topic chatter with one line of content",
    student: "Mia",
    subjects: ["English"],
    note:
      "Mia was telling me all about the footy grand final and her cousin's dog, we chatted for a while about that. " +
      "Then we went through her essay introduction for The Crucible and fixed the thesis statement.",
    model: {
      ...none,
      covered: [
        item("Essay introduction for The Crucible, including the thesis statement", "went through her essay introduction for The Crucible and fixed the thesis statement"),
        item("Practice analytical paragraphs using TEEL", "we practised TEEL paragraphs"), // invented: not in the note
      ],
      went_well: [item("Engaged well throughout", "she was engaged the whole time")], // invented
    },
  },
  sensitive: {
    name: "note mentioning a wellbeing concern",
    student: "Ava",
    subjects: ["Maths Methods"],
    note:
      "We did chain rule and product rule today, Ava got through exercise 6B. " +
      "Near the end she told me she's been getting bullied at school and has been crying a lot at night, I didn't know what to say.",
    model: {
      ...none,
      covered: [item("Chain rule and product rule (exercise 6B)", "We did chain rule and product rule today, Ava got through exercise 6B")],
      // A bad model output: the disclosure copied into the report.
      tutor_note: item("Ava mentioned being bullied at school.", "she's been getting bullied at school"),
      sensitive: false,
    },
  },
  mixed: {
    name: "mixed English and Mandarin",
    student: "Ethan",
    subjects: ["Physics"],
    note:
      "今天我们做了 projectile motion，主要是水平抛射的题目。他的公式用得很好，但是 vector components 还要多练习。作业是第五章的练习题 5.1 到 5.6。",
    model: {
      ...none,
      covered: [item("Projectile motion, mainly horizontal launches", "今天我们做了 projectile motion，主要是水平抛射的题目")],
      went_well: [item("Used the formulas well", "他的公式用得很好")],
      next_focus: [item("More practice with vector components", "vector components 还要多练习")],
      homework: [item("Chapter 5 exercises 5.1–5.6", "作业是第五章的练习题 5.1 到 5.6")],
    },
  },
  inventedHomework: {
    name: "no homework mentioned, model invents some",
    student: "Zoe",
    subjects: ["Biology"],
    note: "Zoe and I revised cellular respiration, glycolysis and the Krebs cycle, using her class notes and a diagram she drew.",
    model: {
      ...none,
      covered: [item("Cellular respiration: glycolysis and the Krebs cycle", "revised cellular respiration, glycolysis and the Krebs cycle")],
      homework: [item("Complete the textbook questions on respiration", "complete the textbook questions")],
    },
  },
  labels: {
    name: "model adds labels, comparisons and predictions",
    student: "Sam",
    subjects: ["Specialist Maths"],
    note: "Sam did complex numbers in polar form and De Moivre's theorem. He solved every question in the set without help.",
    model: {
      ...none,
      covered: [item("Complex numbers in polar form and De Moivre's theorem", "complex numbers in polar form and De Moivre's theorem")],
      went_well: [
        item("Sam is gifted at maths", "He solved every question in the set without help"),
        item("Ahead of other students in his class", "He solved every question in the set without help"),
      ],
      next_focus: [item("On track to get a 45+ study score", "He solved every question")],
    },
  },
} satisfies Record<string, Fixture>;
