"use client";

import { useFormStatus } from "react-dom";

/** Submit button that says it's working while the AI drafts (it can take up to a minute). */
export function GenerateButton({ className, label, pendingLabel }: { className: string; label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-live="polite">
      {pending ? pendingLabel : label}
    </button>
  );
}
