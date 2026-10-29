"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { fill } from "@/i18n/fill";
import { formatCountdown, timerPhase } from "@/lib/session-timer";

type TimerCopy = { before: string; study: string; break: string; wrapup: string; ended: string };

/** Live block timer for the session (updates every second). */
export function SessionTimer({
  startsAt,
  endsAt,
  blockMinutes,
  breakMinutes,
  copy,
}: {
  startsAt: string;
  endsAt: string;
  blockMinutes: number;
  breakMinutes: number;
  copy: TimerCopy;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0); // client-only, so server and first client render match
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  if (now === null) return <p className="h-7" aria-hidden="true" />;

  const phase = timerPhase(now, Date.parse(startsAt), Date.parse(endsAt), blockMinutes, breakMinutes);
  const text =
    phase.kind === "ended"
      ? copy.ended
      : phase.kind === "study"
        ? fill(copy.study, { n: phase.block, total: phase.totalBlocks, time: formatCountdown(phase.remainingMs) })
        : fill(copy[phase.kind], { time: formatCountdown(phase.remainingMs) });
  return (
    <p className="font-mono text-lg" role="timer" aria-live="off" data-phase={phase.kind}>
      {text}
    </p>
  );
}

/**
 * Join opens the check-in route in a new tab (it redirects to the video room), then refreshes this
 * page so it shows the joined state.
 */
export function JoinButton({ sessionId, label }: { sessionId: string; label: string }) {
  const router = useRouter();
  return (
    <a
      href={`/api/sessions/${sessionId}/join`}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonVariants({ size: "lg" })}
      onClick={() => setTimeout(() => router.refresh(), 1500)}
    >
      {label}
    </a>
  );
}
