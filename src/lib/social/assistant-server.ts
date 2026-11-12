import "server-only";
import { llmConfigured, openAiLlm, reportModel, type Llm } from "@/lib/llm";
import { createAdminClient } from "@/lib/supabase/admin";
import { dateKeyOf } from "@/lib/time";
import {
  ASSISTANT_DAILY_LIMIT,
  ASSISTANT_PROMPT_VERSION,
  AssistantError,
  askAssistant,
  offlineAssistantLlm,
  replyText,
  type AssistantReply,
  type ChatContext,
  type HistoryMessage,
  type MistakeContext,
} from "./assistant";
import { publicQuizSchema, type QuestionResult, type QuizKey } from "./resources";
import type { SocialStudent } from "./server";

/**
 * Who can use EduMi AI, and what to offer when they can't:
 * - on: the add-on is on their plan (or an admin in Student view).
 * - available: a plan they pay for themselves, so they can add it here.
 * - parent: a parent pays; the parent adds it (not from the student's account).
 * - studyhall: covered by a family Study Hall plan, which has no add-on yet.
 * - needs_card: an older no-card trial; add a card first.
 * - needs_plan: no plan (or it ended).
 */
export type AiAccess = { kind: "on" } | { kind: "available"; trial: boolean } | { kind: "parent" } | { kind: "studyhall" } | { kind: "needs_card" } | { kind: "needs_plan" };

export async function aiAccess(me: SocialStudent): Promise<AiAccess> {
  if (me.profile.role === "admin") return { kind: "on" };
  const a = me.access;
  if (a.kind === "studyhall") return { kind: "studyhall" };
  if (a.kind !== "paid" && a.kind !== "trial") return { kind: "needs_plan" };
  if (a.kind === "trial" && !a.billed) return { kind: "needs_card" };
  const { data: plan } = await createAdminClient().from("student_plans").select("payer, stripe_subscription_id, ai_addon_item_id").eq("profile_id", me.profile.id).maybeSingle();
  if (plan?.ai_addon_item_id) return { kind: "on" };
  if (plan?.payer === "parent") return { kind: "parent" };
  if (!plan?.stripe_subscription_id) return { kind: "needs_card" };
  return { kind: "available", trial: a.kind === "trial" };
}

export async function assistantUsedToday(profileId: string): Promise<number> {
  const { count } = await createAdminClient()
    .from("student_ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("kind", "assistant")
    .eq("day", dateKeyOf());
  return count ?? 0;
}

export async function assistantLeftToday(profileId: string): Promise<number> {
  return Math.max(0, ASSISTANT_DAILY_LIMIT - (await assistantUsedToday(profileId)));
}

function assistantLlm(): Llm {
  return process.env.TUTOR_RESOURCES_OFFLINE === "1" || !llmConfigured() ? offlineAssistantLlm() : openAiLlm(process.env.OPENAI_ASSISTANT_MODEL || reportModel());
}

export type Conversation = {
  id: string;
  profile_id: string;
  title: string;
  subject: string | null;
  topic: string | null;
  year_level: number | null;
  source: "ask" | "quiz_mistake" | "task";
  resource_id: string | null;
  question_index: number | null;
  saved_at: string | null;
  created_at: string;
};

export type ChatMessage = {
  id: string;
  role: "student" | "assistant";
  body: string;
  content: AssistantReply | null;
  feedback: -1 | 1 | null;
  flagged_at: string | null;
  created_at: string;
};

/** The student's own conversation, or null (never someone else's). */
export async function ownConversation(profileId: string, id: string): Promise<Conversation | null> {
  const { data } = await createAdminClient()
    .from("ai_conversations")
    .select("id, profile_id, title, subject, topic, year_level, source, resource_id, question_index, saved_at, created_at")
    .eq("id", id)
    .eq("profile_id", profileId)
    .maybeSingle<Conversation>();
  return data ?? null;
}

export async function conversationMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data } = await createAdminClient()
    .from("ai_messages")
    .select("id, role, body, content, feedback, flagged_at, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at")
    .limit(200);
  return (data ?? []) as ChatMessage[];
}

/**
 * The quiz question a mistake chat is about, built on the server from the stored quiz, its answer
 * key and the student's latest attempt: nothing the browser sends is trusted here.
 */
