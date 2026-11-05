import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { needsAnswerCheck } from "@/lib/tutor/resources/prompt";
import { QUESTION_TYPE_LABELS, unresolvedFlags, type PracticeSet, type WritingTips } from "@/lib/tutor/resources/schema";
import { RESOURCE_COLUMNS, type ResourceRow } from "@/lib/tutor/resources/server";
import { requireTutor } from "@/lib/tutor/server";
import { Loading, Notice, TutorShell, appHref, field, labelClass, primaryButton, secondaryButton } from "../../_components/shell";
import { tertiaryButton } from "../../_components/styles";
import {
  approveResource,
  deleteQuestion,
  deleteResource,
  dismissFlag,
  moveQuestion,
  recheckAnswers,
  regenerateQuestion,
  renameResource,
  saveQuestion,
  saveTips,
} from "../actions";
import { GenerateButton } from "../submit-button";

export const metadata: Metadata = { title: "Resource" };
export const maxDuration = 120;

const ERRORS: Record<string, string> = {
  flags: "Deal with every flagged answer first: edit the question or dismiss the flag.",
  service: "The AI service didn't respond. Try again in a minute.",
  shape: "The AI draft came back incomplete. Try again.",
};

export default function ResourcePage(props: PageProps<"/[lang]/app/resources/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Resource {...props} />
    </Suspense>
  );
}

