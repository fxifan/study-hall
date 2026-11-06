"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          if (navigator.share && /Mobi/.test(navigator.userAgent)) await navigator.share({ text });
          else await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          /* dismissed */
        }
      }}
      className="inline-flex h-8 items-center rounded-full border border-rule bg-sheet px-3 text-xs font-medium hover:bg-paper-deep"
    >
      {done ? "Copied" : label}
    </button>
  );
}
