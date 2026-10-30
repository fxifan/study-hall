import { describe, expect, it } from "vitest";
import { en } from "@/i18n/dictionaries/en";
import { zh } from "@/i18n/dictionaries/zh";
import { attendanceLine, reportText, type ReportCardData } from "./report-card";

const report: ReportCardData = {
  id: "r1",
  student: "Ava A.",
  date: { en: "Thursday 29 October", zh: "10月29日 星期四" },
  session: { en: "4:00pm–8:00pm", zh: "下午4:00–晚上8:00" },
  attendance: { attended: true, from: { en: "4:00pm", zh: "下午4:00" }, to: { en: "5:50pm", zh: "下午5:50" }, minutes: 110, total: 240 },
  goals: [
    { text: "Methods: chain rule", outcome: "done" },
    { text: { en: "Review chemistry notes", zh: "复习化学笔记" }, outcome: "partial" },
    { text: "English essay plan", outcome: null },
  ],
  observations: ["Phone visible once."],
  comment: null,
};

describe("report cards", () => {
  it("translates labels and keeps what people wrote", () => {
    const text = reportText(report, "zh", zh.reportCard);
    expect(text).toContain("出勤时间：下午4:00 至 下午5:50（240 分钟的学习时段中出勤 110 分钟）");
    expect(text).toContain("学习目标：\n");
    expect(text).toContain("  - Methods: chain rule · 已完成"); // student's own words, untranslated
    expect(text).toContain("  - 复习化学笔记 · 部分完成"); // demo text with a Chinese version
    expect(text).toContain("  - English essay plan · 未标记");
    expect(text).toContain("监督员观察记录：Phone visible once."); // supervisor's note, as written
  });

  it("writes English the same way, and marks samples", () => {
    const text = reportText(report, "en", en.reportCard, true);
    expect(text.split("\n")[0]).toBe("[Sample report, fictional student]");
    expect(text).toContain("Attendance: 4:00pm–5:50pm (110 minutes of a 240-minute session)");
    expect(text).toContain("Goals:\n");
    expect(text).toContain("  - Review chemistry notes · Partially completed");
  });

  it("says when a student didn't attend", () => {
    const absent = { ...report, attendance: { attended: false as const } };
    expect(attendanceLine(absent, "en", en.reportCard)).toBe("Ava A. didn't attend this session (4:00pm–8:00pm).");
    expect(reportText(absent, "zh", zh.reportCard)).not.toContain("学习目标");
  });
});
