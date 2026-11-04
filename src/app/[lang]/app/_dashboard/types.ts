import type { CalendarItem } from "@/lib/tutor/dashboard";

/** A calendar item with its Melbourne-time labels worked out on the server. */
export type DashItem = CalendarItem & {
  dateKey: string;
  /** Minutes after midnight, Melbourne. */
  startMin: number;
  time24: string;
  timeLabel: string;
  endLabel: string;
  dayLabel: string;
  /** Started before now (a scheduled one is then waiting to be logged). */
  isPast: boolean;
};

export type DashStudent = { id: string; name: string; subjects: string[] };
export type DashLink = { id: string; name: string; url: string; studentId: string | null; studentName: string | null };
export type DashDay = { key: string; weekday: string; day: string; label: string; isToday: boolean; inMonth: boolean };
