"use client";

import { useFormStatus } from "react-dom";

export function GenerateButton({ label = "Make it" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="inline-flex h-10 items-center justify-center rounded-md bg-ink px-4 text-sm font-medium text-paper disabled:opacity-50">
      {pending ? "Writing it… (about 20 seconds)" : label}
    </button>
  );
}