async function Resource({ params, searchParams }: PageProps<"/[lang]/app/resources/[id]">) {
  const [me, locale, { id }, query] = await Promise.all([requireTutor(), getLocale(), params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: r } = await supabase.from("tutor_resources").select(RESOURCE_COLUMNS).eq("id", id).maybeSingle<ResourceRow>();
  if (!r) notFound();
  const { data: points } = await supabase.from("curriculum_points").select("id, area, summary").in("id", r.point_ids).order("sort");
  const error = typeof query.error === "string" ? ERRORS[query.error] : null;
  const approved = r.status === "approved";
  const flags = r.kind === "practice_set" ? unresolvedFlags(r.content as PracticeSet) : 0;

  return (
    <TutorShell tutor={me} title={r.title} current="resources" back={{ href: "/app/resources", label: "Resources" }}>
      {error && <Notice tone="error">{error}</Notice>}
      {query.saved && <Notice>Saved.</Notice>}

      <section className="dash-card flex flex-col gap-3 p-4 text-sm" data-testid="resource-status">
        <p>
          <span className={approved ? "font-medium text-[var(--dash-accent-text)]" : "font-medium text-pen"}>
            {approved ? "Approved" : "AI draft: check every question before using it."}
          </span>{" "}
          {r.framework === "vce" ? "VCE" : ""} {r.subject} · {r.unit_or_level}
        </p>
        <details>
          <summary className="cursor-pointer text-ink-soft">Curriculum points ({points?.length ?? 0})</summary>
          <ol className="mt-2 list-decimal pl-5 text-ink-soft">
            {(points ?? []).map((p) => (
              <li key={p.id}>
                {p.area}: {p.summary}
              </li>
            ))}
          </ol>
        </details>
        <div className="flex flex-wrap gap-2">
          {approved ? (
            <>
              <Link href={appHref(`/app/resources/${r.id}/print?copy=student`, locale)} className={primaryButton} target="_blank">
                {r.kind === "writing_tips" ? "Print / save as PDF" : "Student copy (print / PDF)"}
              </Link>
              {r.kind === "practice_set" && (
                <Link href={appHref(`/app/resources/${r.id}/print?copy=tutor`, locale)} className={secondaryButton} target="_blank">
                  Tutor copy with solutions
                </Link>
              )}
            </>
          ) : (
            <form action={approveResource}>
              <input type="hidden" name="id" value={r.id} />
              <button type="submit" className={primaryButton} disabled={flags > 0}>
                {flags > 0 ? `${flags} flagged ${flags === 1 ? "answer" : "answers"} to check first` : "Approve"}
              </button>
            </form>
          )}
          {r.kind === "practice_set" && needsAnswerCheck(r.subject) && (
            <form action={recheckAnswers}>
              <input type="hidden" name="id" value={r.id} />
              <GenerateButton className={tertiaryButton} label="Re-check answers" pendingLabel="Checking…" />
            </form>
          )}
        </div>
        <details>
          <summary className="cursor-pointer text-ink-soft">Rename or delete</summary>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <form action={renameResource} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={r.id} />
              <label className={labelClass}>
                Title
                <input name="title" defaultValue={r.title} maxLength={120} className={field} />
              </label>
              <button type="submit" className={secondaryButton}>
                Rename
              </button>
            </form>
            <form action={deleteResource}>
              <input type="hidden" name="id" value={r.id} />
              <button type="submit" className={tertiaryButton}>
                Delete
              </button>
            </form>
          </div>
        </details>
      </section>

      {r.kind === "practice_set" ? <SetEditor id={r.id} set={r.content as PracticeSet} /> : <TipsEditor id={r.id} tips={r.content as WritingTips} />}
    </TutorShell>
  );
}

function SetEditor({ id, set }: { id: string; set: PracticeSet }) {
  return (
    <>
      {set.instructions && <p className="text-sm text-ink-soft">{set.instructions}</p>}
      <ol className="flex flex-col gap-3" data-testid="questions">
        {set.questions.map((q, i) => (
          <li key={i} className={`dash-card flex flex-col gap-2 p-4 text-sm ${q.flag ? "border-pen" : ""}`} data-testid="question">
            <p className="font-mono text-xs text-ink-soft">
              Question {i + 1} · {QUESTION_TYPE_LABELS[q.type]} · {q.marks} {q.marks === 1 ? "mark" : "marks"}
            </p>
            {q.flag && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-pen px-3 py-2 text-pen">
                <span>Check this answer: {q.flag}</span>
                <form action={dismissFlag}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="index" value={i} />
                  <button type="submit" className="text-xs underline underline-offset-4">
                    It&apos;s right, dismiss
                  </button>
                </form>
              </div>
            )}
            <p className="whitespace-pre-wrap">{q.prompt}</p>
            {q.options.length > 0 && (
              <ul className="pl-4">
                {q.options.map((o, j) => (
                  <li key={j}>{o}</li>
                ))}
              </ul>
            )}
            <details>
              <summary className="cursor-pointer text-ink-soft">Answer and solution</summary>
              <p className="mt-2">
                <span className="font-medium">Answer: </span>
                {q.answer}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-ink-soft">{q.solution}</p>
            </details>
            <details>
              <summary className="cursor-pointer text-ink-soft">Edit</summary>
              <form action={saveQuestion} className="mt-2 flex flex-col gap-2" aria-label={`Edit question ${i + 1}`}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="index" value={i} />
                <label className={labelClass}>
                  Question
                  <textarea name="prompt" defaultValue={q.prompt} rows={3} className={field} />
                </label>
                {q.type === "mcq" ? (
                  <label className={labelClass}>
                    Options (one per line)
                    <textarea name="options" defaultValue={q.options.join("\n")} rows={4} className={field} />
                  </label>
                ) : (
                  <input type="hidden" name="options" value="" />
                )}
                <label className={labelClass}>
                  Answer
                  <input name="answer" defaultValue={q.answer} className={field} />
                </label>
                <label className={labelClass}>
                  Worked solution
                  <textarea name="solution" defaultValue={q.solution} rows={4} className={field} />
                </label>
                <label className={labelClass}>
                  Marks
                  <input type="number" name="marks" min={1} max={10} defaultValue={q.marks} className={`${field} w-24`} />
                </label>
                <button type="submit" className={secondaryButton}>
                  Save question
                </button>
              </form>
            </details>
            <div className="flex flex-wrap gap-3 text-xs text-ink-soft">
              {(
                [
                  [moveQuestion, "Move up", { dir: "up" }, i === 0],
                  [moveQuestion, "Move down", { dir: "down" }, i === set.questions.length - 1],
                  [deleteQuestion, "Delete", {}, set.questions.length === 1],
                ] as const
              ).map(([action, label, extra, hidden]) =>
                hidden ? null : (
                  <form key={label} action={action}>
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="index" value={i} />
                    {Object.entries(extra).map(([k, v]) => (
                      <input key={k} type="hidden" name={k} value={v} />
                    ))}
                    <button type="submit" className="underline underline-offset-4 hover:text-ink">
                      {label}
                    </button>
                  </form>
                ),
              )}
              <form action={regenerateQuestion}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="index" value={i} />
                <GenerateButton className="underline underline-offset-4 hover:text-ink" label="New version" pendingLabel="Drafting…" />
              </form>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

function TipsEditor({ id, tips }: { id: string; tips: WritingTips }) {
  return (
    <form action={saveTips} className="flex flex-col gap-4" data-testid="tips-editor">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="sections" value={tips.sections.length} />
      <label className={labelClass}>
        Introduction
        <textarea name="intro" defaultValue={tips.intro} rows={3} className={field} />
      </label>
      {tips.sections.map((s, i) => (
        <fieldset key={i} className="dash-card flex flex-col gap-2 p-4">
          <label className={labelClass}>
            Heading
            <input name={`heading-${i}`} defaultValue={s.heading} className={field} />
          </label>
          <label className={labelClass}>
            Tips (one per line)
            <textarea name={`tips-${i}`} defaultValue={s.tips.join("\n")} rows={Math.max(3, s.tips.length + 1)} className={field} />
          </label>
          <label className={labelClass}>
            Example (optional)
            <textarea name={`example-${i}`} defaultValue={s.example} rows={2} className={field} />
          </label>
        </fieldset>
      ))}
      <label className={labelClass}>
        Common mistakes (one per line)
        <textarea name="mistakes" defaultValue={tips.mistakes.join("\n")} rows={4} className={field} />
      </label>
      <button type="submit" className={secondaryButton}>
        Save changes
      </button>
    </form>
  );
}
