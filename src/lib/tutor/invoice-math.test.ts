import { describe, expect, it } from "vitest";
import { computeLines, computeTotals, formatCents, invoiceTitle, lineAmount, sessionCharge, sessionLine } from "./invoice-math";

const sessions = [
  { id: "s1", durationMin: 60, rateCents: 6000, label: "Maths Methods · Ava C. · Mon 2 Nov" },
  { id: "s2", durationMin: 90, rateCents: 6000, label: "Maths Methods · Ava C. · Wed 4 Nov" },
  { id: "s3", durationMin: 50, rateCents: 7500, label: "Chemistry · Leo C. · Thu 5 Nov" },
];

describe("invoice maths", () => {
  it("charges each session its share of the hourly rate, to the cent", () => {
    expect(sessionCharge(60, 6000)).toBe(6000);
    expect(sessionCharge(90, 6000)).toBe(9000);
    expect(sessionCharge(50, 7500)).toBe(6250);
    expect(sessionCharge(45, 6500)).toBe(4875);
    expect(sessionCharge(40, 5500)).toBe(3667); // 3666.67 rounds half-up
  });

  it("non-GST tutor: plain invoice, total = sum of lines, no GST", () => {
    const lines = computeLines(sessions.map(sessionLine));
    expect(lines.map((l) => l.amountCents)).toEqual([6000, 9000, 6250]);
    expect(computeTotals(lines, false)).toEqual({ subtotalCents: 21250, gstCents: 0, totalCents: 21250 });
    expect(invoiceTitle(false)).toBe("Invoice");
  });

  it("GST-registered tutor: tax invoice, GST is 1/11 of the GST-inclusive total", () => {
    const lines = computeLines(sessions.map(sessionLine));
    const totals = computeTotals(lines, true);
    expect(totals).toEqual({ subtotalCents: 19318, gstCents: 1932, totalCents: 21250 });
    expect(totals.subtotalCents + totals.gstCents).toBe(totals.totalCents);
    expect(totals.totalCents).toBe(lines.reduce((s, l) => s + l.amountCents, 0));
    expect(invoiceTitle(true)).toBe("Tax invoice");
  });

  it("GST rounds once on the total, half-up", () => {
    expect(computeTotals([{ amountCents: 6000 }], true)).toEqual({ subtotalCents: 5455, gstCents: 545, totalCents: 6000 });
    expect(computeTotals([{ amountCents: 1100 }], true).gstCents).toBe(100);
    expect(computeTotals([{ amountCents: 5 }], true).gstCents).toBe(0);
    expect(computeTotals([{ amountCents: 6 }], true).gstCents).toBe(1);
    expect(computeTotals([], true)).toEqual({ subtotalCents: 0, gstCents: 0, totalCents: 0 });
  });

  it("manual lines: qty × unit, with fractional quantities and no float drift", () => {
    expect(lineAmount(1.5, 6000)).toBe(9000);
    expect(lineAmount(0.1, 333)).toBe(33);
    expect(lineAmount(2.25, 4999)).toBe(11248); // 11247.75
    const lines = computeLines([
      { sessionId: null, description: "Workbook", qty: 1, unitCents: 2495 },
      { sessionId: null, description: "Extra 15 min", qty: 0.25, unitCents: 6000 },
    ]);
    expect(computeTotals(lines, false).totalCents).toBe(2495 + 1500);
  });

  it("formats cents for invoices", () => {
    expect(formatCents(21250)).toBe("A$212.50");
    expect(formatCents(123456789)).toBe("A$1,234,567.89");
    expect(formatCents(5)).toBe("A$0.05");
  });

  it("describes session lines with length and rate", () => {
    expect(sessionLine(sessions[2]).description).toBe("Chemistry · Leo C. · Thu 5 Nov (50 min @ A$75.00/h)");
    expect(sessionLine(sessions[1]).description).toContain("(1.5 h @ A$60.00/h)");
  });
});
