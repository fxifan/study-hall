"use client";

import { useState, useTransition } from "react";
import { useCopyText } from "@/components/report-cards";
import { createStudentInvite, unlinkStudent } from "../link-actions";

/**
 * On a tutor's student page: link the student's own Edumi account so they see your next steps and
 * report progress (docs/tutor-next-steps.md).
 */
export function StudentLink({
  recordId,
  firstName,
  origin,
  linkedSince,
  token: initialToken,
}: {
  recordId: string;
  firstName: string;
  origin: string;
  linkedSince: string | null;
  token: string | null;
}) {
  const [token, setToken] = useState(initialToken);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [copyState, copy] = useCopyText();
  const url = token ? `${origin}/link/${token}` : null;

  if (linkedSince) {
    return (
      <section className="dash-card flex flex-col gap-2 p-4" data-testid="student-link">
        <h2 className="font-medium">Edumi account</h2>
        <p className="text-sm text-ink-soft">
          Linked since {linkedSince}. {firstName} sees your next steps and tells you how they went. You don&apos;t see their study time, groups or chats.
        </p>
        <button
          type="button"
          className="dash-btn dash-btn--ghost self-start"
          disabled={pending}
          onClick={() =>
            start(async () => {
              if (!window.confirm(`Unlink ${firstName}? They'll stop seeing your next steps.`)) return;
              const r = await unlinkStudent(recordId);
              if (!r.ok) setError(r.error);
            })
          }
        >
          Unlink
        </button>
        {error && <p role="alert" className="text-sm text-pen">{error}</p>}
      </section>
    );
  }

  return (
    <section className="dash-card flex flex-col gap-3 p-4" data-testid="student-link">
      <div>
        <h2 className="font-medium">Link {firstName}&apos;s Edumi account</h2>
        <p className="text-sm text-ink-soft">
          {firstName} sees your next step when they sit down to study, and tells you how far they got and where they got stuck. Free for them. For students 13 and over.
        </p>
      </div>
      {url ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input readOnly value={url} aria-label="Invite link" className="dash-field min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="dash-btn dash-btn--primary" onClick={() => copy(url)}>
              {copyState === "copied" ? "Copied" : copyState === "failed" ? "Couldn't copy" : "Copy link"}
            </button>
          </div>
          <p className="text-xs text-ink-faint">Send it only to {firstName}. It works once.</p>
        </>
      ) : (
        <button
          type="button"
          className="dash-btn dash-btn--primary self-start"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await createStudentInvite(recordId);
              if (r.ok && r.token) setToken(r.token);
              else if (!r.ok) setError(r.error);
            })
          }
        >
          {pending ? "Creating…" : "Create invite link"}
        </button>
      )}
      {error && <p role="alert" className="text-sm text-pen">{error}</p>}
    </section>
  );
}
