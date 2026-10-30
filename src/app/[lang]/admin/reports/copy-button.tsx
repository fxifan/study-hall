"use client";

import { useCopyText } from "@/components/report-cards";
import { Button } from "@/components/ui/button";

export function CopyButton({ text, label, copied, failed }: { text: string; label: string; copied: string; failed: string }) {
  const [state, copy] = useCopyText();
  return (
    <Button type="button" size="sm" variant="outline" onClick={() => copy(text)}>
      {state === "copied" ? copied : state === "failed" ? failed : label}
    </Button>
  );
}
