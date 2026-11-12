import { addDaysToDateKey, dateKeyOf, formatInZone } from "@/lib/time";

/** One line in a recent-activity list: a finished session or a milestone, never a chat message. */
export type ActivityItem = { at: string; text: string; kind: "session" | "milestone" | "member" };

/** "Today, 4:10 pm", "Yesterday, 9:05 am", or "Mon 10 Nov" (Melbourne time). */
export function whenLabel(iso: string, now: number = Date.now()): string {
  const day = dateKeyOf(iso);
  const today = dateKeyOf(now);
  const time = formatInZone(iso, "h:mm a").toLowerCase();
  if (day === today) return `Today, ${time}`;
  if (day === addDaysToDateKey(today, -1)) return `Yesterday, ${time}`;
  return formatInZone(iso, "EEE d MMM");
}

/** Newest first, at most `limit`. */
export function latest(items: ActivityItem[], limit = 5): ActivityItem[] {
  return [...items].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, limit);
}

/** "45 min", "1 h 20 min". */
export function studied(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  return h ? `${h} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`;
}
