"use client";

import { useState, useTransition, type ReactNode } from "react";
import { computeLines, computeTotals, formatCents, type LineInput } from "@/lib/tutor/invoice-math";
import { saveInvoice, sendInvoice } from "../actions";
import { field, primaryButton, secondaryButton } from "../../_components/styles";

type EditLine = { sessionId: string | null; description: string; qty: string; unit: string };

const toEdit = (l: LineInput): EditLine => ({ sessionId: l.sessionId, description: l.description, qty: String(l.qty), unit: (l.unitCents / 100).toFixed(2) });
const toInput = (l: EditLine): LineInput => ({
  sessionId: l.sessionId,
  description: l.description.trim(),
  qty: Number(l.qty) || 0,
  unitCents: Math.round((Number(l.unit) || 0) * 100),
});

/** Draft invoice editor: lines, dates, live totals (same maths as the server), save and send. */
export function InvoiceEditor({
  id,
  initial,
  gstRegistered,
  parentEmail,
  pdfHref,
  ownSend,
}: {
  id: string;
  initial: { issueDate: string; dueDate: string; lines: LineInput[] };
  gstRegistered: boolean;
  parentEmail: string;
  pdfHref: string;
  /** Own-email mode: the share/download/mailto panel, built from the saved invoice. */
  ownSend: ReactNode | null;
}) {
  const [lines, setLines] = useState<EditLine[]>(initial.lines.map(toEdit));
  const [issueDate, setIssueDate] = useState(initial.issueDate);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const computed = computeLines(lines.map(toInput));
  const totals = computeTotals(computed, gstRegistered);
  const edit = (i: number, patch: Partial<EditLine>) => {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
    setDirty(true);
  };
  const save = () => saveInvoice(id, { issueDate, dueDate, lines: lines.map(toInput) });
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      setMessage(null);
      const r = await fn();
      if (r.ok) setDirty(false);
      setMessage(r.ok ? { tone: "ok", text: r.message ?? "Done." } : { tone: "error", text: r.error ?? "Something went wrong." });
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Issue date
          <input type="date" className={field} value={issueDate} onChange={(e) => (setIssueDate(e.target.value), setDirty(true))} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Due date
          <input type="date" className={field} value={dueDate} onChange={(e) => (setDueDate(e.target.value), setDirty(true))} />
        </label>
      </div>

      <ul className="flex flex-col gap-3">
        {lines.map((l, i) => (
          <li key={i} className="flex flex-col gap-2 dash-card p-3">
            <textarea
              className={`${field} h-auto min-h-11 py-2`}
              rows={2}
              value={l.description}
              maxLength={200}
              aria-label={`Line ${i + 1} description`}
              onChange={(e) => edit(i, { description: e.target.value })}
            />
            <div className="grid grid-cols-[4.5rem_1fr_auto_auto] items-center gap-2 text-sm">
              <input className={field} inputMode="decimal" value={l.qty} aria-label={`Line ${i + 1} quantity`} onChange={(e) => edit(i, { qty: e.target.value })} />
              <label className="flex items-center gap-1">
                × A$
                <input className={field} inputMode="decimal" value={l.unit} aria-label={`Line ${i + 1} price`} onChange={(e) => edit(i, { unit: e.target.value })} />
              </label>
              <span className="w-24 text-right font-mono tabular-nums">{formatCents(computed[i].amountCents)}</span>
              <button
                type="button"
                className="h-9 w-8 text-ink-faint hover:text-pen"
                aria-label={`Remove line ${i + 1}`}
                onClick={() => (setLines((ls) => ls.filter((_, j) => j !== i)), setDirty(true))}
              >
                ✕
              </button>
            </div>
            {l.sessionId && <span className="text-xs text-ink-faint">Logged session. Removing it puts the session back to unbilled.</span>}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="self-start text-sm text-ink-soft underline-offset-4 hover:underline"
        onClick={() => (setLines((ls) => [...ls, { sessionId: null, description: "", qty: "1", unit: "0.00" }]), setDirty(true))}
      >
        + Add a line (e.g. materials)
      </button>

      <dl className="ml-auto grid w-64 grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        {gstRegistered ? (
          <>
            <dt>Subtotal (excl. GST)</dt>
            <dd className="text-right font-mono tabular-nums">{formatCents(totals.subtotalCents)}</dd>
            <dt>GST included</dt>
            <dd className="text-right font-mono tabular-nums">{formatCents(totals.gstCents)}</dd>
          </>
        ) : null}
        <dt className="font-medium">Total{gstRegistered ? " (incl. GST)" : ""}</dt>
        <dd className="text-right font-mono font-medium tabular-nums">{formatCents(totals.totalCents)}</dd>
      </dl>

      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${message.tone === "error" ? "border-pen text-pen" : "border-hair bg-sheet"}`}>
          {message.text}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={secondaryButton} disabled={pending || !dirty} onClick={() => run(save)}>
          {dirty ? "Save" : "Saved"}
        </button>
        <a className={`${secondaryButton} ${dirty ? "pointer-events-none opacity-50" : ""}`} href={pdfHref} target="_blank" rel="noreferrer">
          Preview PDF
        </a>
      </div>
      {ownSend ? (
        dirty ? (
          <p className="text-sm text-ink-soft">Save your changes, then send it.</p>
        ) : (
          ownSend
        )
      ) : (
        <button
          type="button"
          className={primaryButton}
          disabled={pending}
          onClick={() => {
            if (!window.confirm(`Email this invoice (${formatCents(totals.totalCents)}) to ${parentEmail}? It can't be edited afterwards.`)) return;
            run(async () => {
              if (dirty) {
                const saved = await save();
                if (!saved.ok) return saved;
              }
              return sendInvoice(id);
            });
          }}
        >
          {pending ? "Working…" : `Send to ${parentEmail}`}
        </button>
      )}
    </div>
  );
}