export async function mistakeContext(profileId: string, resourceId: string, index: number): Promise<{ context: MistakeContext; subject: string | null; title: string } | null> {
  const admin = createAdminClient();
  const [{ data: r, error: e1 }, { data: keyRow, error: e2 }, { data: attempt, error: e3 }] = await Promise.all([
    admin.from("student_resources").select("kind, title, content").eq("id", resourceId).eq("profile_id", profileId).maybeSingle(),
    admin.from("student_resource_keys").select("answer_key").eq("resource_id", resourceId).maybeSingle(),
    admin
      .from("resource_attempts")
      .select("answers, results")
      .eq("resource_id", resourceId)
      .eq("profile_id", profileId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const failed = e1 ?? e2 ?? e3;
  if (failed) console.error("Mistake context query failed", failed.message);
  if (!r || r.kind !== "quiz" || !attempt) return null;
  const quiz = publicQuizSchema.safeParse(r.content);
  const key = (keyRow?.answer_key as QuizKey | undefined)?.questions?.[index];
  const q = quiz.success ? quiz.data.questions[index] : undefined;
  const result = (attempt.results as QuestionResult[] | null)?.[index];
  const given = (attempt.answers as (number | string | null)[] | null)?.[index];
  if (!q || !key || !result) return null;
  const letter = (i: number) => `${"ABCD"[i] ?? i + 1}. ${q.options[i] ?? ""}`;
  const context: MistakeContext = {
    prompt: q.prompt,
    type: q.type,
    options: q.options,
    studentAnswer: typeof given === "number" ? letter(given) : String(given ?? ""),
    correctAnswer: key.type === "mcq" ? letter(key.answer) : key.modelAnswer,
    rubric: key.type === "free" ? key.rubric : [],
    explanation: key.explanation,
    awarded: result.awarded,
    marks: result.marks,
    feedback: result.feedback,
  };
  const subject = quiz.success ? (quiz.data.curriculum?.subject ?? null) : null;
  return { context, subject, title: `${r.title as string}: question ${index + 1}` };
}

export type SendOutcome = { ok: true; message: ChatMessage } | { ok: false; error: "limit" | "service" | "shape" };

/**
 * One turn: check the allowance, store the student's message, ask the model with recent history,
 * store and return the reply. The allowance counts replies, so a failed call costs nothing.
 */
export async function sendTurn(me: SocialStudent, conversation: Conversation, text: string): Promise<SendOutcome> {
  if ((await assistantUsedToday(me.profile.id)) >= ASSISTANT_DAILY_LIMIT) return { ok: false, error: "limit" };
  const admin = createAdminClient();
  const history: HistoryMessage[] = (await conversationMessages(conversation.id)).map((m) => ({ role: m.role, body: m.body }));
  const { error: insertError } = await admin.from("ai_messages").insert({ conversation_id: conversation.id, role: "student", body: text });
  if (insertError) throw insertError;

  const mistake =
    conversation.source === "quiz_mistake" && conversation.resource_id && conversation.question_index !== null
      ? ((await mistakeContext(me.profile.id, conversation.resource_id, conversation.question_index))?.context ?? null)
      : null;
  const context: ChatContext = { yearLevel: conversation.year_level ?? me.student.year_level, subject: conversation.subject, topic: conversation.topic, mistake };

  let out;
  try {
    out = await askAssistant(assistantLlm(), context, history, text);
  } catch (e) {
    console.error("Assistant reply failed", e instanceof Error ? e.message : e);
    return { ok: false, error: e instanceof AssistantError ? "shape" : "service" };
  }
  const { data: row, error } = await admin
    .from("ai_messages")
    .insert({
      conversation_id: conversation.id,
      role: "assistant",
      body: replyText(out.reply),
      content: out.reply,
      model: out.model,
      prompt_version: ASSISTANT_PROMPT_VERSION,
      tokens: out.tokens,
    })
    .select("id, role, body, content, feedback, flagged_at, created_at")
    .single();
  if (error) throw error;
  await Promise.all([
    admin.from("student_ai_usage").insert({ profile_id: me.profile.id, day: dateKeyOf(), kind: "assistant", tokens: out.tokens }),
    admin.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversation.id),
  ]);
  return { ok: true, message: row as ChatMessage };
}
