"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, localizePath } from "@/i18n/config";
import { track } from "@/lib/events";
import { conversationTitle, MAX_STUDENT_MESSAGE } from "@/lib/social/assistant";
import { aiAccess, assistantLeftToday, mistakeContext, ownConversation, sendTurn, type ChatMessage } from "@/lib/social/assistant-server";
import { AddonError, addAiAddon, removeAiAddon } from "@/lib/social/billing";
import { socialActor, type SocialStudent } from "@/lib/social/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function href(path: string) {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return localizePath(path, isLocale(v) ? v : DEFAULT_LOCALE);
}

const message = z.string().trim().min(1).max(MAX_STUDENT_MESSAGE);
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

/** A student with the EduMi AI add-on; anyone else goes to the Ask page, which offers it. */
async function aiActor(): Promise<SocialStudent> {
  const me = await socialActor();
  if ((await aiAccess(me)).kind !== "on") redirect(await href("/student/practice/ask"));
  return me;
}

async function newConversation(
  me: SocialStudent,
  fields: { title: string; subject: string | null; topic: string | null; source: "ask" | "quiz_mistake" | "task"; resource_id?: string; question_index?: number },
): Promise<string> {
  const { data, error } = await createAdminClient()
    .from("ai_conversations")
    .insert({ profile_id: me.profile.id, year_level: me.student.year_level, ...fields })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Start a chat from the Ask page, the Home tile or a task: ask the first question, then open it. */
export async function startChat(formData: FormData) {
  const me = await aiActor();
  const parsed = z
    .object({ message, subject: optional(80), topic: optional(120), source: z.enum(["ask", "task"]).catch("ask") })
    .safeParse({ message: formData.get("message"), subject: formData.get("subject") ?? "", topic: formData.get("topic") ?? "", source: formData.get("source") ?? "ask" });
  if (!parsed.success) redirect(await href("/student/practice/ask?error=input"));
  const { message: text, ...rest } = parsed.data;
  const id = await newConversation(me, { title: conversationTitle(text), ...rest });
  const out = await sendTurn(me, (await ownConversation(me.profile.id, id))!, text);
  await track({ name: "ai_chat_started", product: "platform", role: "student", userId: me.profile.id, props: { source: rest.source } });
  redirect(await href(`/student/practice/ask/${id}${out.ok ? "" : `?error=${out.error}`}`));
}

/** "Help me understand my mistake" on a marked quiz question. */
export async function startMistakeChat(formData: FormData) {
  const me = await aiActor();
  const parsed = z.object({ resource: z.uuid(), question: z.coerce.number().int().min(0).max(19) }).safeParse({ resource: formData.get("resource"), question: formData.get("question") });
  if (!parsed.success) redirect(await href("/student/practice"));
  const found = await mistakeContext(me.profile.id, parsed.data.resource, parsed.data.question);
  if (!found) redirect(await href(`/student/practice/${parsed.data.resource}`));
  const id = await newConversation(me, {
    title: found.title.slice(0, 120),
    subject: found.subject,
    topic: null,
    source: "quiz_mistake",
    resource_id: parsed.data.resource,
    question_index: parsed.data.question,
  });
  const out = await sendTurn(me, (await ownConversation(me.profile.id, id))!, `Help me understand my mistake on question ${parsed.data.question + 1}.`);
  await track({ name: "ai_chat_started", product: "platform", role: "student", userId: me.profile.id, props: { source: "quiz_mistake" } });
  redirect(await href(`/student/practice/ask/${id}${out.ok ? "" : `?error=${out.error}`}`));
}

export type SendChatResult = { ok: true; reply: ChatMessage; left: number } | { ok: false; error: string; left: number };

const SEND_ERRORS = {
  limit: "You've used today's EduMi AI questions. They reset at midnight.",
  service: "EduMi AI isn't answering right now. Try again in a minute.",
  shape: "That reply came back garbled. Try again.",
  input: `Write a message of up to ${MAX_STUDENT_MESSAGE} characters.`,
  access: "EduMi AI isn't on your plan.",
};

export async function sendChatMessage(conversationId: string, text: string): Promise<SendChatResult> {
  const me = await socialActor();
  const left = () => assistantLeftToday(me.profile.id);
  if ((await aiAccess(me)).kind !== "on") return { ok: false, error: SEND_ERRORS.access, left: 0 };
  const parsed = message.safeParse(text);
  const conversation = z.uuid().safeParse(conversationId).success ? await ownConversation(me.profile.id, conversationId) : null;
  if (!parsed.success || !conversation) return { ok: false, error: SEND_ERRORS.input, left: await left() };
  const out = await sendTurn(me, conversation, parsed.data);
  if (!out.ok) return { ok: false, error: SEND_ERRORS[out.error], left: await left() };
  return { ok: true, reply: out.message, left: await left() };
}

/** A message in one of the student's own conversations, or null. */
async function ownMessage(profileId: string, messageId: string): Promise<{ id: string; conversation_id: string } | null> {
  if (!z.uuid().safeParse(messageId).success) return null;
  const admin = createAdminClient();
  const { data: m } = await admin.from("ai_messages").select("id, conversation_id, role").eq("id", messageId).maybeSingle();
  if (!m || m.role !== "assistant") return null;
  return (await ownConversation(profileId, m.conversation_id as string)) ? { id: m.id as string, conversation_id: m.conversation_id as string } : null;
}

export async function rateMessage(messageId: string, value: -1 | 1 | null): Promise<void> {
  const me = await socialActor({ paid: false });
  if (value !== null && value !== 1 && value !== -1) return;
  const m = await ownMessage(me.profile.id, messageId);
  if (!m) return;
  await createAdminClient().from("ai_messages").update({ feedback: value }).eq("id", m.id);
  if (value) await track({ name: "ai_reply_rated", product: "platform", role: "student", userId: me.profile.id, props: { status: value === 1 ? "helpful" : "unhelpful" } });
}

const FLAG_REASONS = ["wrong", "unclear", "level", "inappropriate"] as const;

export async function flagMessage(messageId: string, reason: string, note: string): Promise<void> {
  const me = await socialActor({ paid: false });
  const m = await ownMessage(me.profile.id, messageId);
  if (!m) return;
  const why = (FLAG_REASONS as readonly string[]).includes(reason) ? reason : "wrong";
  const text = `${why}${note.trim() ? `: ${note.trim()}` : ""}`.slice(0, 300);
  await createAdminClient().from("ai_messages").update({ flagged_at: new Date().toISOString(), flag_reason: text }).eq("id", m.id);
  await track({ name: "ai_reply_flagged", product: "platform", role: "student", userId: me.profile.id, props: { reason: why } });
}

/** "Save to Your practice": the chat is listed with the student's quizzes, notes and flashcards. */
export async function saveConversation(conversationId: string, saved: boolean): Promise<void> {
  const me = await socialActor({ paid: false });
  if (!z.uuid().safeParse(conversationId).success) return;
  await createAdminClient()
    .from("ai_conversations")
    .update({ saved_at: saved ? new Date().toISOString() : null })
    .eq("id", conversationId)
    .eq("profile_id", me.profile.id);
}

// --- The A$2.99/month add-on ------------------------------------------------------------------

export async function addAiAddonAction(formData: FormData) {
  const me = await socialActor();
  const back = formData.get("back") === "plan" ? "/student/plan" : "/student/practice/ask";
  try {
    await addAiAddon(me.profile.id);
  } catch (e) {
    if (!(e instanceof AddonError)) console.error("Adding EduMi AI failed", e instanceof Error ? e.message : e);
    redirect(await href(`${back}?error=addon`));
  }
  await track({ name: "ai_addon_added", product: "platform", role: "student", userId: me.profile.id, props: { status: me.access.kind } });
  redirect(await href(`${back}?addon=added`));
}

export async function removeAiAddonAction() {
  const me = await socialActor({ paid: false });
  try {
    await removeAiAddon(me.profile.id);
  } catch (e) {
    if (!(e instanceof AddonError)) console.error("Removing EduMi AI failed", e instanceof Error ? e.message : e);
    redirect(await href("/student/plan?error=addon"));
  }
  await track({ name: "ai_addon_removed", product: "platform", role: "student", userId: me.profile.id });
  redirect(await href("/student/plan?addon=removed"));
}
