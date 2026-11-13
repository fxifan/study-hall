import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MathTextarea } from "@/components/math-keyboard";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { plainMath } from "@/lib/math-input";
import { ASSISTANT_DAILY_LIMIT, MAX_STUDENT_MESSAGE } from "@/lib/social/assistant";
import { aiAccess, assistantLeftToday } from "@/lib/social/assistant-server";
import { requireSocialStudent } from "@/lib/social/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatInZone } from "@/lib/time";
import { AiAddonOffer } from "../../_social/ai-addon-offer";
import { startChat } from "../../_social/assistant-actions";
import { GenerateButton } from "../../_social/generate-button";
import { Loading, Notice, StudentShell, card } from "../../_social/shell";

export const metadata: Metadata = { title: "Ask EduMi AI" };

const SUGGESTIONS = ["I don't get why you change the sign when solving an equation.", "Can you explain how photosynthesis works?", "How do I structure a persuasive essay?"];

export default function AskPage({ searchParams }: PageProps<"/[lang]/student/practice/ask">) {
  return (
    <Suspense fallback={<Loading />}>
      <Ask searchParams={searchParams} />
    </Suspense>
  );
}

async function Ask({ searchParams }: Pick<PageProps<"/[lang]/student/practice/ask">, "searchParams">) {
  const [me, locale, query] = await Promise.all([requireSocialStudent(), getLocale(), searchParams]);
  const href = (p: string) => localizePath(p, locale);
  const access = await aiAccess(me);
  const prefill = typeof query.q === "string" ? query.q.slice(0, MAX_STUDENT_MESSAGE) : "";
  const notice =
    query.addon === "added" ? (
      <Notice tone="ok">EduMi AI is on. Ask away.</Notice>
    ) : query.error === "addon" ? (
      <Notice tone="error">EduMi AI couldn&apos;t be added. Nothing was charged. Try again, or check your plan.</Notice>
    ) : query.error === "input" ? (
      <Notice tone="error">Write a question first.</Notice>
    ) : null;

  if (access.kind !== "on") {
    return (
      <StudentShell me={me} title="Ask EduMi AI" current="practice" back={{ href: "/student/practice", label: "Practice" }}>
        {notice}
        <AiAddonOffer access={access} back="ask" planHref={href("/student/plan")} />
      </StudentShell>
    );
  }

  const [left, { data: recent }] = await Promise.all([
    assistantLeftToday(me.profile.id),
    createAdminClient().from("ai_conversations").select("id, title, source, updated_at").eq("profile_id", me.profile.id).order("updated_at", { ascending: false }).limit(10),
  ]);

  return (
    <StudentShell me={me} title="Ask EduMi AI" current="practice" back={{ href: "/student/practice", label: "Practice" }}>
      {notice}
      <section className="flex flex-col gap-3 rounded-2xl bg-[var(--tiles-sage-soft)] p-5 text-[var(--tiles-sage-ink)]">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-ink">What are you stuck on?</h2>
          <p className="text-sm">EduMi AI explains it at Year {me.student.year_level} level, then gives you one to try. Hints come before answers.</p>
        </div>
        <form action={startChat} className="flex flex-col gap-3">
          <label htmlFor="ask-message" className="sr-only">
            Your question
          </label>
          <MathTextarea
            id="ask-message"
            name="message"
            required
            maxLength={MAX_STUDENT_MESSAGE}
            rows={3}
            defaultValue={prefill}
            autoCapitalize="off"
            placeholder="e.g. why do you change the sign when you move a number across?"
            className="rounded-2xl border border-transparent bg-sheet px-4 py-3 text-sm text-ink"
          />
          <details className="text-sm">
            <summary className="cursor-pointer">Add a subject or topic (optional)</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-ink">
                Subject
                <input name="subject" maxLength={80} placeholder="e.g. Mathematics" className="h-10 rounded-md border border-rule bg-sheet px-3" />
              </label>
              <label className="flex flex-col gap-1 text-ink">
                Topic
                <input name="topic" maxLength={120} placeholder="e.g. Linear equations" className="h-10 rounded-md border border-rule bg-sheet px-3" />
              </label>
            </div>
          </details>
          <div className="flex flex-wrap items-center gap-3">
            <GenerateButton label="Ask" disabled={left <= 0} />
            {left <= 0 && <span className="text-sm">You&apos;ve used today&apos;s questions. They reset at midnight.</span>}
          </div>
        </form>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <form key={s} action={startChat}>
              <input type="hidden" name="message" value={s} />
              <button className="inline-flex min-h-8 items-center rounded-full bg-sheet px-3 text-left text-xs font-medium text-ink hover:bg-paper-deep disabled:opacity-50" disabled={left <= 0}>
                {s}
              </button>
            </form>
          ))}
        </div>
      </section>
      <p className="-mt-2 text-xs text-ink-faint">
        Today: {left} of {ASSISTANT_DAILY_LIMIT} questions left. Your chats are private: parents, tutors and supervisors can&apos;t see them. EduMi AI won&apos;t write work you hand in, but
        it will teach you how. AI can make mistakes: flag anything that looks wrong.
      </p>

      {recent && recent.length > 0 && (
        <section className={`${card} flex flex-col gap-2`}>
          <h2 className="font-medium">Recent chats</h2>
          <ul className="divide-y divide-rule text-sm">
            {recent.map((c) => (
              <li key={c.id as string}>
                <Link href={href(`/student/practice/ask/${c.id}`)} className="flex items-center justify-between gap-2 py-2 text-ink no-underline hover:underline">
                  <span>
                    {plainMath(c.title as string)}
                    <span className="block text-xs text-ink-faint">
                      {c.source === "quiz_mistake" ? "Quiz mistake" : "Chat"} · {formatInZone(c.updated_at as string, "d MMM")}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </StudentShell>
  );
}
