"use client";

import { enAU, zhCN } from "date-fns/locale";
import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { LandingCopy } from "@/i18n/dictionaries/landing.en";
import { fill } from "@/i18n/fill";
import { DEFAULT_SCHEDULE } from "@/lib/default-schedule";
import { MELBOURNE, formatInZone, isoWeekdayOf } from "@/lib/time";

type Kind = "later" | "today" | "doors" | "live";

/**
 * "Next session …" line. Rendered on the server as the generic schedule, then updated in the
 * browser from the current Melbourne time. Uses the default schedule, so it doesn't know about
 * holiday cancellations (see DEFAULT_SCHEDULE).
 */
export function LiveStatus({ copy, locale }: { copy: LandingCopy["live"]; locale: Locale }) {
  const [state, setState] = useState<{ kind: Kind; text: string } | null>(null);

  useEffect(() => {
    const tick = () => setState(nextSession(copy, locale));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [copy, locale]);

  return (
    <p className="live" data-kind={state?.kind ?? "later"} aria-live="polite">
      <span className="dot" aria-hidden="true" />
      <span>{state?.text ?? copy.default}</span>
    </p>
  );
}

function nextSession(copy: LandingCopy["live"], locale: Locale): { kind: Kind; text: string } {
  const { isoDays, startMinutes, endMinutes, doorsOpenMinutes } = DEFAULT_SCHEDULE;
  const now = Date.now();
  const minutes = Number(formatInZone(now, "H")) * 60 + Number(formatInZone(now, "m"));
  const today = isoWeekdayOf(now);
  const doors = startMinutes - doorsOpenMinutes;
  const isSessionDay = (isoDays as readonly number[]).includes(today);
  const suffix = Intl.DateTimeFormat().resolvedOptions().timeZone === MELBOURNE ? "" : copy.melbourne;

  const duration = (m: number) =>
    m < 60 ? fill(copy.minutes, { m }) : fill(copy.hoursMinutes, { h: Math.floor(m / 60), m: m % 60 });

  let result: { kind: Kind; text: string } | undefined;
  if (isSessionDay && minutes < doors) result = { kind: "today", text: fill(copy.today, { duration: duration(doors - minutes) }) };
  else if (isSessionDay && minutes < startMinutes) result = { kind: "doors", text: copy.doors };
  else if (isSessionDay && minutes < endMinutes) result = { kind: "live", text: copy.live };
  else {
    for (let k = 1; k <= 7; k++) {
      const day = ((today - 1 + k) % 7) + 1;
      if (!(isoDays as readonly number[]).includes(day)) continue;
      const weekday = formatInZone(now + k * 86_400_000, "EEEE", MELBOURNE, locale === "zh" ? zhCN : enAU);
      result = { kind: "later", text: k === 1 ? copy.tomorrow : fill(copy.later, { weekday }) };
      break;
    }
  }
  result ??= { kind: "later", text: copy.default };
  return { ...result, text: result.text + suffix };
}
