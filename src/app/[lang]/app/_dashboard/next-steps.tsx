"use client";

import { useId, useState, useTransition } from "react";
import { STATUS_LABEL, TASK_STATUSES, type TaskStatus } from "@/lib/tutor/next-steps";
import { setNextStep, updateNextStep } from "../dashboard-actions";
import { useDashboard } from "./lesson-dialog";
import type { DashItem } from "./types";

export type NextStepRow = {
  item: DashItem;
  studentId: string;
  /** The student linked their Edumi account: they see the next step and report progress. */
  linked: boolean;
  /** "Today 4:00pm", "Tomorrow 5:15pm", "Mon 10 Nov 4:00pm". */
  when: string;
  /** "in 12 min", "now" or null. */
  soon: string | null;
  lessonDate: string;
  task: { id: string; body: string; status: TaskStatus; note: string | null; byStudent: boolean; dueLabel: string | null } | null;
  startHere: string | null;
};

const CHIP: Record<TaskStatus, string> = {
  not_started: "dash-tag dash-tag--sand",
  started: "dash-tag dash-tag--blue",
  done: "dash-tag dash-tag--green",
  stuck: "dash-tag dash-tag--pink",
};

/**
 * Before your next lesson (docs/tutor-next-steps.md): the next three students, their next step,
 * how far they got and where to begin. The tutor sets and marks next steps here.
 */
export function NextSteps({ rows }: { rows: NextStepRow[] }) {
  if (!rows.length) return null;
  return (
    <section aria-labelledby="next-steps-title" className="dash-card flex flex-col gap-2 p-4 sm:p-5" data-testid="next-steps">
      <header className="flex flex-col">
        <span className="dash-label">Next steps</span>
        <h2 id="next-steps-title" className="text-xl font-medium">
          Before your next lesson
        </h2>
      </header>
      <ul className="-mx-2 flex flex-col">
        {rows.map((r) => (
          <Row key={r.item.id} row={r} />
        ))}
      </ul>
    </section>
  );
}

function Row({ row }: { row: NextStepRow }) {
  const { openItem } = useDashboard();
  const [editing, setEditing] = useState(false);
  const t = row.task;
  return (
    <li className="dash-row flex flex-col gap-2 px-2 py-3" data-testid="next-step-row">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
        <div className="dash-ui flex shrink-0 flex-col text-xs sm:w-36">
          <span className="font-semibold text-ink tabular-nums">{row.when}</span>
          {row.soon && <span className="text-[var(--dash-accent-text)]">{row.soon}</span>}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => openItem(row.item)} className="font-medium underline-offset-4 hover:underline">
              {row.item.studentName}
            </button>
            {row.item.subjects.length > 0 && <span className="dash-ui text-xs text-ink-soft">{row.item.subjects.join(", ")}</span>}
            {t && <span className={CHIP[t.status]}>{t.status === "stuck" && t.note ? `Stuck: ${t.note}` : STATUS_LABEL[t.status]}</span>}
            {t?.byStudent && <span className="dash-ui text-xs text-ink-faint">reported by {row.item.studentName.split(" ")[0]}</span>}
            {row.linked && !t?.byStudent && <span className="dash-ui text-xs text-ink-faint">sees this on Edumi</span>}
          </div>
          {t ? (
            <p className="text-sm text-ink-soft">
              {t.body}
              {t.dueLabel && <span className="dash-ui text-xs text-ink-faint"> · due {t.dueLabel}</span>}
            </p>
          ) : (
            <p className="text-sm text-ink-faint">No next step set.</p>
          )}
          {row.startHere && (
            <p className="mt-1 w-fit rounded-lg bg-[var(--tiles-sand)] px-3 py-1.5 text-sm text-[var(--tiles-sand-ink)]">
              <span className="font-semibold">Start here:</span> {row.startHere}
            </p>
          )}
        </div>
        <button type="button" className="dash-btn dash-btn--secondary shrink-0 self-start" aria-expanded={editing} onClick={() => setEditing((e) => !e)}>
          {editing ? "Close" : t ? "Update" : "Set next step"}
        </button>
      </div>
      {editing && <Editor row={row} onDone={() => setEditing(false)} />}
    </li>
  );
}

function Editor({ row, onDone }: { row: NextStepRow; onDone: () => void }) {
  const t = row.task;
  const [mode, setMode] = useState<"progress" | "new">(t ? "progress" : "new");
  const [status, setStatus] = useState<TaskStatus>(t?.status ?? "not_started");
  const [note, setNote] = useState(t?.note ?? "");
  const [body, setBody] = useState("");
  const [due, setDue] = useState(row.lessonDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const id = useId();

  const save = () =>
    start(async () => {
      const r =
        mode === "new"
          ? await setNextStep({ studentId: row.studentId, body, dueOn: due || null })
          : await updateNextStep({ id: t!.id, status, note });
      if (r.ok) onDone();
      else setError(r.error);
    });

  return (
    <form
      className="dash-inset flex flex-col gap-3 p-3 sm:ml-40"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {mode === "progress" && t ? (
        <>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="dash-label mb-1">How far did {row.item.studentName.split(" ")[0]} get?</legend>
            <div className="flex flex-wrap gap-2">
              {TASK_STATUSES.map((s) => (
                <label key={s} className={`cursor-pointer ${status === s ? CHIP[s] : "dash-tag"} px-3 py-1 text-xs`}>
                  <input type="radio" name={`${id}-status`} value={s} checked={status === s} onChange={() => setStatus(s)} className="sr-only" />
                  {STATUS_LABEL[s]}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1 text-sm">
            <span className="dash-label">{status === "stuck" ? "Where they got stuck" : "Note (optional)"}</span>
            <input className="dash-field" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={status === "stuck" ? "e.g. which part is the inner function in Q3" : ""} />
          </label>
          <button type="button" className="dash-link self-start text-sm" onClick={() => setMode("new")}>
            Set a new next step instead
          </button>
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="dash-label">Next step for {row.item.studentName.split(" ")[0]}</span>
            <textarea
              className="dash-field"
              rows={2}
              required
              maxLength={300}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="e.g. Try three chain-rule questions. Flag the first step that trips you up."
            />
          </label>
          <label className="flex w-fit flex-col gap-1 text-sm">
            <span className="dash-label">Due</span>
            <input type="date" className="dash-field" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-pen">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className="dash-btn dash-btn--primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" className="dash-btn dash-btn--ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
