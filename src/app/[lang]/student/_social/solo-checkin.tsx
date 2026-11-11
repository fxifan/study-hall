"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { finishSolo, type SoloFinish } from "./solo-actions";

const CHOICES = [
  ["done", "Done"],
  ["partly", "Partly"],
  ["stuck", "Stuck"],
] as const;

/** End of a solo session: how it went, and one line for tomorrow (docs/consistency-and-solo.md). */
export function SoloCheckIn({ task }: { task: string }) {
  const [status, setStatus] = useState<"done" | "partly" | "stuck">("done");
  const [tomorrow, setTomorrow] = useState("");
  const [result, setResult] = useState<SoloFinish | null>(null);
  const [pending, start] = useTransition();

  if (result?.ok) {
    return (
      <section className="flex flex-col gap-3" data-testid="solo-result">
        <p role="status" className="rounded-2xl bg-[var(--tiles-sage-ink)] px-4 py-3 text-paper">
          {result.counted ? "Study day counted" : "Saved"}
          {result.points ? ` · +${result.points} points` : ""}
          {result.streak ? ` · ${result.streak}-day streak` : ""}
        </p>
        {tomorrow && (
          <p className="rounded-2xl bg-[var(--tiles-sand)] px-4 py-3 text-sm text-[var(--tiles-sand-ink)]">
            <span className="font-semibold">Tomorrow:</span> {tomorrow}
          </p>
        )}
        <Link href="/student/groups" className="inline-flex h-11 w-fit items-center rounded-full bg-ink px-5 font-medium text-paper no-underline">
          Back to Groups
        </Link>
      </section>
    );
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-2xl border border-rule bg-sheet p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await finishSolo({ status, tomorrow })));
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">How did “{task}” go?</legend>
        <div className="grid grid-cols-3 gap-2">
          {CHOICES.map(([value, label]) => (
            <label
              key={value}
              className={`flex h-11 cursor-pointer items-center justify-center rounded-full border text-sm ${status === value ? "border-[var(--tiles-sage-ink)] bg-[var(--tiles-sage-soft)] font-semibold" : "border-rule bg-paper"}`}
            >
              <input type="radio" name="status" value={value} checked={status === value} onChange={() => setStatus(value)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink-soft">Tomorrow (optional)</span>
        <input
          value={tomorrow}
          maxLength={200}
          onChange={(e) => setTomorrow(e.target.value)}
          placeholder="e.g. Finish questions 6–10"
          className="h-11 rounded-lg border border-rule bg-paper px-3"
        />
      </label>
      {result && !result.ok && (
        <p role="alert" className="text-sm text-pen">
          {result.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="inline-flex h-11 w-fit items-center rounded-full bg-ink px-5 font-medium text-paper disabled:opacity-50">
        {pending ? "Saving…" : "I'm done"}
      </button>
    </form>
  );
}
