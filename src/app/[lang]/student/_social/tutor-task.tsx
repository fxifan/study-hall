"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { STATUS_LABEL, TASK_STATUSES, type TaskStatus } from "@/lib/tutor/next-steps";
import { acceptTutorInvite, declineTutorInvite, leaveTutor, reportTutorTask } from "./tutor-actions";

const STUDENT_LABEL: Record<TaskStatus, string> = { ...STATUS_LABEL, not_started: "Not started" };
const TONE: Record<TaskStatus, string> = {
  not_started: "border-ink bg-[var(--tiles-sand)] text-[var(--tiles-sand-ink)]",
  started: "border-ink bg-[var(--tiles-slate-soft)] text-[var(--tiles-slate-ink)]",
  done: "border-ink bg-[var(--tiles-sage-soft)] text-[var(--tiles-sage-ink)]",
  stuck: "border-ink bg-[var(--tiles-pink-soft)] text-[var(--tiles-pink-ink)]",
};

type Task = { id: string; body: string; dueLabel: string | null; status: TaskStatus; note: string | null; updatedBy: "tutor" | "student" };

/** "From your tutor": the current next step, and how far the student got (docs/tutor-next-steps.md). */
export function TutorTaskCard({ recordId, tutorName, task }: { recordId: string; tutorName: string; task: Task | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "not_started");
  const [note, setNote] = useState(task?.note ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      if (!task) return;
      const r = await reportTutorTask({ id: task.id, status, note });
      setMsg(r.ok ? { ok: true, text: r.message ?? "Saved." } : { ok: false, text: r.error });
    });
  const leave = () =>
    start(async () => {
      if (!window.confirm(`Unlink from ${tutorName}? They'll stop seeing your progress.`)) return;
      const r = await leaveTutor(recordId);
      if (r.ok) router.refresh();
      else setMsg({ ok: false, text: r.error });
    });

  return (
    <section aria-label={`From ${tutorName}`} className="flex flex-col gap-3 rounded-2xl border-2 border-[var(--tiles-sage)] bg-sheet p-4" data-testid="tutor-task">
      <div className="flex items-center justify-between gap-2">
        <span className="w-fit rounded-full bg-[var(--tiles-sage-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--tiles-sage-ink)]">
          From {tutorName}
          {task?.dueLabel ? ` · due ${task.dueLabel}` : ""}
        </span>
        <button type="button" onClick={leave} className="text-xs text-ink-faint hover:text-pen">
          Unlink
        </button>
      </div>
      {task ? (
        <>
          <p className="font-medium">{task.body}</p>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm text-ink-soft">How did you go?</legend>
            <div className="flex flex-wrap gap-2">
              {TASK_STATUSES.map((s) => (
                <label key={s} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${status === s ? TONE[s] : "border-rule"}`}>
                  <input type="radio" name={`status-${task.id}`} value={s} checked={status === s} onChange={() => setStatus(s)} className="sr-only" />
                  {STUDENT_LABEL[s]}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-soft">{status === "stuck" ? "Where did you get stuck?" : "Anything to tell your tutor? (optional)"}</span>
            <input
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
              placeholder={status === "stuck" ? "e.g. which part is the inner function in Q3" : ""}
              className="rounded-lg border border-rule bg-paper px-3 py-2"
            />
          </label>
          <button type="button" onClick={save} disabled={pending} className="inline-flex h-10 w-fit items-center rounded-full bg-ink px-4 text-sm font-medium text-paper disabled:opacity-50">
            {pending ? "Saving…" : `Tell ${tutorName.split(" ")[0]}`}
          </button>
        </>
      ) : (
        <p className="text-sm text-ink-soft">No next step yet. It&apos;ll show here after your next lesson.</p>
      )}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-ink-soft" : "text-pen"}`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}

/** An invite held through sign-up or login: accept it here, or not now. */
export function PendingInvite({ token, tutorName }: { token: string; tutorName: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-rule bg-sheet p-4" data-testid="pending-invite">
      <p className="font-medium">{tutorName} invited you to link your account</p>
      <p className="text-sm text-ink-soft">
        {tutorName} will see the next steps they set you, how far you got and where you got stuck. Not your study time, groups, chats, friends or practice.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await acceptTutorInvite(token);
              if (r.ok) router.refresh();
              else setError(r.error);
            })
          }
          className="inline-flex h-10 items-center rounded-full bg-ink px-4 text-sm font-medium text-paper disabled:opacity-50"
        >
          Accept and link
        </button>
        <button type="button" disabled={pending} onClick={() => start(() => declineTutorInvite())} className="inline-flex h-10 items-center rounded-full border border-rule px-4 text-sm">
          Not now
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-pen">
          {error}
        </p>
      )}
    </section>
  );
}
