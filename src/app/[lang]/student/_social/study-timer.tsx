"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { LONG_SESSION_SECONDS } from "@/lib/social/credit";
import { answerAway, heartbeat, pauseStudy, startStudy, stopStudy, type TimerState } from "./actions";

/** How often an open Edumi tab says it's still open. Hidden tabs keep sending (browsers may slow them). */
const BEAT_MS = 30_000;

function clock(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(s).padStart(2, "0")}`;
}

function duration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
}

/** "21:30" → the most recent 9:30 pm (today, or yesterday if that's still to come). */
function pickedIso(hhmm: string): string | null {
  const [h, m] = hhmm.split(":").map(Number);
  if (!hhmm || !Number.isFinite(h) || !Number.isFinite(m)) return null;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() > new Date().getTime()) d.setDate(d.getDate() - 1);
  return d.toISOString();
}

const KEEPS_RUNNING = "Keep studying your way. Your timer keeps running when you switch tabs to use notes, lectures or other study resources.";

/**
 * The study timer: an honour-based log (docs/ui-refresh-and-timer.md). Time counts from Start
 * until the student pauses or finishes, whatever tab or app they're in. The server holds the start
 * and pause times; this clock only redraws from them. Switching tabs, hiding the page or going
 * quiet never pauses it. If Edumi was closed everywhere for over 2 hours, it asks what to count.
 */
export function StudyTimer({
  initial,
  groupId,
  groupName,
  solo = false,
  compact = false,
}: {
  initial: TimerState;
  /** The group a new session counts towards (the group page). */
  groupId?: string;
  /** Counts towards no group (solo mode and the My tutor page). */
  solo?: boolean;
  groupName?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [timer, setTimer] = useState<TimerState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmLong, setConfirmLong] = useState(false);
  /** When the server last told us the time, and the clock now (both null until the first sync). */
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);

  const apply = useCallback((t: TimerState) => {
    const t0 = new Date().getTime();
    setSyncedAt(t0);
    setNow(t0);
    setError(null);
    setTimer((prev) => ({ ...prev, ...t, groupId: t.groupId ?? prev.groupId, startedAt: t.startedAt ?? prev.startedAt }));
  }, []);

  const ended = useCallback(
    (seconds: number) => {
      setTimer({ sessionId: null, state: "stopped", seconds, groupId: null });
      setConfirmLong(false);
      router.refresh();
    },
    [router],
  );

  // "Edumi is open": every 30 s, and straight away when the student comes back to this tab or
  // reconnects, so the clock is redrawn from the saved times rather than from local ticks.
  const sessionId = timer.sessionId;
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const send = () =>
      heartbeat(sessionId)
        .then((t) => {
          if (cancelled) return;
          if (t.state === "stopped") ended(t.seconds);
          else apply(t);
        })
        .catch(() => {
          if (!cancelled) setError("You're offline. Your timer keeps going and catches up when you're back.");
        });
    const onBack = () => {
      if (document.visibilityState === "visible") send();
    };
    send();
    const id = setInterval(send, BEAT_MS);
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("online", send);
    window.addEventListener("focus", send);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("online", send);
      window.removeEventListener("focus", send);
    };
  }, [sessionId, apply, ended]);

  // Redraw once a second while running (display only: the time comes from saved timestamps).
  useEffect(() => {
    if (timer.state !== "running") return;
    const id = setInterval(() => setNow(new Date().getTime()), 1000);
    return () => clearInterval(id);
  }, [timer.state]);
  const sinceSync = timer.state === "running" && now !== null && syncedAt !== null ? Math.max(0, (now - syncedAt) / 1000) : 0;
  const shown = timer.seconds + sinceSync;

  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      }
    });

  const start = () =>
    run(async () => {
      if (!groupId && !solo) return;
      apply(await startStudy(groupId ?? null));
      router.refresh();
    });
  const togglePause = () =>
    run(async () => {
      if (!timer.sessionId) return;
      const t = await pauseStudy(timer.sessionId, timer.state !== "paused");
      if (t.state === "stopped") ended(t.seconds);
      else apply(t);
    });
  /** Finish. Sessions over 6 hours ask first, unless the student already answered. */
  const finish = (opts: { endAt?: string; confirmed?: boolean } = {}) =>
    run(async () => {
      if (!timer.sessionId) return;
      if (!opts.confirmed && shown >= LONG_SESSION_SECONDS) {
        setConfirmLong(true);
        return;
      }
      ended((await stopStudy(timer.sessionId, opts.endAt)).seconds);
    });
  const answer = (choice: "left" | "now" | { at: string }, then: "finish" | "resume") =>
    run(async () => {
      if (!timer.sessionId) return;
      const t = await answerAway(timer.sessionId, choice, then);
      if (t.state === "stopped") ended(t.seconds);
      else apply(t);
    });

  const live = Boolean(timer.sessionId);
  const otherGroup = live && (solo ? timer.groupId !== null : groupId && timer.groupId && timer.groupId !== groupId);
  const status = timer.state === "paused" ? "Paused" : "Studying";

  const question =
    timer.state === "check" && timer.away ? (
      <AwayQuestion away={timer.away} pending={pending} onAnswer={answer} />
    ) : confirmLong ? (
      <LongQuestion
        seconds={shown}
        pending={pending}
        onKeep={() => finish({ confirmed: true })}
        onPick={(endAt) => finish({ endAt, confirmed: true })}
        onCancel={() => setConfirmLong(false)}
      />
    ) : null;

  const alert = error && (
    <p role="alert" className="text-sm text-pen">
      {error}
    </p>
  );

  if (compact) {
    if (!live) return null;
    return (
      <div className="border-b border-rule bg-sheet">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 py-2 text-sm">
          {question ?? (
            <div className="flex items-center justify-between gap-3">
              <span>
                <span className="font-mono tabular-nums">{clock(shown)}</span> <span className="text-ink-soft">· {status}</span>
              </span>
              <span className="flex gap-1">
                <button onClick={togglePause} disabled={pending} className="inline-flex min-h-11 items-center px-2 font-medium underline-offset-4 hover:underline">
                  {timer.state === "paused" ? "Resume" : "Pause"}
                </button>
                <button onClick={() => finish()} disabled={pending} className="inline-flex min-h-11 items-center px-2 font-medium underline-offset-4 hover:underline">
                  Finish
                </button>
              </span>
            </div>
          )}
          {alert}
        </div>
      </div>
    );
  }

  return (
    <section aria-label="Study timer" className="flex flex-col gap-3 rounded-2xl border border-rule bg-sheet p-4">
      {question ?? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-3xl tabular-nums" aria-live="off">
              {clock(live ? shown : 0)}
            </p>
            <p className="flex items-center gap-1.5 text-sm text-ink-soft" aria-live="polite">
              {live && timer.state === "running" && <span aria-hidden className="size-2 animate-pulse rounded-full bg-[var(--tiles-sage-strong)]" />}
              {live ? status : solo ? "Counts towards no group" : `Counts towards ${groupName ?? "this group"}`}
            </p>
          </div>
          <div className="flex gap-2">
            {!live || otherGroup ? (
              <button onClick={start} disabled={pending} className="inline-flex h-11 items-center rounded-full bg-ink px-5 font-medium whitespace-nowrap text-paper disabled:opacity-50">
                {otherGroup ? "Switch here" : "Start studying"}
              </button>
            ) : (
              <>
                <button onClick={togglePause} disabled={pending} className="inline-flex h-11 items-center rounded-full border border-rule px-4 font-medium">
                  {timer.state === "paused" ? "Resume" : "Pause"}
                </button>
                <button onClick={() => finish()} disabled={pending} className="inline-flex h-11 items-center rounded-full bg-ink px-4 font-medium text-paper">
                  Finish
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {!question && (
        <p className="rounded-xl bg-[var(--tiles-sage-soft)] px-3 py-2 text-sm text-[var(--tiles-sage-ink)]" data-testid="keeps-running">
          {KEEPS_RUNNING}
          {!live && " Pause or finish whenever you like. One timer runs across all your devices."}
        </p>
      )}
      {alert}
    </section>
  );
}

function Choice({ selected, onSelect, label, value }: { selected: boolean; onSelect: () => void; label: string; value: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex min-h-11 items-center justify-between gap-3 rounded-xl border bg-sheet px-3 py-2 text-left text-sm ${selected ? "border-2 border-ink" : "border-rule"}`}
    >
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </button>
  );
}

