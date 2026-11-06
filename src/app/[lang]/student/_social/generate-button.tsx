"use client";

import { useFormStatus } from "react-dom";

export function GenerateButton({ label = "Make it", disabled = false }: { label?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending || disabled} className="inline-flex h-11 items-center justify-center rounded-full bg-ink px-5 text-sm font-medium text-paper disabled:opacity-50">
      {pending ? "Writing it… (about 20 seconds)" : label}
    </button>
  );
}
