import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { DAILY_LIMITS, KIND_LABEL, QUIZ_QUESTIONS, type ResourceKind } from "@/lib/social/resources";
import { requireSocialStudent } from "@/lib/social/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dateKeyOf, formatInZone } from "@/lib/time";
import { generateResource } from "../_social/actions";
import { GenerateButton } from "../_social/generate-button";
import { Loading, Notice, StudentShell, card } from "../_social/shell";
import { ShellTimer } from "../_social/shell-timer";

export const metadata: Metadata = { title: "Practice" };

const ERRORS: Record<string, string> = {
  limit: "You've used today's allowance for that kind. It resets at midnight.",
  input: "Give a topic of at least two characters.",
  shape: "That came back incomplete. Try again.",
  service: "The AI service isn't answering right now. Try again in a minute.",
};

export default function PracticePage({ searchParams }: PageProps<"/[lang]/student/practice">) {
  return (
    <Suspense fallback={<Loading />}>
      <Practice searchParams={searchParams} />
    </Suspense>
  );
}

async function Practice({ searchParams }: Pick<PageProps<"/[lang]/student/practice">, "searchParams">) {
  const [me, locale, query] = await Promise.all([requireSocialStudent(), getLocale(), searchParams]);
  const { data } = await createAdminClient()
    .from("student_resources")
    .select("id, kind, title, version, completed_at, created_at")
    .eq("profile_id", me.profile.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as { id: string; kind: ResourceKind; title: string; version: number; completed_at: string | null; created_at: string }[];
  const today = dateKeyOf();
  const todays = rows.filter((r) => dateKeyOf(r.created_at) === today);
  const quizLeft = Math.max(0, DAILY_LIMITS.quiz - todays.filter((r) => r.kind === "quiz").length);
  const studyLeft = Math.max(0, DAILY_LIMITS.study - todays.filter((r) => r.kind !== "quiz").length);
  const error = typeof query.error === "string" ? ERRORS[query.error] : null;

  return (
    <StudentShell me={me} title="Practice" current="practice">
      <ShellTimer me={me} />
      {error && <Notice tone="error">{error}</Notice>}
      <form action={generateResource} className={`${card} flex flex-col gap-3`}>
        <h2 className="font-medium">Make something to study</h2>
        <fieldset className="flex flex-wrap gap-2 text-sm">
          <legend className="sr-only">Type</legend>
          {(["quiz", "flashcards", "notes"] as const).map((k, i) => (
            <label key={k} className="flex items-center gap-2 rounded-md border border-rule px-3 py-2 has-[:checked]:border-ink">
              <input type="radio" name="kind" value={k} defaultChecked={i === 0} /> {KIND_LABEL[k]}
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1 text-sm">
          Topic
          <input name="topic" required minLength={2} maxLength={200} placeholder="e.g. Year 10 quadratics, factorising" className="h-10 rounded-md border border-rule bg-paper px-3" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Your notes (optional)
          <textarea name="notes" maxLength={6000} rows={5} placeholder="Paste your class notes and Edumi will work from them." className="rounded-md border border-rule bg-paper px-3 py-2" />
        </label>
        <GenerateButton />
        <p className="text-xs text-ink-faint">
          Today: {quizLeft} of {DAILY_LIMITS.quiz} practice quizzes ({QUIZ_QUESTIONS} questions each) and {studyLeft} of {DAILY_LIMITS.study} notes or flashcard sets left. AI can make mistakes:
          flag anything that looks wrong.
        </p>
      </form>

      {rows.length > 0 && (
        <section className={`${card} flex flex-col gap-2`}>
          <h2 className="font-medium">Your practice</h2>
          <ul className="divide-y divide-rule text-sm">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={localizePath(`/student/practice/${r.id}`, locale)} className="flex items-center justify-between gap-2 py-2 text-ink no-underline hover:underline">
                  <span>
                    {r.title}
                    {r.version > 1 && <span className="ml-1 text-xs text-ink-faint">v{r.version}</span>}
                    <span className="block text-xs text-ink-faint">
                      {KIND_LABEL[r.kind]} · {formatInZone(r.created_at, "d MMM")}
                    </span>
                  </span>
                  {r.completed_at && <span className="text-xs text-ink-soft">Done</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </StudentShell>
  );
}