/** After Edumi was closed everywhere for over 2 hours: what should count? Nothing is assumed. */
function AwayQuestion({
  away,
  pending,
  onAnswer,
}: {
  away: NonNullable<TimerState["away"]>;
  pending: boolean;
  onAnswer: (choice: "left" | "now" | { at: string }, then: "finish" | "resume") => void;
}) {
  const [pick, setPick] = useState<"left" | "now" | "at">("left");
  const [at, setAt] = useState("");
  const picked = pickedIso(at);
  const choice = pick === "at" ? (picked ? { at: picked } : null) : pick;
  return (
    <div className="flex flex-col gap-2" data-testid="welcome-back">
      <p className="font-mono text-xs tracking-wide text-ink-faint uppercase">Welcome back</p>
      <h2 className="text-lg font-semibold">Your session is still open</h2>
      <p className="text-sm text-ink-soft">
        Started {timeOf(away.startedAt)}. You were last in Edumi at {timeOf(away.lastSeenAt)}. Time after that isn&apos;t added to groups or ranks
        until you choose.
      </p>
      <div role="radiogroup" aria-label="What should count?" className="flex flex-col gap-2">
        <Choice selected={pick === "left"} onSelect={() => setPick("left")} label="Count until I left Edumi" value={duration(away.seenSeconds)} />
        <Choice selected={pick === "now"} onSelect={() => setPick("now")} label="I studied the whole time" value={duration(away.allSeconds)} />
        <Choice selected={pick === "at"} onSelect={() => setPick("at")} label="Pick when I stopped" value="Edit" />
      </div>
      {pick === "at" && (
        <label className="flex items-center gap-2 text-sm">
          I stopped at
          <input type="time" value={at} onChange={(e) => setAt(e.target.value)} className="min-h-11 rounded-lg border border-rule bg-sheet px-2" />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button disabled={pending || !choice} onClick={() => choice && onAnswer(choice, "finish")} className="inline-flex h-11 items-center rounded-full bg-ink px-5 font-medium text-paper disabled:opacity-50">
          Finish session
        </button>
        <button disabled={pending || !choice} onClick={() => choice && onAnswer(choice, "resume")} className="inline-flex h-11 items-center rounded-full border border-rule px-5 font-medium disabled:opacity-50">
          Keep going from now
        </button>
      </div>
    </div>
  );
}

/** Finishing a session over 6 hours: keep it, or pick when you stopped. */
function LongQuestion({ seconds, pending, onKeep, onPick, onCancel }: { seconds: number; pending: boolean; onKeep: () => void; onPick: (at: string) => void; onCancel: () => void }) {
  const [at, setAt] = useState("");
  const picked = pickedIso(at);
  return (
    <div className="flex flex-col gap-2" data-testid="long-session">
      <h2 className="text-lg font-semibold">That&apos;s {duration(seconds)}. Keep it all?</h2>
      <p className="text-sm text-ink-soft">Long sessions are easy to leave running. Keep the whole time, or say when you stopped.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={pending} onClick={onKeep} className="inline-flex h-11 items-center rounded-full bg-ink px-5 font-medium text-paper disabled:opacity-50">
          Keep {duration(seconds)}
        </button>
        <label className="flex items-center gap-2 text-sm">
          or I stopped at
          <input type="time" value={at} onChange={(e) => setAt(e.target.value)} className="min-h-11 rounded-lg border border-rule bg-sheet px-2" />
        </label>
        <button disabled={pending || !picked} onClick={() => picked && onPick(picked)} className="inline-flex h-11 items-center rounded-full border border-rule px-4 font-medium disabled:opacity-50">
          Save
        </button>
        <button onClick={onCancel} className="inline-flex h-11 items-center px-2 text-sm text-ink-soft underline-offset-4 hover:underline">
          Not yet
        </button>
      </div>
    </div>
  );
}
