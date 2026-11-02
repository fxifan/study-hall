import { describe, expect, it } from "vitest";
import { plainTextBody } from "./email/bilingual";
import { mailtoHref } from "./mailto";

describe("own-email links", () => {
  it("encodes subject and body, with CRLF line breaks", () => {
    const href = mailtoHref({ to: "li.wei@example.com", subject: "Ava C.: session update & notes", body: "Covered\n• 链式法则" });
    expect(href.startsWith("mailto:li.wei@example.com?subject=")).toBe(true);
    expect(href).toContain("%26"); // & can't break the query
    expect(href).toContain("%0D%0A");
    expect(decodeURIComponent(href.split("body=")[1])).toBe("Covered\r\n• 链式法则");
  });

  it("plain-text body: no footer, language headings only for two languages", () => {
    const section = (label: string, lang: "en" | "zh-CN") => ({
      label,
      lang,
      colon: ": ",
      footer: "Sent by Study Hall",
      blocks: [{ kind: "p" as const, text: `hello ${lang}` }],
    });
    expect(plainTextBody([section("English", "en")], "Thanks,\nJamie")).toBe("hello en\n\nThanks,\nJamie");
    const both = plainTextBody([section("English", "en"), section("简体中文", "zh-CN")]);
    expect(both).toBe("English\n\nhello en\n\n---\n\n简体中文\n\nhello zh-CN");
    expect(both).not.toContain("Sent by");
  });
});
