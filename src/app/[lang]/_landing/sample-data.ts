import type { ReportCardData, ReportLang } from "@/lib/report-card";
import { formatClock, formatRange, toMinutes, type TimetableBlock } from "@/lib/timetable";

/**
 * The fictional sample report (comprehensive brief §5), in the same structure as real reports so it
 * switches between English and Simplified Chinese the same way. Unlike a real report, its goals and
 * observation are demo text, so they carry both languages. Never real student data. Its times follow
 * the first session block on the timetable: with two-hour blocks it's the brief's original
 * "110 minutes of a 120-minute session".
 */
export type Variant = "attended" | "absent";
export type Samples = Record<Variant, { report: ReportCardData; sent: Record<ReportLang, string> }>;

const ATTENDED_MINUTES = 110;

/** "下午 4:00" style, as in the brief's draft translation. */
function zhClock(minutes: number, { period = true } = {}): string {
  const h = Math.floor(minutes / 60);
  const clock = `${h % 12 || 12}:${String(minutes % 60).padStart(2, "0")}`;
  if (!period) return clock;
  return `${h >= 18 ? "晚上" : h >= 12 ? "下午" : "上午"} ${clock}`;
}

export function sampleReports(block: TimetableBlock): Samples {
  const start = toMinutes(block.start);
  const end = toMinutes(block.end);
  const left = start + Math.min(ATTENDED_MINUTES, end - start);
  const both = (en: string, zh: string) => ({ en, zh });
  const attended: ReportCardData = {
    id: "sample-attended",
    student: "Alex",
    date: { en: "Thursday", zh: "星期四" },
    session: both(formatRange(start, end, "en"), formatRange(start, end, "zh")),
    attendance: {
      attended: true,
      from: both(formatClock(start, "en", { suffix: Math.floor(start / 720) !== Math.floor(left / 720) }), zhClock(start)),
      to: both(formatClock(left, "en"), zhClock(left, { period: false })),
      minutes: left - start,
      total: end - start,
    },
    goals: [
      { text: { en: "Complete biology revision questions", zh: "完成生物复习题" }, outcome: "done" },
      { text: { en: "Review chemistry notes", zh: "复习化学笔记" }, outcome: "partial" },
      { text: { en: "Finish English essay plan", zh: "完成英语作文提纲" }, outcome: "not_done" },
    ],
    observations: [{ en: "Phone visible once during the session.", zh: "本次学习期间，学生曾有一次手机出现在视线范围内。" }],
    comment: null,
  };
  const sent = (after: number) => both(formatClock(end + after, "en"), zhClock(end + after));
  return {
    attended: { report: attended, sent: sent(41) },
    absent: { report: { ...attended, id: "sample-absent", attendance: { attended: false }, goals: [], observations: [] }, sent: sent(15) },
  };
}
