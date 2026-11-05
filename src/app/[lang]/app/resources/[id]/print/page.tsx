import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import type { PracticeSet, WritingTips } from "@/lib/tutor/resources/schema";
import { RESOURCE_COLUMNS, type ResourceRow } from "@/lib/tutor/resources/server";
import { requireTutor } from "@/lib/tutor/server";
import { Loading } from "../../../_components/shell";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Print" };

/**
 * Print view of an approved resource (spec §1): the student copy (questions and working space) or
 * the tutor copy (with answers and solutions). The browser's "Save as PDF" makes the PDF, so every
 * maths symbol prints as written.
 */
export default function PrintPage(props: PageProps<"/[lang]/app/resources/[id]/print">) {
  return (
    <Suspense fallback={<Loading />}>
      <Print {...props} />
    </Suspense>
  );
}

async function Print({ params, searchParams }: PageProps<"/[lang]/app/resources/[id]/print">) {
  const [, { id }, query] = await Promise.all([requireTutor(), params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: r } = await supabase.from("tutor_resources").select(RESOURCE_COLUMNS).eq("id", id).maybeSingle<ResourceRow>();
  if (!r || r.status !== "approved") notFound();
  const tutorCopy = query.copy === "tutor";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 bg-white px-6 py-8 text-[15px] text-black print:p-0" lang="en">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <p className="text-sm text-ink-soft">{tutorCopy ? "Tutor copy, with solutions" : "Student copy"}</p>
        <PrintButton />
      </div>
      <header className="border-b border-black pb-2">
        <h1 className="text-xl font-semibold">{r.title}</h1>
        <p className="text-sm">
          {r.framework === "vce" ? "VCE" : ""} {r.subject} · {r.unit_or_level}
          {r.kind === "practice_set" && !tutorCopy && <span className="float-right">Name: ________________________</span>}
        </p>
      </header>
      {r.kind === "practice_set" ? <SetPrint set={r.content as PracticeSet} tutorCopy={tutorCopy} /> : <TipsPrint tips={r.content as WritingTips} />}
    </main>
  );
}

function SetPrint({ set, tutorCopy }: { set: PracticeSet; tutorCopy: boolean }) {
  const total = set.questions.reduce((n, q) => n + q.marks, 0);
  return (
    <>
      <p className="text-sm">
        {set.instructions} Total: {total} marks.
      </p>
      <ol className="flex flex-col gap-6">
        {set.questions.map((q, i) => (
          <li key={i} className="break-inside-avoid">
            <p className="font-medium">
              {i + 1}. <span className="font-normal whitespace-pre-wrap">{q.prompt}</span> <span className="text-sm">({q.marks} {q.marks === 1 ? "mark" : "marks"})</span>
            </p>
            {q.options.length > 0 && (
              <ul className="mt-1 pl-6">
                {q.options.map((o, j) => (
                  <li key={j}>{o}</li>
                ))}
              </ul>
            )}
            {tutorCopy ? (
              <div className="mt-2 border-l-2 border-black pl-3 text-sm">
                <p>
                  <span className="font-semibold">Answer: </span>
                  {q.answer}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{q.solution}</p>
              </div>
            ) : (
              q.type !== "mcq" && <div className="mt-2 border-b border-dotted border-gray-400" style={{ height: `${Math.min(12, 2 + q.marks * 1.5)}rem` }} />
            )}
          </li>
        ))}
      </ol>
    </>
  );
}

function TipsPrint({ tips }: { tips: WritingTips }) {
  return (
    <>
      {tips.intro && <p>{tips.intro}</p>}
      {tips.sections.map((s, i) => (
        <section key={i} className="break-inside-avoid">
          <h2 className="mt-2 text-lg font-semibold">{s.heading}</h2>
          <ul className="list-disc pl-6">
            {s.tips.map((t, j) => (
              <li key={j}>{t}</li>
            ))}
          </ul>
          {s.example && <p className="mt-1 border-l-2 border-black pl-3 text-sm italic">{s.example}</p>}
        </section>
      ))}
      {tips.mistakes.length > 0 && (
        <section className="break-inside-avoid">
          <h2 className="mt-2 text-lg font-semibold">Common mistakes</h2>
          <ul className="list-disc pl-6">
            {tips.mistakes.map((m, j) => (
              <li key={j}>{m}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
