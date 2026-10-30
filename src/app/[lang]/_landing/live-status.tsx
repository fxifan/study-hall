"use client";

import { enAU, zhCN } from "date-fns/locale";
import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { LandingCopy } from "@/i18n/dictionaries/landing.en";
import { fill } from "@/i18n/fill";
import { MELBOURNE, formatInZone, isoWeekdayOf } from "@/lib/time";
import { daysSummary, formatClock, timesSummary, timetableStatus, type TimetableBlock } from "@/lib/timetable";

type Kind = "later" | "today" | "doors" | "live";

/**
 * "Next session …" line. Rendered on the server as the general timetable, then updated in the
 * browser from the current Melbourne time. Uses the weekly timetable (one or more blocks a day), so
 * it doesn't know about holiday cancellations.
 */
export function LiveStatus({ copy, locale, blocks }: { copy: LandingCopy["live"]; locale: Locale; blocks: TimetableBlock[] }) {
  const [state, setState] = useState<{ kind: Kind; text: string } | null>(null);

  useEffect(() => {
    const tick = () => setState(nextSession(copy, locale, blocks));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [copy, locale, blocks]);

  return (
    <p className="live" data-kind={state?.kind ?? "later"} aria-live="polite">
      <span className="dot" aria-hidden="true" />
      <span>{state?.text ?? fill(copy.default, { days: daysSummary(blocks, locale), times: timesSummary(blocks, locale) })}</span>
    </p>
  );
}

function nextSession(copy: LandingCopy["live"], locale: Locale, blocks: TimetableBlock[]): { kind: Kind; text: string } {
  const now = Date.now();
  const minutes = Number(formatInZone(now, "H")) * 60 + Number(formatInZone(now, "m"));
  const status = timetableStatus(blocks, isoWeekdayOf(now), minutes);
  const suffix = Intl.DateTimeFormat().resolvedOptions().timeZone === MELBOURNE ? "" : copy.melbourne;
  const clock = (m: number) => formatClock(m, locale);
  const duration = (m: number) =>
    m < 60 ? fill(copy.minutes, { m }) : fill(copy.hoursMinutes, { h: Math.floor(m / 60), m: m % 60 });

  let result: { kind: Kind; text: string };
  switch (status.kind) {
    case "today":
      result = { kind: "today", text: fill(copy.today, { time: clock(status.start), duration: duration(status.minutesToDoors) }) };
      break;
    case "doors":
      result = { kind: "doors", text: fill(copy.doors, { time: clock(status.start) }) };
      break;
    case "live":
      result = { kind: "live", text: fill(copy.live, { time: clock(status.end) }) };
      break;
    case "later": {
      const weekday = formatInZone(now + status.inDays * 86_400_000, "EEEE", MELBOURNE, locale === "zh" ? zhCN : enAU);
      const text = status.inDays === 1 ? copy.tomorrow : copy.later;
      result = { kind: "later", text: fill(text, { time: clock(status.start), weekday }) };
      break;
    }
    default:
      result = { kind: "later", text: fill(copy.default, { days: daysSummary(blocks, locale), times: timesSummary(blocks, locale) }) };
  }
  return { ...result, text: result.text + suffix };
}
