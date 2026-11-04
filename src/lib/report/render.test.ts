import { describe, expect, it } from "vitest";
import { reportEmail, reportText, type ReportMeta } from "./render";
import type { ReportBody } from "./schema";

const meta: ReportMeta = {
  student: "Ava C.",
  date: { en: "Mon 2 Nov 2026", "zh-CN": "2026年11月2日 周一" },
  time: { en: "4:00pm–5:00pm", "zh-CN": "16:00–17:00" },
  subjects: ["Maths Methods"],
  tutorName: "Jamie",
  brand: "Tran Tutoring",
};
const body: ReportBody = {
  en: { covered: ["Chain rule"], wentWell: [], nextFocus: ["Quotient rule"], homework: [], tutorNote: "" },
  "zh-CN": { covered: ["链式法则"], wentWell: [], nextFocus: ["商法则"], homework: [], tutorNote: "" },
};

describe("report rendering", () => {
  it("copy-as-text: fixed order, empty sections left out, no markdown", () => {
    const text = reportText(body, meta, ["en"]);
    expect(text).toBe("Ava C. · Mon 2 Nov 2026 · 4:00pm–5:00pm · Maths Methods\n\nCovered\n• Chain rule\n\nNext focus\n• Quotient rule\n\n— Jamie");
    expect(text).not.toMatch(/Went well|Homework|\*/);
  });

  it("both languages: English first, then Chinese", () => {
    const text = reportText(body, meta, ["en", "zh-CN"]);
    expect(text.indexOf("Covered")).toBeLessThan(text.indexOf("学习内容"));
    expect(text).toContain("• 商法则");
  });

  it("emails only the family's languages and escapes what people wrote", () => {
    const zhOnly = reportEmail(body, meta, ["zh-CN"]);
    expect(zhOnly.text).not.toContain("Covered");
    expect(zhOnly.subject).toBe("Ava C.：课后反馈，2026年11月2日 周一");
    const html = reportEmail({ en: { ...body.en!, tutorNote: "<script>x</script>" } }, meta, ["en"]).html;
    expect(html).not.toContain("<script>x");
    expect(html).toContain("Tran Tutoring");
  });
});
