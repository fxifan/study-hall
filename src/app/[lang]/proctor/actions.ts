"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { breakoutErrorCode, type BreakoutError } from "@/lib/breakouts";
import { createClient } from "@/lib/supabase/server";

// Breakout log (docs/in-site-video-plan.md). The database functions check that the caller is the
// session's staff or an admin, that every adult has a valid WWCC, and the two-students-or-two-adults
// rule; these actions only parse the form and report the result.

async function requireStaff() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "proctor" && profile.role !== "admin")) throw new Error("Staff only.");
  return profile;
}

/**
 * A supervisor's check-in note for one student: a report template (its English and Chinese are
 * copied in, so the parent report can switch language) and/or a short typed note. RLS allows it
 * only for the session's own staff and enrolled students; the log is append-only.
 */
export async function addCheckIn(formData: FormData) {
  const profile = await requireStaff();
  const parsed = z
    .object({
      sessionId: z.uuid(),
      studentId: z.uuid(),
      templateId: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
      note: z
        .string()
        .trim()
        .max(200)
        .transform((v) => v || null),
    })
    .parse({
      sessionId: formData.get("sessionId"),
      studentId: formData.get("studentId"),
      templateId: formData.get("templateId") ?? "",
      note: formData.get("note") ?? "",
    });
  if (!parsed.templateId && !parsed.note) return;
  const supabase = await createClient();
  const template = parsed.templateId
    ? (await supabase.from("report_templates").select("text_en, text_zh").eq("id", parsed.templateId).single()).data
    : null;
  const { error } = await supabase.from("session_checkins").insert({
    session_id: parsed.sessionId,
    student_id: parsed.studentId,
    template_id: template ? parsed.templateId : null,
    template_en: template?.text_en ?? null,
    template_zh: template?.text_zh ?? null,
    note: parsed.note,
    created_by: profile.id,
  });
  if (error) throw error;
  refresh();
}

export type BreakoutState = { status: "idle" } | { status: "started" } | { status: "error"; code: BreakoutError };

export async function startBreakout(_prev: BreakoutState, formData: FormData): Promise<BreakoutState> {
  await requireStaff();
  const parsed = z
    .object({
      sessionId: z.uuid(),
      adultId: z.uuid(),
      secondAdultId: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
      studentIds: z.array(z.uuid()).min(1),
    })
    .safeParse({
      sessionId: formData.get("sessionId"),
      adultId: formData.get("adultId"),
      secondAdultId: formData.get("secondAdultId") ?? "",
      studentIds: formData.getAll("studentId"),
    });
  if (!parsed.success) return { status: "error", code: "invalid" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("start_breakout", {
    p_session: parsed.data.sessionId,
    p_adult: parsed.data.adultId,
    p_students: parsed.data.studentIds,
    p_second_adult: parsed.data.secondAdultId,
  });
  if (error) {
    const code = breakoutErrorCode(error.message);
    if (code === "failed") console.error("start_breakout failed", error.code, error.message);
    return { status: "error", code };
  }
  refresh();
  return { status: "started" };
}

export async function endBreakout(formData: FormData) {
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.rpc("end_breakout", { p_breakout: z.uuid().parse(formData.get("breakoutId")) });
  if (error) throw error;
  refresh();
}
