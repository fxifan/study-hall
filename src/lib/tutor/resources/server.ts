import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LlmError, llmConfigured, openAiLlm, type Llm } from "@/lib/llm";
import type { ReportBody } from "@/lib/report/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { monthStart, type TutorRow, planStateFor } from "../server";
import { resourceAccess, type ResourceAccess } from "./access";
import { offlineResourceLlm } from "./generate";
import { cleanFocus } from "./prompt";
import type { Framework, PracticeSet, WritingTips } from "./schema";

export type CurriculumPoint = {
  id: string;
  framework: Framework;
  subject: string;
  unit_or_level: string;
  area: string;
  code: string | null;
  summary: string;
};

export type ResourceRow = {
  id: string;
  kind: "practice_set" | "writing_tips";
  title: string;
  framework: Framework;
  subject: string;
  unit_or_level: string;
  point_ids: string[];
  settings: { count?: number; difficulty?: string; types?: string[]; focus?: string[] };
  content: PracticeSet | WritingTips;
  status: "draft" | "approved";
  approved_at: string | null;
  created_at: string;
};

export const RESOURCE_COLUMNS = "id, kind, title, framework, subject, unit_or_level, point_ids, settings, content, status, approved_at, created_at";

/**
 * The model to use: OpenAI when configured; the offline stand-in in development only (no key, or
 * TUTOR_RESOURCES_OFFLINE=1 for predictable end-to-end tests). Never offline in production.
 */
export function resourceLlm(): Llm {
  const production = process.env.VERCEL_ENV === "production";
  if (!production && process.env.TUTOR_RESOURCES_OFFLINE === "1") return offlineResourceLlm();
  if (llmConfigured()) return openAiLlm();
  if (production) throw new LlmError("OPENAI_API_KEY is not set.");
  return offlineResourceLlm();
}

/**
 * Resources made this month and in total, from the usage log (one 'resource' event per creation),
 * so deleting a resource doesn't give a slot back. Service role: counts only.
 */
export async function resourceCounts(tutorId: string, now = new Date()): Promise<{ thisMonth: number; total: number }> {
  const admin = createAdminClient();
  const made = () => admin.from("tutor_usage_events").select("id", { count: "exact", head: true }).eq("tutor_id", tutorId).eq("purpose", "resource");
  const [month, total] = await Promise.all([made().gte("created_at", monthStart(now).toISOString()), made()]);
  if (month.error) throw month.error;
  if (total.error) throw total.error;
  return { thisMonth: month.count ?? 0, total: total.count ?? 0 };
}

export async function resourceAccessFor(tutor: Pick<TutorRow, "id" | "plan" | "trial_ends_at">): Promise<ResourceAccess> {
  const [state, counts] = await Promise.all([planStateFor(tutor), resourceCounts(tutor.id)]);
  return resourceAccess({ ...state, ...counts });
}

/**
 * Topic suggestions from a student's last few sent reports ("Covered" items, English), for the
 * tutor to confirm or edit before anything is sent to the model (spec §5).
 */
export async function recentTopics(supabase: SupabaseClient, studentId: string): Promise<string[]> {
  const { data } = await supabase
    .from("tutor_reports")
    .select("final_json, tutor_sessions!inner(student_id, starts_at)")
    .eq("tutor_sessions.student_id", studentId)
    .not("sent_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(3);
  const covered = (data ?? []).flatMap((r) => ((r.final_json as ReportBody | null)?.en?.covered ?? []).map((c) => c.replace(/[.。]$/, "")));
  return cleanFocus(covered.join(";"));
}
