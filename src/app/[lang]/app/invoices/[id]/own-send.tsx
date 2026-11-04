"use client";

import { useEffect, useState, useTransition } from "react";
import { mailtoHref } from "@/lib/mailto";
import { markInvoiceSent } from "../actions";
import { primaryButton, secondaryButton } from "../../_components/styles";

/**
 * Send an invoice (or a reminder) from the tutor's own email, while Study Hall has no verified
 * sending domain. On phones that can share files (iOS Safari, Android Chrome), "Share invoice"
 * opens the share sheet with the PDF attached, so Mail, Gmail, WeChat or WhatsApp all work.
 * Elsewhere: download the PDF, open the pre-filled email, attach it. Then confirm.
 */
export function OwnEmailSend({
  invoiceId,
  to,
  subject,
  body,
  pdfHref,
  filename,
  mode,
  disabled,
}: {
  invoiceId: string;
  to: string;
  subject: string;
  body: string;
  pdfHref: string;
  filename: string;
  /** "invoice": then mark it sent. "reminder": nothing to record. */
  mode: "invoice" | "reminder";
  disabled?: string | null;
}) {
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [step, setStep] = useState<"start" | "opened">("start");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    try {
      const probe = new File([new Blob(["x"], { type: "application/pdf" })], "probe.pdf", { type: "application/pdf" });
      // Feature detection only runs in the browser, after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCanShareFiles(typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] }));
    } catch {
      setCanShareFiles(false);
    }
  }, []);

  async function share() {
    setMessage(null);
    try {
      const res = await fetch(pdfHref);
      if (!res.ok) throw new Error();
      const file = new File([await res.blob()], filename, { type: "application/pdf" });
      await navigator.share({ files: [file], title: subject, text: body });
      setStep("opened");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // closed the share sheet
      setMessage({ tone: "error", text: "Couldn't open sharing. Download the PDF and email it instead." });
    }
  }

  const label = mode === "invoice" ? "invoice" : "reminder";
  if (disabled) return <p className="text-sm text-ink-soft">{disabled}</p>;

  return (
    <div className="flex flex-col gap-2 dash-card p-3">
      <p className="text-sm text-ink-soft">
        Send it from your own email to <strong className="text-ink">{to}</strong>, with the PDF attached.
      </p>
      {canShareFiles && (
        <button type="button" className={primaryButton} onClick={share}>
          Share {label} (PDF attached)
        </button>
      )}
      <div className="grid grid-cols-2 gap-2">
        <a className={secondaryButton} href={pdfHref} download={filename}>
          1. Download PDF
        </a>
        <a className={canShareFiles ? secondaryButton : `${primaryButton}`} href={mailtoHref({ to, subject, body })} onClick={() => setStep("opened")}>
          2. Open email
        </a>
      </div>
      {mode === "invoice" && step === "opened" && (
        <button
          type="button"
          className={primaryButton}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await markInvoiceSent(invoiceId);
              setMessage(r.ok ? { tone: "ok", text: r.message ?? "Marked as sent." } : { tone: "error", text: r.error });
            })
          }
        >
          {pending ? "Saving…" : "I've sent it: mark as sent"}
        </button>
      )}
      {mode === "invoice" && step === "start" && (
        <p className="text-xs text-ink-faint">After sending, come back and mark it as sent. The invoice can&apos;t be edited after that.</p>
      )}
      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`text-sm ${message.tone === "error" ? "text-pen" : ""}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
