"use client";

import { useDashboard } from "./lesson-dialog";

export function StudentScheduleButton({ studentId, name }: { studentId: string; name: string }) {
  const { openCreate } = useDashboard();
  return (
    <button type="button" className="dash-btn dash-btn--ghost shrink-0 !min-h-8 !px-2 text-xs !text-[var(--dash-accent-text)]" onClick={() => openCreate(undefined, undefined, studentId)} aria-label={`Schedule a lesson for ${name}`}>
      + Book
    </button>
  );
}
