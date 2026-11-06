import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { curriculumTitle, flashcardsSchema, KIND_LABEL, notesSchema, publicQuizSchema, type CurriculumRef, type ResourceKind } from "@/lib/social/resources";
import { requireSocialStudent } from "@/lib/social/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { completeResource, flagResource, regenerateResource } from "../../_social/actions";
import { Flashcards, QuizRunner } from "../../_social/practice-client";
import { GenerateButton } from "../../_social/generate-button";
import { Loading, Notice, StudentShell, card, smallBtn } from "../../_social/shell";
import { ShellTimer } from "../../_social/shell-timer";

export const metadata: Metadata = { title: "Practice" };

export default function ResourcePage({ params, searchParams }: PageProps<"/[lang]/student/practice/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Resource params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Resource({ params, searchParams }: Pick<PageProps<"/[lang]/student/practice/[id]">, "params" | "searchParams">) {
  const [me, { id }, query] = await Promise.all([requireSocialStudent(), params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const admin = createAdminClient();
  const { data: r } = await admin
    .from("student_resources")
    .select("id, kind, title, content, version, completed_at, flagged_at, scored_eligible")
    .eq("id", id)
    .eq("profile_id", me.profile.id)
    .maybeSingle<{ id: string; kind: ResourceKind; title: string; content: unknown; version: number; completed_at: string | null; flagged_at: string | null; scored_eligible: boolean }>();
  if (!r) notFound();
  const { data: attempts } = await admin.from("resource_attempts").select("correct, total, score_pct, submitted_at").eq("resource_id", id).order("submitted_at", { ascending: false }).limit(5);
  const curriculum = ((r.content as { curriculum?: CurriculumRef | null }).curriculum ?? null) as CurriculumRef | null;
  const error = query.error === "limit" ? "You've used today's allowance for that kind." : query.error ? "That didn't work. Try again." : null;

  return (
    <StudentShell me={me} title={r.title} current="practice" back={{ href: "/student/practice", label: "Practice" }}>
      <ShellTimer me={me} />
      {error && <Notice tone="error">{error}</Notice>}
      <p className="text-sm text-ink-soft">
        {KIND_LABEL[r.kind]}
        {r.version > 1 ? ` · version ${r.version}` : ""}
        {curriculum ? ` · ${curriculumTitle(curriculum)}` : ""}
      </p>

      {r.kind === "notes" &&
        (() => {
          const n = notesSchema.parse(r.content);
          return (
            <article className={`${card} flex flex-col gap-4`}>
              <p>{n.summary}</p>
              {n.sections.map((s) => (
                <section key={s.heading}>
                  <h2 className="mb-1 font-medium">{s.heading}</h2>
                  <ul className="list-disc pl-5 text-sm">
                    {s.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </article>
          );
        })()}
      {r.kind === "flashcards" && <Flashcards cards={flashcardsSchema.parse(r.content).cards} />}
      {r.kind === "quiz" && <QuizRunner resourceId={r.id} quiz={publicQuizSchema.parse(r.content)} />}

      {r.kind !== "quiz" &&
        (r.completed_at ? (
          <Notice tone="ok">Marked done.</Notice>
        ) : (
          <form action={completeResource.bind(null, r.id)}>
            <button className="inline-flex h-10 items-center rounded-md bg-ink px-4 text-sm font-medium text-paper">I&apos;ve studied this</button>
          </form>
        ))}

      {attempts && attempts.length > 0 && (
        <p className="text-sm text-ink-soft">Your attempts: {attempts.map((a) => `${a.correct}/${a.total}`).join(", ")}</p>
      )}

      <div className="flex flex-wrap gap-3">
        <form action={regenerateResource.bind(null, r.id)}>
          <GenerateButton label="Make a new version" />
        </form>
      </div>

      <details className={`${card} text-sm`}>
        <summary className="cursor-pointer font-medium">{r.flagged_at ? "Flagged. Thanks for telling us." : "Something wrong? Flag it"}</summary>
        {!r.flagged_at && (
          <form action={flagResource.bind(null, r.id)} className="mt-3 flex flex-col gap-2">
            <textarea name="reason" maxLength={300} rows={2} placeholder="Which question or card, and what's wrong?" className="rounded-md border border-rule bg-paper px-3 py-2" />
            <button className={smallBtn}>Send flag</button>
          </form>
        )}
      </details>
    </StudentShell>
  );
}
