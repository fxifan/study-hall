import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { plainMath } from "@/lib/math-input";
import { ASSISTANT_DAILY_LIMIT } from "@/lib/social/assistant";
import { aiAccess, assistantLeftToday } from "@/lib/social/assistant-server";
import { DAILY_LIMITS, KIND_LABEL, QUIZ_QUESTIONS, type CurriculumPoint, type ResourceKind } from "@/lib/social/resources";
import { cameFromGroup, requireSocialStudent } from "@/lib/social/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dateKeyOf, formatInZone } from "@/lib/time";
import { PracticeForm } from "../_social/practice-form";
import { Loading, Notice, StudentShell, card } from "../_social/shell";
import { ShellTimer } from "../_social/shell-timer";

export const metadata: Metadata = { title: "Practice" };

const ERRORS: Record<string, string> = {
  limit: "You've used today's allowance for that kind. It resets at midnight.",
  input: "Pick at least one learning point, or give a topic of at least two characters.",
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
  const resources = (data ?? []) as { id: string; kind: ResourceKind; title: string; version: number; completed_at: string | null; created_at: string }[];
  const [ai, askLeft, { data: savedChats }] = await Promise.all([
    aiAccess(me),
    assistantLeftToday(me.profile.id),
    createAdminClient().from("ai_conversations").select("id, title, saved_at").eq("profile_id", me.profile.id).not("saved_at", "is", null).order("saved_at", { ascending: false }).limit(20),
  ]);
  // Chats saved from EduMi AI are listed with the quizzes, notes and flashcards, newest first.
  type Row = { id: string; href: string; title: string; label: string; version: number; done: boolean; at: string };
  const list: Row[] = [
    ...resources.map((r) => ({ id: r.id, href: `/student/practice/${r.id}`, title: r.title, label: KIND_LABEL[r.kind], version: r.version, done: Boolean(r.completed_at), at: r.created_at })),
    ...(savedChats ?? []).map((c) => ({ id: c.id as string, href: `/student/practice/ask/${c.id}`, title: plainMath(c.title as string), label: "EduMi AI chat", version: 1, done: false, at: c.saved_at as string })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const today = dateKeyOf();
  const todays = resources.filter((r) => dateKeyOf(r.created_at) === today);
  const quizLeft = Math.max(0, DAILY_LIMITS.quiz - todays.filter((r) => r.kind === "quiz").length);
  const studyLeft = Math.max(0, DAILY_LIMITS.study - todays.filter((r) => r.kind !== "quiz").length);
  const error = typeof query.error === "string" ? ERRORS[query.error] : null;
  const from = await cameFromGroup(query.group, me.profile.id);
  const { data: cp } = await createAdminClient()
    .from("curriculum_points")
    .select("id, framework, subject, unit_or_level, area, summary, sort")
    .eq("is_published", true)
    .order("framework")
    .order("subject")
    .order("unit_or_level")
    .order("sort");
  const points: CurriculumPoint[] = (cp ?? []).map((p) => ({ id: p.id, framework: p.framework, subject: p.subject, level: p.unit_or_level, area: p.area, summary: p.summary }));
  // Years 7–10 start on their Victorian Curriculum level; Years 11–12 on VCE; uni students on their own topic.
  const y = me.student.year_level;
  const defaultGroup = y <= 10 ? (points.find((p) => p.framework === "vc" && p.level === `Year ${y}`) ?? null) : y <= 12 ? (points.find((p) => p.framework === "vce") ?? null) : null;

  return (
    <StudentShell me={me} title="Practice" current="practice" back={from ? { href: `/student/groups/${from.id}`, label: `Back to ${from.name}` } : undefined}>
      <ShellTimer me={me} />
      {error && <Notice tone="error">{error}</Notice>}
      <Link
        href={localizePath("/student/practice/ask", locale)}
        className={`${card} flex items-center justify-between gap-3 py-4 text-ink no-underline hover:border-ink`}
        data-testid="ask-entry"
      >
        <span className="flex items-center gap-3">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[var(--tiles-sage-strong)] font-[family-name:var(--font-manrope)] font-extrabold text-paper">
            e
          </span>
          <span className="flex flex-col">
            <span className="font-medium">Ask EduMi AI</span>
            <span className="text-sm text-ink-soft">{ai.kind === "on" ? "Get something explained step by step, then try it yourself" : "Add-on: a study assistant that explains, then lets you try"}</span>
          </span>
        </span>
        <span className="shrink-0 text-sm font-medium">Open →</span>
      </Link>
      <PracticeForm points={points} fromGroup={from?.id ?? null} defaultGroup={defaultGroup ? `${defaultGroup.framework}|${defaultGroup.subject}|${defaultGroup.level}` : null} />
      <p className="-mt-2 text-xs text-ink-faint">
        Today: {quizLeft} of {DAILY_LIMITS.quiz} quizzes ({QUIZ_QUESTIONS} questions each) and {studyLeft} of {DAILY_LIMITS.study} notes or flashcard sets left
        {ai.kind === "on" ? `, and ${askLeft} of ${ASSISTANT_DAILY_LIMIT} questions to EduMi AI` : ""}. Quizzes pay
        the marks you earn as points. AI can make mistakes: flag anything that looks wrong.
      </p>

      {list.length > 0 && (
        <section className={`${card} flex flex-col gap-2`}>
          <h2 className="font-medium">Your practice</h2>
          <ul className="divide-y divide-rule text-sm">
            {list.map((r) => (
              <li key={r.id}>
                <Link href={localizePath(r.href, locale)} className="flex items-center justify-between gap-2 py-2 text-ink no-underline hover:underline">
                  <span>
                    {r.title}
                    {r.version > 1 && <span className="ml-1 text-xs text-ink-faint">v{r.version}</span>}
                    <span className="block text-xs text-ink-faint">
                      {r.label} · {formatInZone(r.at, "d MMM")}
                    </span>
                  </span>
                  {r.done && <span className="text-xs text-ink-soft">Done</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </StudentShell>
  );
}
