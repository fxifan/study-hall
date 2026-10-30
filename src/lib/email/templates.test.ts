import { describe, expect, it } from "vitest";
import { SAMPLES } from "@/app/[lang]/_landing/sample-data";
import { CONTACT_EMAIL } from "@/lib/contact";
import type { ReportCardData } from "@/lib/report-card";
import { escapeHtml } from "./bilingual";
import { AUTH_LINK, authEmail, reportEmail } from "./templates";

const ORIGIN = "https://study-hall.example";

const realReport: ReportCardData = {
  ...SAMPLES.attended.report,
  student: "Ava A.",
  goals: [{ text: 'Methods <script>alert("x")</script> & co', outcome: "done" }],
  observations: [],
  comment: "Worked steadily.",
};

describe("bilingual emails", () => {
  for (const [name, email] of [
    ["login", authEmail("login")],
    ["signup", authEmail("signup")],
    ["report", reportEmail(SAMPLES.attended.report, ORIGIN)],
    ["absence note", reportEmail(SAMPLES.absent.report, ORIGIN)],
  ] as const) {
    it(`${name}: English in full first, then a separator, then Simplified Chinese`, () => {
      expect(email.subject).toMatch(/^[\x20-\x7E]+ · .*[一-鿿]/); // English subject, then Chinese
      const en = email.text.indexOf("English\n=======");
      const sep = email.text.indexOf("\n---\n");
      const zh = email.text.indexOf("简体中文\n");
      expect(en).toBe(0);
      expect(sep).toBeGreaterThan(en);
      expect(zh).toBeGreaterThan(sep);
      expect(email.html.indexOf('lang="en"', email.html.indexOf("<body"))).toBeLessThan(email.html.indexOf('lang="zh-CN"'));
      expect(email.html).toContain('<meta charset="utf-8">');
      // The contact address is identical in both languages.
      expect(email.text.split(CONTACT_EMAIL)).toHaveLength(3);
      expect(email.html).not.toMatch(/<script|@import|<link /i);
    });
  }

  it("sign-in emails use the token link Supabase fills in", () => {
    for (const email of [authEmail("login"), authEmail("signup")]) {
      expect(email.html).toContain(`href="${escapeHtml(AUTH_LINK)}"`);
      expect(email.html).toContain("{{ .TokenHash }}");
      expect(email.text).toContain(AUTH_LINK);
    }
  });

  it("escapes what people wrote and keeps it as written in both languages", () => {
    const email = reportEmail(realReport, ORIGIN);
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("Methods &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co · Done");
    expect(email.html).toContain("Methods &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co · 已完成");
    expect(email.text.match(/Worked steadily\./g)).toHaveLength(2);
    expect(email.text).toContain(`See all reports: ${ORIGIN}/parent`);
    expect(email.text).toContain(`查看全部报告：${ORIGIN}/zh/parent`);
  });

  it("says when a student didn't attend, in both languages", () => {
    const email = reportEmail(SAMPLES.absent.report, ORIGIN);
    expect(email.text).toContain("Alex didn't attend this session (4:00–8:00pm).");
    expect(email.text).toContain("Alex 没有参加本节自习（16:00–20:00）。");
    expect(email.text).not.toContain("Goals:");
  });
});
