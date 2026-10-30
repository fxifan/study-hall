import { describe, expect, it } from "vitest";
import { evidenceProblem, formatBytes, safeFileName } from "./evidence";

describe("work evidence", () => {
  it("accepts photos and PDFs up to 10 MB", () => {
    expect(evidenceProblem({ type: "image/jpeg", size: 2_000_000 })).toBeNull();
    expect(evidenceProblem({ type: "application/pdf", size: 10 * 1024 * 1024 })).toBeNull();
    expect(evidenceProblem({ type: "image/heic", size: 1000 })).toBe("type");
    expect(evidenceProblem({ type: "text/html", size: 1000 })).toBe("type");
    expect(evidenceProblem({ type: "image/png", size: 10 * 1024 * 1024 + 1 })).toBe("size");
  });

  it("makes safe display names", () => {
    expect(safeFileName("../../etc/passwd.jpg", "image/jpeg")).toBe("etcpasswd.jpg");
    expect(safeFileName("My worksheet (final).PDF", "application/pdf")).toBe("My-worksheet-final.pdf");
    expect(safeFileName("<script>.png", "image/png")).toBe("script.png");
    expect(safeFileName("数学作业.jpg", "image/jpeg")).toBe("数学作业.jpg");
    expect(safeFileName("...", "image/jpeg")).toBe("work.jpg");
    expect(formatBytes(1_500_000)).toBe("1.4 MB");
  });
});
