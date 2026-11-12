"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { useFormStatus } from "react-dom";
import type { PublicQuiz } from "@/lib/social/resources";
import { submitQuiz, type QuizResult } from "./actions";
import { startMistakeChat } from "./assistant-actions";
import { RankUpCelebration } from "./rank-up";

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
        className="flex min-h-48 w-full max-w-xl items-center justify-center rounded-2xl border border-rule bg-sheet p-6 text-center text-lg shadow-sm"
        aria-label={flipped ? "Show the question" : "Show the answer"}
      >
        {flipped ? c.back : c.front}
      </button>
      <div className="flex items-center gap-4 text-sm">
        <button type="button" onClick={() => go(-1)} className="rounded-full border border-rule px-3 py-1.5">
          ← Back
        </button>
        <span className="font-mono">
          {i + 1} / {cards.length}
        </span>
        <button type="button" onClick={() => go(1)} className="rounded-full border border-rule px-3 py-1.5">
          Next →
        </button>
      </div>
      <p className="text-xs text-ink-faint">Tap the card to flip it.</p>
    </section>
  );
}

const LABELS = ["A", "B", "C", "D"];

type Result = Exclude<QuizResult, { error: string }>;

function tone(awarded: number, marks: number) {
  if (awarded >= marks) return "border-success text-success";
  if (awarded > 0) return "border-warning text-warning";
  return "border-pen text-pen";
}

/**
 * A quiz: multiple choice and free response, each worth marks. Everything is marked on the server
 * (free responses by AI against a rubric for the curriculum point); the key, model answers and
 * rubrics arrive only with the result. Points equal the marks earned (retakes pay the improvement).
 */
/** `ai`: with the EduMi AI add-on, marked questions offer "Help me understand my mistake"; without, a link to the add-on. */
type QuizProps = { resourceId: string; quiz: PublicQuiz; back?: { href: string; label: string } | null; ai?: { on: boolean; askHref: string } | null };
type Answers = (number | string | null)[];

const draftKey = (resourceId: string) => `edumi:quiz-draft:${resourceId}`;
const noStore = () => () => {};

/** Unsubmitted answers saved on this device, if they still fit this quiz. */
function parseDraft(raw: string | null, quiz: PublicQuiz): Answers | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length !== quiz.questions.length) return null;
    const ok = value.every((a, i) => {
      const q = quiz.questions[i];
      return q.type === "mcq"
        ? a === null || (Number.isInteger(a) && a >= 0 && a < q.options.length)
        : typeof a === "string" && a.length <= 1500;
    });
    return ok ? (value as Answers) : null;
  } catch {
    return null;
  }
}

function readDraft(resourceId: string): string | null {
  try {
    return window.localStorage.getItem(draftKey(resourceId));
  } catch {
    return null;
  }
}

function writeDraft(resourceId: string, answers: Answers | null) {
  try {
    const empty = !answers || answers.every((a) => a === null || a === "");
    if (empty) window.localStorage.removeItem(draftKey(resourceId));
    else window.localStorage.setItem(draftKey(resourceId), JSON.stringify(answers));
  } catch {
    // Private browsing or storage turned off: the quiz still works, just without a draft.
  }
}

/**
 * Unsubmitted answers are kept on this device (localStorage, one draft per quiz), so a refresh, a
 * phone reloading a background tab or an accidental Back doesn't lose them. The draft is read once,
 * right after hydration (the runner remounts then); it's cleared once the quiz is marked.
 */
export function QuizRunner(props: QuizProps) {
  // False while rendering on the server and hydrating, then true for good: the runner remounts once.
  const hydrated = useSyncExternalStore(noStore, () => true, () => false);
  return <QuizRunnerInner key={hydrated ? "client" : "server"} {...props} hydrated={hydrated} />;
}

