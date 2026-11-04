"use client";

import { useDashboard } from "./lesson-dialog";

export function StudentScheduleButton({ studentId, name }: { studentId: string; name: string }) {
  const { openCreate } = useDashboard();
  return (
    <button type="button" className="h-8 rounded-md px-2 font-medium text-ink hover:bg-paper-deep" onClick={() => openCreate(undefined, undefined, studentId)} aria-label={`Schedule a lesson for ${name}`}>
      + Schedule
    </button>
  );
}
