import { reportText } from "@/lib/report/render";

/**
 * The fictional parent update shown on the marketing pages (Edumi home and /tutors), rendered by
 * the same code as real reports. Alex T. and Jamie are made up.
 */
export const SAMPLE_REPORT = {
  en: {
    covered: ["Chain rule and product rule (exercise 6B, Q1–12)", "Exam-style differentiation questions"],
    wentWell: ["All chain rule questions correct without help"],
    nextFocus: ["Choosing between product and quotient rule"],
    homework: ["Exercise 6B, Q13–20"],
    tutorNote: "The practice SAC is next Thursday.",
  },
  "zh-CN": {
    covered: ["链式法则和乘积法则（练习 6B，第1–12题）", "考试题型的求导练习"],
    wentWell: ["链式法则的题目全部独立做对"],
    nextFocus: ["判断何时用乘积法则、何时用商法则"],
    homework: ["练习 6B，第13–20题"],
    tutorNote: "模拟 SAC 在下周四。",
  },
};

export const SAMPLE_META = {
  student: "Alex T.",
  date: { en: "Mon 2 Nov 2026", "zh-CN": "2026年11月2日 周一" },
  time: { en: "4:00pm–5:00pm", "zh-CN": "16:00–17:00" },
  subjects: ["Maths Methods"],
  tutorName: "Jamie",
  brand: "Jamie",
};

/** Both languages, as the tutor would paste them into WeChat. */
export const SAMPLE_TEXT = reportText(SAMPLE_REPORT, SAMPLE_META);
/** One language at a time, for side-by-side display. */
export const SAMPLE_TEXT_EN = reportText({ en: SAMPLE_REPORT.en }, SAMPLE_META);
export const SAMPLE_TEXT_ZH = reportText({ "zh-CN": SAMPLE_REPORT["zh-CN"] }, SAMPLE_META);
