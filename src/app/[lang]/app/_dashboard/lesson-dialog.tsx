"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { deleteLesson, saveLesson, setLessonCancelled } from "../dashboard-actions";
import { field, labelClass, primaryButton, secondaryButton } from "./ui";
import { useCopyText } from "@/components/report-cards";
import type { DashItem, DashLink, DashStudent } from "./types";

type Mode = { kind: "create"; dateKey: string; time: string; studentId?: string } | { kind: "view"; item: DashItem } | { kind: "edit"; item: DashItem };

const DashboardContext = createContext<{
  openCreate: (dateKey?: string, time?: string, studentId?: string) => void;
  openItem: (item: DashItem) => void;
} | null>(null);

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard outside DashboardProvider");
  return ctx;
}

/**
 * Holds the one lesson dialog for the dashboard. The calendar, quick actions and student list open
 * it: to schedule a lesson (optionally weekly), to see a lesson's details, or to reschedule it.
 */
export function DashboardProvider({
  children,
  students,
  links,
  todayKey,
  logHref,
  reportHref,
  studentsHref,
}: {
  children: ReactNode;
  students: DashStudent[];
  links: DashLink[];
  todayKey: string;
  /** "/app/log" (localized): ?lesson=<id> is appended. */
  logHref: string;
  /** "/app/reports" (localized): /<id> is appended. */
  reportHref: string;
  studentsHref: string;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (mode && !dialog.open) dialog.showModal();
    if (!mode && dialog.open) dialog.close();
  }, [mode]);
  // A modal dialog makes the rest of the page inert: always close it before leaving the page.
  useEffect(() => {
    const dialog = ref.current;
    return () => dialog?.close();
  }, []);

  const ctx = {
    openCreate: (dateKey?: string, time?: string, studentId?: string) => setMode({ kind: "create", dateKey: dateKey ?? todayKey, time: time ?? "16:00", studentId }),
    openItem: (item: DashItem) => setMode({ kind: "view", item }),
  };

  return (
    <DashboardContext.Provider value={ctx}>
      {children}
      <dialog
        ref={ref}
        onClose={() => setMode(null)}
        onClick={(e) => e.target === e.currentTarget && setMode(null)}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] p-0"
        aria-labelledby="lesson-dialog-title"
      >
        {mode && (
          <div className="flex flex-col gap-4 p-5">
            {mode.kind === "view" ? (
              <LessonDetails
                item={mode.item}
                link={links.find((l) => l.id === mode.item.meetingLinkId) ?? null}
                logHref={logHref}
                reportHref={reportHref}
                onEdit={() => setMode({ kind: "edit", item: mode.item })}
                onClose={() => setMode(null)}
              />
            ) : (
              <LessonForm
                key={mode.kind === "edit" ? mode.item.id : `${mode.dateKey}${mode.time}`}
                mode={mode}
                students={students}
                links={links}
                studentsHref={studentsHref}
                onDone={() => setMode(null)}
              />
            )}
          </div>
        )}
      </dialog>
    </DashboardContext.Provider>
  );
}

const STATUS_TEXT = { scheduled: "Scheduled", done: "Done · logged", cancelled: "Cancelled" } as const;

