/**
 * iCalendar (RFC 5545) feed of a tutor's lessons, for subscribing from Apple Calendar, Google
 * Calendar or Outlook. One-way: the tutor's calendar app polls this URL and shows their lessons.
 * Stable UIDs mean a rescheduled lesson updates in place instead of duplicating, and a cancelled
 * one is sent as STATUS:CANCELLED. It can't read the tutor's own events (that needs Google OAuth or
 * CalDAV, not built).
 */
export type IcsLesson = {
  id: string;
  startsAt: string;
  durationMin: number;
  title: string;
  description: string;
  url: string | null;
  cancelled: boolean;
  updatedAt: string;
};

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 octets are folded with CRLF + space (RFC 5545 §3.1), never mid-character. */
export function foldLine(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch);
    if (bytes + size > (out.length ? 74 : 75)) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function buildIcs(calendarName: string, lessons: IcsLesson[], now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Study Hall//Tutor lessons//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    "X-WR-TIMEZONE:Australia/Melbourne",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const l of lessons) {
    const end = new Date(Date.parse(l.startsAt) + l.durationMin * 60_000).toISOString();
    lines.push(
      "BEGIN:VEVENT",
      `UID:lesson-${l.id}@studyhall`,
      `DTSTAMP:${stamp(now.toISOString())}`,
      `LAST-MODIFIED:${stamp(l.updatedAt)}`,
      `DTSTART:${stamp(l.startsAt)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escapeText(l.title)}`,
      ...(l.description ? [`DESCRIPTION:${escapeText(l.description)}`] : []),
      ...(l.url ? [`URL:${l.url}`, `LOCATION:${escapeText(l.url)}`] : []),
      `STATUS:${l.cancelled ? "CANCELLED" : "CONFIRMED"}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
