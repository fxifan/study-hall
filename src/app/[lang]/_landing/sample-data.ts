import type { ReportCardData, ReportLang } from "@/lib/report-card";

/**
 * The fictional sample report (comprehensive brief §5), in the same structure as real reports so it
 * switches between English and Simplified Chinese the same way. Unlike a real report, its goals and
 * observation are demo text, so they carry both languages. Never real student data. The brief's
 * sample used a 120-minute session; ours are 240 minutes, so the attendance line says so.
 */
export type Variant = "attended" | "absent";

const ATTENDED: ReportCardData = {
  id: "sample-attended",
  student: "Alex",
  date: { en: "Thursday", zh: "星期四" },
  session: { en: "4:00–8:00pm", zh: "16:00–20:00" },
  attendance: { attended: true, from: { en: "4:00", zh: "下午 4:00" }, to: { en: "5:50pm", zh: "5:50" }, minutes: 110, total: 240 },
  goals: [
    { text: { en: "Complete biology revision questions", zh: "完成生物复习题" }, outcome: "done" },
    { text: { en: "Review chemistry notes", zh: "复习化学笔记" }, outcome: "partial" },
    { text: { en: "Finish English essay plan", zh: "完成英语作文提纲" }, outcome: "not_done" },
  ],
  observations: [{ en: "Phone visible once during the session.", zh: "本次学习期间，学生曾有一次手机出现在视线范围内。" }],
  comment: null,
};

export const SAMPLES: Record<Variant, { report: ReportCardData; sent: Record<ReportLang, string> }> = {
  attended: { report: ATTENDED, sent: { en: "8:41pm", zh: "晚上 8:41" } },
  absent: {
    report: { ...ATTENDED, id: "sample-absent", attendance: { attended: false }, goals: [], observations: [] },
    sent: { en: "8:15pm", zh: "晚上 8:15" },
  },
};

export function sampleSentTime(lang: ReportLang): string {
  return SAMPLES.attended.sent[lang];
}
