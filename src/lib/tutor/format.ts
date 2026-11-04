import { enAU, zhCN } from "date-fns/locale";
import type { ReportMeta } from "@/lib/report/render";
import { formatInZone } from "@/lib/time";

/** Session date and time in both report languages (Melbourne time, via src/lib/time.ts). */
export function sessionWhen(startsAt: string, durationMin: number): Pick<ReportMeta, "date" | "time"> {
  const end = new Date(Date.parse(startsAt) + durationMin * 60_000).toISOString();
  return {
    date: {
      en: formatInZone(startsAt, "EEE d MMM yyyy", undefined, enAU),
      "zh-CN": formatInZone(startsAt, "yyyy年M月d日 EEE", undefined, zhCN),
    },
    time: {
      en: `${formatInZone(startsAt, "h:mmaaa", undefined, enAU)}–${formatInZone(end, "h:mmaaa", undefined, enAU)}`,
      "zh-CN": `${formatInZone(startsAt, "HH:mm")}–${formatInZone(end, "HH:mm")}`,
    },
  };
}

/** "Mon 2 Nov, 4:00pm" for lists. */
export function shortWhen(startsAt: string): string {
  return formatInZone(startsAt, "EEE d MMM, h:mmaaa", undefined, enAU);
}

export function studentName(s: { first_name: string; last_initial: string }): string {
  return `${s.first_name} ${s.last_initial}.`;
}