function LessonDetails({
  item,
  link,
  logHref,
  reportHref,
  onEdit,
  onClose,
}: {
  item: DashItem;
  link: DashLink | null;
  logHref: string;
  reportHref: string;
  onEdit: () => void;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copyState, copy] = useCopyText();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) onClose();
      else setError(r.error ?? "Something went wrong.");
    });
  const needsLogging = item.status === "scheduled" && item.isPast;

  return (
    <>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 id="lesson-dialog-title" className="text-xl font-medium">
            {item.studentName}
          </h2>
          <p className="text-sm text-ink-soft">
            {item.dayLabel} · {item.timeLabel}–{item.endLabel} ({item.durationMin} min)
          </p>
        </div>
        <span
          className={`dash-pill shrink-0 px-2 py-0.5 text-xs ${needsLogging || item.status === "scheduled" ? "dash-pill--accent" : ""}`}
        >
          {needsLogging ? "Not logged yet" : STATUS_TEXT[item.status]}
        </span>
      </header>
      {item.subjects.length > 0 && <p className="text-sm">{item.subjects.join(", ")}</p>}
      {item.notes && <p className="dash-inset px-3 py-2 text-sm">{item.notes}</p>}
      {link && (
        <div className="dash-inset flex flex-wrap items-center gap-1 px-3 py-1.5 text-sm">
          <span className="mr-auto truncate">{link.name}</span>
          <button type="button" className="dash-btn dash-btn--ghost" onClick={() => copy(link.url)}>
            {copyState === "copied" ? "Copied" : copyState === "failed" ? "Couldn't copy" : "Copy link"}
          </button>
          <a className="dash-btn dash-btn--ghost" href={link.url} target="_blank" rel="noreferrer">
            Open ↗
          </a>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-pen">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2">
        {item.reportId ? (
          <Link className={primaryButton} href={`${reportHref}/${item.reportId}`} onClick={onClose}>
            View report
          </Link>
        ) : item.lessonId && item.status === "scheduled" ? (
          <Link className={needsLogging ? primaryButton : secondaryButton} href={`${logHref}?lesson=${item.lessonId}`} onClick={onClose}>
            Log this lesson and write the report
          </Link>
        ) : null}
        {item.lessonId && item.status !== "done" && (
          <div className="grid grid-cols-3 gap-2">
            <button type="button" className={secondaryButton} disabled={pending} onClick={onEdit}>
              Reschedule
            </button>
            <button
              type="button"
              className={secondaryButton}
              disabled={pending}
              onClick={() => run(() => setLessonCancelled(item.lessonId!, item.status !== "cancelled"))}
            >
              {item.status === "cancelled" ? "Restore" : "Cancel"}
            </button>
            <button
              type="button"
              className={`${secondaryButton} !text-[var(--dash-accent-text)]`}
              disabled={pending}
              onClick={() => window.confirm("Delete this lesson?") && run(() => deleteLesson(item.lessonId!))}
            >
              Delete
            </button>
          </div>
        )}
        {item.kind === "session" && <p className="text-xs text-ink-faint">Logged without a scheduled lesson.</p>}
        <button type="button" className="dash-btn dash-btn--ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </>
  );
}

const DURATIONS = [30, 45, 60, 75, 90, 120];

function LessonForm({
  mode,
  students,
  links,
  studentsHref,
  onDone,
}: {
  mode: Extract<Mode, { kind: "create" | "edit" }>;
  students: DashStudent[];
  links: DashLink[];
  studentsHref: string;
  onDone: () => void;
}) {
  const editing = mode.kind === "edit" ? mode.item : null;
  const [studentId, setStudentId] = useState(editing?.studentId ?? (mode.kind === "create" ? mode.studentId : undefined) ?? (students.length === 1 ? students[0].id : ""));
  const student = students.find((s) => s.id === studentId);
  const [subjects, setSubjects] = useState<string[]>(editing?.subjects ?? student?.subjects.slice(0, 1) ?? []);
  const [date, setDate] = useState(editing?.dateKey ?? (mode.kind === "create" ? mode.dateKey : ""));
  const [time, setTime] = useState(editing?.time24 ?? (mode.kind === "create" ? mode.time : "16:00"));
  const [duration, setDuration] = useState(editing?.durationMin ?? 60);
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const defaultLink = (id: string) => links.find((l) => l.studentId === id)?.id ?? "";
  const [linkId, setLinkId] = useState(editing ? (editing.meetingLinkId ?? "") : defaultLink(studentId));
  const [repeat, setRepeat] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!students.length) {
    return (
      <>
        <h2 id="lesson-dialog-title" className="text-xl font-medium">
          Schedule a lesson
        </h2>
        <p className="text-sm text-ink-soft">Add a student first, then you can schedule their lessons.</p>
        <Link className={primaryButton} href={studentsHref} onClick={onDone}>
          Add a student
        </Link>
        <button type="button" className="dash-btn dash-btn--ghost" onClick={onDone}>
          Close
        </button>
      </>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId) return setError("Choose a student.");
    setError(null);
    start(async () => {
      const r = await saveLesson({
        id: editing?.lessonId ?? null,
        studentId,
        date,
        time,
        durationMin: duration,
        subjects,
        notes,
        meetingLinkId: linkId || null,
        repeatWeeks: editing ? 1 : repeat,
      });
      if (r.ok) onDone();
      else setError(r.error);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h2 id="lesson-dialog-title" className="text-xl font-medium">
        {editing ? "Reschedule lesson" : "Schedule a lesson"}
      </h2>
      <label className={labelClass}>
        Student
        <select
          className={field}
          value={studentId}
          required
          disabled={Boolean(editing)}
          onChange={(e) => {
            setStudentId(e.target.value);
            setSubjects(students.find((s) => s.id === e.target.value)?.subjects.slice(0, 1) ?? []);
            setLinkId(defaultLink(e.target.value));
          }}
        >
          <option value="">Choose…</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className={`${labelClass} col-span-2 sm:col-span-1`}>
          Date
          <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className={labelClass}>
          Start
          <input type="time" step={300} className={field} value={time} onChange={(e) => setTime(e.target.value)} required />
        </label>
        <label className={labelClass}>
          Length
          <select className={field} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {[...new Set([...DURATIONS, duration])].sort((a, b) => a - b).map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </select>
        </label>
      </div>
      {student && student.subjects.length > 0 && (
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-1.5 text-sm font-medium">Subjects</legend>
          {student.subjects.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={subjects.includes(s)}
              onClick={() => setSubjects((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))}
              className="dash-chip"
            >
              {s}
            </button>
          ))}
        </fieldset>
      )}
      <label className={labelClass}>
        Meeting link
        <select className={field} value={linkId} onChange={(e) => setLinkId(e.target.value)}>
          <option value="">None (in person, or add one below)</option>
          {links.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Notes (optional)
        <input className={field} value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Bring practice SAC" />
      </label>
      {!editing && (
        <label className={labelClass}>
          Repeat
          <select className={field} value={repeat} onChange={(e) => setRepeat(Number(e.target.value))}>
            <option value={1}>Just this once</option>
            {[4, 8, 10, 12].map((n) => (
              <option key={n} value={n}>
                Weekly, {n} lessons
              </option>
            ))}
          </select>
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-pen">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={secondaryButton} onClick={onDone} disabled={pending}>
          Cancel
        </button>
        <button type="submit" className={primaryButton} disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Schedule"}
        </button>
      </div>
    </form>
  );
}