function QuizRunnerInner({ resourceId, quiz, back = null, ai = null, hydrated }: QuizProps & { hydrated: boolean }) {
  const blank = () => quiz.questions.map((q) => (q.type === "mcq" ? null : "")) as Answers;
  const [draft] = useState(() => (hydrated ? parseDraft(readDraft(resourceId), quiz) : null));
  const [answers, setAnswers] = useState<Answers>(() => draft ?? blank());
  const restored = draft !== null;
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const totalMarks = quiz.questions.reduce((s, q) => s + q.marks, 0);
  const done = answers.filter((a, i) => (quiz.questions[i].type === "mcq" ? a !== null : String(a ?? "").trim())).length;
  const set = (i: number, v: number | string) => setAnswers((a) => a.map((x, j) => (j === i ? v : x)));

  // Keep the draft in step with the answers until the quiz is marked.
  // Not before hydration: that first render's blank answers would wipe the saved draft.
  useEffect(() => {
    if (hydrated && !result) writeDraft(resourceId, answers);
  }, [answers, hydrated, result, resourceId]);

  const submit = () =>
    start(async () => {
      const r = await submitQuiz(resourceId, answers);
      if ("error" in r) setError(r.error);
      else {
        writeDraft(resourceId, null);
        setError(null);
        setResult(r);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });

  return (
    <section aria-label="Quiz" className="flex flex-col gap-4">
      {/* After the marks are on screen, never during a submission. */}
      {result?.promotion && <RankUpCelebration key={result.promotion.id} promotion={result.promotion} />}
      {result ? (
        <div role="status" className="flex flex-wrap items-center gap-5 rounded-xl border border-ink bg-sheet p-5">
          <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full border-4 border-brand">
            <span className="text-xl font-semibold tabular-nums">{Math.round(result.pct)}%</span>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-2xl font-medium tabular-nums">
              {result.earned} / {result.total} marks
            </p>
            <p className="text-sm text-ink-soft">
              {result.points > 0
                ? `+${result.points} points`
                : "No new points: retakes pay only when you beat your best on this quiz."}
            </p>
          </div>
        </div>
      ) : (
        <div className="sticky top-0 z-[5] -mx-1 flex items-center justify-between gap-3 rounded-2xl border border-rule bg-sheet/95 px-3 py-2 text-sm backdrop-blur">
          <span>
            {done} of {quiz.questions.length} answered
            <span className="text-ink-soft"> · {restored ? "picked up where you left off" : "saved on this device"}</span>
          </span>
          <span className="font-mono text-ink-soft">{totalMarks} marks</span>
        </div>
      )}

      <ol className="flex flex-col gap-4">
        {quiz.questions.map((q, qi) => {
          const r = result?.results[qi];
          return (
            <li key={qi} className="flex flex-col gap-3 rounded-2xl border border-rule bg-sheet p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-mono text-ink-faint">
                  Q{qi + 1} · {q.type === "mcq" ? "Multiple choice" : "Free response"}
                </span>
                {r ? (
                  <span className={`rounded-full border px-2 py-0.5 font-mono font-semibold ${tone(r.awarded, r.marks)}`}>
                    {r.awarded} / {r.marks}
                  </span>
                ) : (
                  <span className="rounded-full border border-rule px-2 py-0.5 font-mono">
                    {q.marks} mark{q.marks === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              {q.point && <p className="w-fit rounded-md bg-brand-soft px-2 py-1 text-xs">Tests: {q.point}</p>}
              <p className="font-medium whitespace-pre-wrap">{q.prompt}</p>

              {q.type === "mcq" ? (
                <fieldset className="flex flex-col gap-2" disabled={Boolean(result)}>
                  <legend className="sr-only">Question {qi + 1}</legend>
                  {q.options.map((o, oi) => {
                    const chosen = answers[qi] === oi;
                    const cls = r
                      ? oi === r.answer
                        ? "border-success bg-paper"
                        : chosen
                          ? "border-pen"
                          : "border-rule opacity-70"
                      : chosen
                        ? "border-ink bg-paper"
                        : "border-rule hover:border-ink-soft";
                    return (
                      <label key={oi} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ${cls}`}>
                        <input type="radio" name={`q${qi}`} checked={chosen} onChange={() => set(qi, oi)} className="mt-0.5" />
                        <span>
                          <span className="mr-1.5 font-mono text-ink-faint">{LABELS[oi]}</span>
                          {o}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              ) : (
                <div className="flex flex-col gap-1">
                  <label htmlFor={`q${qi}-answer`} className="sr-only">
                    Your answer to question {qi + 1}
                  </label>
                  <textarea
                    id={`q${qi}-answer`}
                    value={String(answers[qi] ?? "")}
                    onChange={(e) => set(qi, e.target.value)}
                    disabled={Boolean(result)}
                    maxLength={1500}
                    rows={4}
                    placeholder="Write your answer. Show your working or reasoning: marks follow the rubric."
                    className="rounded-lg border border-rule bg-paper px-3 py-2 text-sm disabled:opacity-80"
                  />
                  {!result && <span className="self-end font-mono text-xs text-ink-faint">{String(answers[qi] ?? "").length}/1500</span>}
                </div>
              )}

              {r && (
                <div className="flex flex-col gap-2 rounded-lg bg-paper-deep p-3 text-sm">
                  <p>{r.feedback}</p>
                  {r.rubric && (
                    <ul className="flex flex-col gap-1">
                      {r.rubric.map((c) => {
                        const met = r.met.includes(c.criterion);
                        return (
                          <li key={c.criterion} className="flex gap-2">
                            <span aria-hidden className={met ? "text-success" : "text-ink-faint"}>
                              {met ? "✓" : "○"}
                            </span>
                            <span className={met ? "" : "text-ink-soft"}>
                              {c.criterion} <span className="font-mono text-xs text-ink-faint">({c.marks})</span>
                              <span className="sr-only">{met ? " met" : " not met"}</span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {r.modelAnswer && (
                    <details>
                      <summary className="cursor-pointer text-ink-soft">Model answer</summary>
                      <p className="mt-1 whitespace-pre-wrap">{r.modelAnswer}</p>
                    </details>
                  )}
                  {ai && r.awarded < r.marks && (
                    <div className="pt-1">
                      {ai.on ? (
                        <form action={startMistakeChat}>
                          <input type="hidden" name="resource" value={resourceId} />
                          <input type="hidden" name="question" value={qi} />
                          <MistakeButton />
                        </form>
                      ) : (
                        <Link href={ai.askHref} className="text-sm font-medium text-ink">
                          Get help with this from EduMi AI →
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              )}
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
        <div className="flex flex-wrap gap-2">
          {back && (
            <Link href={back.href} className="inline-flex h-10 w-fit items-center rounded-full bg-ink px-4 text-sm font-medium text-paper no-underline">
              {back.label} →
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setAnswers(blank());
              window.scrollTo({ top: 0 });
            }}
            className="inline-flex h-10 w-fit items-center rounded-full border border-rule px-4 text-sm font-medium"
          >
            Try again
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={submit}
          disabled={done < quiz.questions.length || pending}
          className="inline-flex h-11 w-fit items-center rounded-full bg-ink px-5 text-sm font-medium text-paper disabled:opacity-50"
        >
          {pending ? "Marking… free responses take a few seconds" : "Submit for marking"}
        </button>
      )}
    </section>
  );
}

function MistakeButton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="inline-flex h-8 items-center justify-center rounded-full border border-rule bg-sheet px-3 text-xs font-medium text-ink hover:bg-paper-deep disabled:opacity-50">
      {pending ? "Opening EduMi AI…" : "Help me understand my mistake"}
    </button>
  );
}
