"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="dash-btn dash-btn--primary print:hidden">
      Print / save as PDF
    </button>
  );
}
