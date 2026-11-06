"use client";

import { useState, useTransition } from "react";
import type { PublicQuiz } from "@/lib/social/resources";
import { submitQuiz, type QuizResult } from "./actions";

export function Flashcards({ cards }: { cards: { front: string; back: string }[] }) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const c = cards[i];
  const go = (d: number) => {
    setFlipped(false);
    setI((x) => (x + d + cards.length) % cards.length);
  };
  return (
    <section aria-label="Flashcards" className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="flex min-h-48 w-full max-w-xl items-center justify-center rounded-xl border border-rule bg-sheet p-6 text-center text-lg shadow-sm"
        aria-label={flipped ? "Show the question" : "Show the answer"}
      >
        {flipped ? c.back : c.front}
      </button>
      <div className="flex items-center gap-4 text-sm">
        <button type="button" onClick={() => go(-1)} className="rounded-md border border-rule px-3 py-1.5">
          ← Back
        </button>
        <span className="font-mono">
          {i + 1} / {cards.length}
        </span>
        <button type="button" onClick={() => go(1)} className="rounded-md border border-rule px-3 py-1.5">
          Next →
        </button>
      </div>
      <p className="text-xs text-ink-faint">Tap the card to flip it.</p>
    </section>
  );
}

const LABELS = ["A", "B", "C", "D"];

/** Answers are marked on the server; the key and explanations arrive only after submitting. */
export function QuizRunner({ resourceId, quiz }: { resourceId: string; quiz: PublicQuiz }) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => quiz.questions.map(() => null));
  const [result, setResult] = useState<Exclude<QuizResult, { error: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const all = answers.every((a) => a !== null);

  const submit = () =>
    start(async () => {
      const r = await submitQuiz(resourceId, answers);
      if ("error" in r) setError(r.error);
      else {
        setError(null);
        setResult(r);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });

  return (
    <section aria-label="Quiz" className="flex flex-col gap-4">
      {result && (
        <div role="status" className="rounded-lg border border-ink bg-sheet p-4">
          <p className="text-2xl font-medium">
            {result.correct} / {result.total} · {Math.round(result.pct)}%
          </p>
          <p className="text-sm text-ink-soft">
            {result.awards.length
              ? `+${result.awards.reduce((s, a) => s + a.points, 0)} points (${result.awards.map((a) => (a.kind === "completion" ? "completion" : a.kind === "score70" ? "70% milestone" : "90% milestone")).join(", ")})`
              : "No new points this time: each milestone counts once per quiz."}
          </p>
        </div>
      )}
      <ol className="flex flex-col gap-4">
        {quiz.questions.map((q, qi) => {
          const right = result?.answers[qi];
          return (
            <li key={qi} className="rounded-lg border border-rule bg-sheet p-4">
              <p className="mb-3 font-medium whitespace-pre-wrap">
                {qi + 1}. {q.prompt}
              </p>
              <fieldset className="flex flex-col gap-2" disabled={Boolean(result)}>
                <legend className="sr-only">Question {qi + 1}</legend>
                {q.options.map((o, oi) => {
                  const chosen = answers[qi] === oi;
                  const tone = result ? (oi === right ? "border-success bg-paper" : chosen ? "border-pen" : "border-rule") : chosen ? "border-ink" : "border-rule";
                  return (
                    <label key={oi} className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm ${tone}`}>
                      <input
                        type="radio"
                        name={`q${qi}`}
                        checked={chosen}
                        onChange={() => setAnswers((a) => a.map((x, i) => (i === qi ? oi : x)))}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="mr-1 font-mono">{LABELS[oi]}</span>
                        {o}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
              {result && <p className="mt-2 text-sm text-ink-soft">{result.explanations[qi]}</p>}
            </li>
          );
        })}
      </ol>
      {error && (
        <p role="alert" className="text-sm text-pen">
          {error}
        </p>
      )}
      {result ? (
        <button type="button" onClick={() => { setResult(null); setAnswers(quiz.questions.map(() => null)); }} className="inline-flex h-10 w-fit items-center rounded-md border border-rule px-4 text-sm font-medium">
          Try again
        </button>
      ) : (
        <button type="button" onClick={submit} disabled={!all || pending} className="inline-flex h-10 w-fit items-center rounded-md bg-ink px-4 text-sm font-medium text-paper disabled:opacity-50">
          {pending ? "Marking…" : "Submit answers"}
        </button>
      )}
    </section>
  );
}
