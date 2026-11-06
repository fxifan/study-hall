"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { heartbeat, startStudy, stopStudy, type TimerState } from "./actions";

/** How often the screen proves it's open and in use. The server's grace is 75 s. */
const BEAT_MS = 30_000;
/** No mouse, key, touch or scroll for this long counts as idle and pauses credit. */
const IDLE_MS = 5 * 60_000;

function clock(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * The verified study timer. Credit is the server's: this component only reports whether the
 * study screen is visible and in use (heartbeats). It pauses when the tab is hidden, the student
 * goes idle, or they press pause; a device that disappears stops earning at its last heartbeat.
 * The displayed clock ticks locally between beats and is corrected by each server reply.
 */
export function StudyTimer({
  initial,
  groupId,
  groupName,
  studyScreen,
  compact = false,
}: {
  initial: TimerState;
  /** The group a new session counts towards (the group page). */
  groupId?: string;
  groupName?: string;
  /** False on pages that aren't study screens: beats report inactive, so credit pauses. */
  studyScreen: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [timer, setTimer] = useState<TimerState>(initial);
  const [manualPause, setManualPause] = useState(initial.state === "paused");
  const [visible, setVisible] = useState(true);
  const [idle, setIdle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const lastInput = useRef(0);
  const syncedAt = useRef(0);
  const [extra, setExtra] = useState(0);

  const active = studyScreen && visible && !idle && !manualPause;

  const apply = useCallback((t: TimerState) => {
    syncedAt.current = Date.now();
    setExtra(0);
    setTimer((prev) => ({ ...prev, ...t, groupId: t.groupId ?? prev.groupId }));
  }, []);

  // Visibility and idle detection.
  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === "visible");
    const onInput = () => {
      lastInput.current = Date.now();
      setIdle(false);
    };
    lastInput.current = Date.now();
    onVis();
    document.addEventListener("visibilitychange", onVis);
    const events = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, onInput, { passive: true }));
    const idleCheck = setInterval(() => setIdle(Date.now() - lastInput.current > IDLE_MS), 15_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      events.forEach((e) => window.removeEventListener(e, onInput));
      clearInterval(idleCheck);
    };
  }, []);

  // Heartbeats while a session is live; an immediate beat whenever "active" changes.
  const sessionId = timer.sessionId;
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const send = () =>
      heartbeat(sessionId, active)
        .then((t) => {
          if (cancelled) return;
          apply(t);
          if (t.state === "stopped") {
            setTimer({ sessionId: null, state: "stopped", seconds: t.seconds, groupId: null });
            router.refresh();
          }
        })
        .catch(() => setError("Lost connection. Your time is safe up to the last check-in."));
    send();
    const id = setInterval(send, BEAT_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sessionId, active, apply, router]);

  // A local tick between beats (display only).
  useEffect(() => {
    if (timer.state !== "running" || !active) return;
    const id = setInterval(() => setExtra(Math.min(BEAT_MS / 1000 + 45, (Date.now() - syncedAt.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [timer.state, active]);
  const shown = timer.seconds + (timer.state === "running" && active ? extra : 0);

  const start = () =>
    startTransition(async () => {
      if (!groupId) return;
      setError(null);
      setManualPause(false);
      try {
        apply(await startStudy(groupId));
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't start the timer.");
      }
    });
  const stop = () =>
    startTransition(async () => {
      if (!timer.sessionId) return;
      const t = await stopStudy(timer.sessionId);
      setTimer({ sessionId: null, state: "stopped", seconds: t.seconds, groupId: null });
      setManualPause(false);
      router.refresh();
    });

  const live = Boolean(timer.sessionId);
  const otherGroup = live && groupId && timer.groupId && timer.groupId !== groupId;
  const status = !live
    ? null
    : !studyScreen
      ? "Paused: open a group or practice page to keep earning"
      : manualPause
        ? "Paused"
        : !visible
          ? "Paused while Edumi is hidden"
          : idle
            ? "Paused: are you still there?"
            : "Counting";

  if (compact) {
    if (!live) return null;
    return (
      <div className="border-b border-rule bg-sheet">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-2 text-sm">
          <span>
            <span className="font-mono">{clock(shown)}</span> <span className="text-ink-soft">· {status}</span>
          </span>
          <button onClick={stop} disabled={pending} className="text-sm font-medium text-ink underline-offset-4 hover:underline">
            Stop
          </button>
        </div>
      </div>
    );
  }

  return (
    <section aria-label="Study timer" className="flex flex-col gap-3 rounded-2xl border border-rule bg-sheet p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-3xl tabular-nums" aria-live="off">
            {clock(live ? shown : 0)}
          </p>
          <p className="text-sm text-ink-soft" aria-live="polite">
            {live ? status : `Counts towards ${groupName ?? "this group"}`}
          </p>
        </div>
        <div className="flex gap-2">
          {!live || otherGroup ? (
            <button onClick={start} disabled={pending} className="inline-flex h-11 items-center rounded-full bg-ink px-5 font-medium whitespace-nowrap text-paper disabled:opacity-50">
              {otherGroup ? "Switch here" : "Start studying"}
            </button>
          ) : (
            <>
              <button onClick={() => setManualPause((p) => !p)} disabled={pending} className="inline-flex h-11 items-center rounded-full border border-rule px-4 font-medium">
                {manualPause ? "Resume" : "Pause"}
              </button>
              <button onClick={stop} disabled={pending} className="inline-flex h-11 items-center rounded-full bg-ink px-4 font-medium text-paper">
                Stop
              </button>
            </>
          )}
        </div>
      </div>
      {!live && (
        <p className="text-xs text-ink-faint">
          Verified time only: the timer counts while an Edumi group or practice page is open and you&apos;re active. It pauses when you switch tabs, lock
          your screen or go idle for 5 minutes. One timer runs across all your devices.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-pen">
          {error}
        </p>
      )}
    </section>
  );
}
