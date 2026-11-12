import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { aiAccess, assistantLeftToday, conversationMessages, ownConversation } from "@/lib/social/assistant-server";
import { requireSocialStudent } from "@/lib/social/server";
import { AssistantChat } from "../../../_social/assistant-chat";
import { Loading, Notice, StudentShell, secondaryBtn } from "../../../_social/shell";

export const metadata: Metadata = { title: "Ask EduMi AI" };

const ERRORS: Record<string, string> = {
  limit: "You've used today's EduMi AI questions. They reset at midnight.",
  service: "EduMi AI isn't answering right now. Try sending your question again in a minute.",
  shape: "That reply came back garbled. Try sending your question again.",
};

export default function ChatPage({ params, searchParams }: PageProps<"/[lang]/student/practice/ask/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Chat params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Chat({ params, searchParams }: Pick<PageProps<"/[lang]/student/practice/ask/[id]">, "params" | "searchParams">) {
  const [me, locale, { id }, query] = await Promise.all([requireSocialStudent(), getLocale(), params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const conversation = await ownConversation(me.profile.id, id);
  if (!conversation) notFound();
  const [messages, access, left] = await Promise.all([conversationMessages(id), aiAccess(me), assistantLeftToday(me.profile.id)]);
  const canSend = access.kind === "on";
  const context = [`Year ${conversation.year_level ?? me.student.year_level}`, conversation.subject, conversation.topic].filter(Boolean) as string[];

  return (
    <StudentShell me={me} title={conversation.title} current="practice" back={{ href: "/student/practice/ask", label: "Ask EduMi AI" }}>
      <div className="flex flex-wrap items-center gap-1.5">
        {context.map((c) => (
          <span key={c} className="rounded-full bg-[var(--tiles-sage-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--tiles-sage-ink)]">
            {c}
          </span>
        ))}
        {conversation.source === "quiz_mistake" && conversation.resource_id && (
          <Link href={localizePath(`/student/practice/${conversation.resource_id}`, locale)} className="text-xs text-ink-soft">
            From your quiz →
          </Link>
        )}
      </div>
      {!canSend && (
        <Notice>
          EduMi AI isn&apos;t on your plan any more, so this chat is read-only.{" "}
          <Link href={localizePath("/student/practice/ask", locale)} className="font-medium">
            See the add-on
          </Link>
        </Notice>
      )}
      <AssistantChat
        key={messages.length}
        conversationId={id}
        initial={messages}
        saved={Boolean(conversation.saved_at)}
        left={left}
        initialError={typeof query.error === "string" ? (ERRORS[query.error] ?? null) : null}
        canSend={canSend}
      />
      <Link href={localizePath("/student/practice/ask", locale)} className={`${secondaryBtn} w-fit no-underline`}>
        New chat
      </Link>
    </StudentShell>
  );
}
