"use client";

import { useState, useTransition } from "react";
import { useCopyText } from "@/components/report-cards";
import { deleteMeetingLink, saveMeetingLink } from "../dashboard-actions";
import { field, labelClass, primaryButton, secondaryButton } from "../_components/styles";
import type { DashLink, DashStudent } from "./types";

/**
 * Saved Zoom links: paste once, then copy or open in one tap right before class. Study Hall stores
 * the links tutors paste; it doesn't create Zoom meetings.
 */
export function MeetingLinks({ links, students }: { links: DashLink[]; students: DashStudent[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section id="meeting-links" aria-labelledby="links-title" className="flex flex-col gap-3 rounded-lg border border-hair bg-sheet p-4">
      <header>
        <h2 id="links-title" className="text-lg font-medium">
          Class links
        </h2>
        <p className="text-sm text-ink-soft">Your Zoom links, ready to copy before class.</p>
      </header>
      {links.length ? (
        <ul className="flex flex-col divide-y divide-rule">
          {links.map((link) =>
            editing === link.id ? (
              <li key={link.id} className="py-3">
                <LinkForm link={link} students={students} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <LinkRow key={link.id} link={link} onEdit={() => setEditing(link.id)} />
            ),
          )}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed border-rule px-3 py-4 text-center text-sm text-ink-soft">
          No links yet. Paste your Zoom link below to keep it one tap away.
        </p>
      )}
      {editing === null && (
        <details className="group rounded-md border border-hair px-3 py-2" open={links.length === 0}>
          <summary className="cursor-pointer text-sm font-medium">+ Add a Zoom link</summary>
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
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{link.name}</span>
        {link.studentName && <span className="shrink-0 rounded-full border border-hair px-2 py-0.5 text-xs text-ink-soft">{link.studentName}</span>}
      </div>
      <span className="truncate font-mono text-xs text-ink-soft">{link.url.replace(/^https:\/\//, "")}</span>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${primaryButton} min-w-24`} onClick={() => copy(link.url)} aria-live="polite">
          {copyState === "copied" ? "Copied ✓" : copyState === "failed" ? "Couldn't copy" : "Copy"}
        </button>
        <a className={secondaryButton} href={link.url} target="_blank" rel="noreferrer">
          Open ↗
        </a>
        <button type="button" className="ml-auto h-11 px-2 text-sm text-ink-soft hover:text-ink sm:h-9" onClick={onEdit}>
          Edit
        </button>
        <button
          type="button"
          disabled={pending}
          className="h-11 px-2 text-sm text-ink-soft hover:text-pen sm:h-9"
          onClick={() =>
            window.confirm(`Delete "${link.name}"?`) &&
            start(async () => {
              const r = await deleteMeetingLink(link.id);
              if (!r.ok) setError(r.error);
            })
          }
        >
          Delete
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
          className={field}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://zoom.us/j/1234567890"
          inputMode="url"
          autoComplete="off"
          aria-invalid={message?.tone === "error" || undefined}
          required
        />
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className={labelClass}>
          Name
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="My regular classroom" required />
        </label>
        <label className={labelClass}>
          For a student (optional)
          <select className={field} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Any student</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`text-sm ${message.tone === "error" ? "text-pen" : "text-ink-soft"}`}>
          {message.text}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={pending}>
          {pending ? "Saving…" : link ? "Save" : "Save link"}
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
