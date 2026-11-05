"use client";

import { useState, useTransition } from "react";
import { useCopyText } from "@/components/report-cards";
import { deleteMeetingLink, saveMeetingLink } from "../dashboard-actions";
import { field, labelClass, primaryButton, secondaryButton } from "./ui";
import type { DashLink, DashStudent } from "./types";

/**
 * Saved Zoom links: paste once, then copy or open in one tap right before class. Study Hall stores
 * the links tutors paste; it doesn't create Zoom meetings.
 */
export function MeetingLinks({ links, students }: { links: DashLink[]; students: DashStudent[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section id="meeting-links" aria-labelledby="links-title" className="dash-card flex flex-col gap-3 p-4 sm:p-5">
      <header>
        <span className="dash-label">Online lessons</span>
        <h2 id="links-title" className="text-xl font-medium">
          Class links
        </h2>
        <p className="text-sm text-ink-soft">Your Zoom links, ready to copy before class.</p>
      </header>
      {links.length ? (
        <ul className="flex flex-col gap-2">
          {links.map((link) =>
            editing === link.id ? (
              <li key={link.id} className="dash-inset p-3">
                <LinkForm link={link} students={students} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <LinkRow key={link.id} link={link} onEdit={() => setEditing(link.id)} />
            ),
          )}
        </ul>
      ) : (
        <p className="dash-inset border-dashed px-3 py-5 text-center text-sm text-ink-soft">
          No links yet. Paste your Zoom link below to keep it one tap away.
        </p>
      )}
      {editing === null && (
        <details className="dash-inset group px-3 py-2.5" open={links.length === 0}>
          <summary className="dash-ui cursor-pointer text-sm font-semibold text-[var(--dash-accent-text)]">+ Add a Zoom link</summary>
          <div className="pt-3">
            <LinkForm link={null} students={students} onDone={() => undefined} />
          </div>
        </details>
      )}
    </section>
  );
}

function LinkRow({ link, onEdit }: { link: DashLink; onEdit: () => void }) {
  const [copyState, copy] = useCopyText();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <li className="dash-inset flex flex-col gap-2 p-3 transition-colors hover:border-[var(--dash-border-strong)]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{link.name}</span>
        {link.studentName && <span className="dash-pill shrink-0 px-2 py-0.5 text-xs">{link.studentName}</span>}
      </div>
      <span className="truncate font-mono text-xs text-ink-faint">{link.url.replace(/^https:\/\//, "")}</span>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={primaryButton} onClick={() => copy(link.url)} aria-live="polite">
          {copyState === "copied" ? "Copied ✓" : copyState === "failed" ? "Couldn't copy" : "Copy"}
        </button>
        <a className={secondaryButton} href={link.url} target="_blank" rel="noreferrer">
          Open ↗
        </a>
      </div>
      <div className="dash-ui -mb-1 flex justify-end gap-1 text-xs">
        <button type="button" className="dash-btn dash-btn--ghost !min-h-8 !px-2 text-xs" onClick={onEdit}>
          Edit
        </button>
        <button
          type="button"
          disabled={pending}
          className="dash-btn dash-btn--ghost !min-h-8 !px-2 text-xs"
          onClick={() =>
            window.confirm(`Delete "${link.name}"?`) &&
            start(async () => {
              const r = await deleteMeetingLink(link.id);
              if (!r.ok) setError(r.error);
            })
          }
        >
          {pending ? "Deleting…" : "Delete"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-pen">
          {error}
        </p>
      )}
    </li>
  );
}

function LinkForm({ link, students, onDone }: { link: DashLink | null; students: DashStudent[]; onDone: () => void }) {
  const [name, setName] = useState(link?.name ?? "");
  const [url, setUrl] = useState(link?.url ?? "");
  const [studentId, setStudentId] = useState(link?.studentId ?? "");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    start(async () => {
      const r = await saveMeetingLink({ id: link?.id ?? null, name, url, studentId: studentId || null });
      if (!r.ok) return setMessage({ tone: "error", text: r.error });
      if (!link) {
        setName("");
        setUrl("");
        setStudentId("");
      }
      setMessage({ tone: "ok", text: r.message ?? "Saved." });
      onDone();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <label className={labelClass}>
        Zoom link
        <input
          id={link ? undefined : "new-link-url"}
          className={`${field} w-full`}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://zoom.us/j/1234567890"
          inputMode="url"
          autoComplete="off"
          aria-invalid={message?.tone === "error" || undefined}
          required
        />
      </label>
      <label className={labelClass}>
        Name
        <input className={`${field} w-full`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="My regular classroom" required />
      </label>
      <label className={labelClass}>
        For a student (optional)
        <select className={`${field} w-full`} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">Any student</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`text-sm ${message.tone === "error" ? "text-pen" : "text-ink-soft"}`}>
          {message.text}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className={`${primaryButton} flex-1`} disabled={pending}>
          {pending ? "Saving…" : link ? "Save changes" : "Save link"}
        </button>
        {link && (
          <button type="button" className={secondaryButton} onClick={onDone} disabled={pending}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
