"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { EVIDENCE_BUCKET, EVIDENCE_TYPES, MAX_FILES_PER_GOAL, evidenceProblem, safeFileName, type EvidenceError } from "@/lib/evidence";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** The signed-in student's record. RLS does the real checks; this just finds their student id. */
async function currentStudentId(): Promise<string> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "student") throw new Error("Only a signed-in student can do this.");
  const supabase = await createClient();
  const { data } = await supabase.from("students").select("id").eq("profile_id", profile.id).single();
  if (!data) throw new Error("No student record.");
  return data.id;
}

const goalText = z.string().trim().max(140);
const shortText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);
const minutes = z.union([z.literal(""), z.coerce.number().int().min(5).max(240)]).transform((v) => (v === "" ? null : v));

/**
 * The session plan (spec §4.2, owner brief Oct 2026): up to three tasks, each with an optional
 * subject, what the student expects to show for it, and a time estimate. Empty tasks are removed.
 */
export async function saveGoals(formData: FormData) {
  const studentId = await currentStudentId();
  const sessionId = z.uuid().parse(formData.get("sessionId"));
  const supabase = await createClient();

  for (const position of [1, 2, 3]) {
    const text = goalText.parse(formData.get(`goal${position}`) ?? "");
    if (text) {
      const plan = {
        subject: shortText(60).parse(formData.get(`subject${position}`) ?? ""),
        expected_output: shortText(140).parse(formData.get(`expected${position}`) ?? ""),
        est_minutes: minutes.parse(formData.get(`minutes${position}`) ?? ""),
      };
      const { error } = await supabase
        .from("goals")
        .upsert({ session_id: sessionId, student_id: studentId, position, text, ...plan }, { onConflict: "session_id,student_id,position" });
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("goals")
        .delete()
        .eq("session_id", sessionId)
        .eq("student_id", studentId)
        .eq("position", position);
      if (error) throw error;
    }
  }
  refresh();
}

/** Marks each task done / partial / not done, with an optional note and result (e.g. "12/15"). */
export async function markGoals(formData: FormData) {
  await currentStudentId();
  const supabase = await createClient();
  const ids = formData.getAll("goalId").map((v) => z.uuid().parse(v));
  for (const id of ids) {
    const outcome = z.enum(["done", "partial", "not_done"]).nullable().parse(formData.get(`outcome_${id}`) || null);
    const note = goalText.parse(formData.get(`note_${id}`) ?? "") || null;
    const result = shortText(60).parse(formData.get(`result_${id}`) ?? "");
    const { error } = await supabase.from("goals").update({ outcome, note, result }).eq("id", id);
    if (error) throw error;
  }
  refresh();
}

// --- Work evidence -------------------------------------------------------------------------------
// The browser uploads straight to private storage with a one-time signed URL (no Vercel size
// limit); the row is added only after the file has arrived. RLS on goals and goal_evidence decides
// who may do what; the service role is used only for storage, after those checks.

export type EvidenceResult = { ok: true } | { ok: false; code: EvidenceError };
type StartResult = { ok: true; path: string; token: string } | { ok: false; code: EvidenceError };

export async function startEvidenceUpload(goalId: string, file: { name: string; type: string; size: number }): Promise<StartResult> {
  const studentId = await currentStudentId();
  const problem = evidenceProblem(file);
  if (problem) return { ok: false, code: problem };
  const supabase = await createClient();
  // RLS: only the student's own goal is visible.
  const { data: goal } = await supabase.from("goals").select("id").eq("id", z.uuid().parse(goalId)).maybeSingle();
  if (!goal) return { ok: false, code: "failed" };
  const { count } = await supabase.from("goal_evidence").select("id", { count: "exact", head: true }).eq("goal_id", goal.id);
  if ((count ?? 0) >= MAX_FILES_PER_GOAL) return { ok: false, code: "count" };

  const path = `${studentId}/${goal.id}/${randomUUID()}.${EVIDENCE_TYPES[file.type]}`;
  const { data, error } = await createAdminClient().storage.from(EVIDENCE_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("Signed upload URL failed", error?.message);
    return { ok: false, code: "failed" };
  }
  return { ok: true, path: data.path, token: data.token };
}

export async function finishEvidenceUpload(goalId: string, path: string, originalName: string): Promise<EvidenceResult> {
  const studentId = await currentStudentId();
  const id = z.uuid().parse(goalId);
  // The path must be one this student was given for this goal.
  if (!new RegExp(`^${studentId}/${id}/[0-9a-f-]{36}\\.(jpg|png|webp|pdf)$`).test(path)) return { ok: false, code: "failed" };
  const storage = createAdminClient().storage.from(EVIDENCE_BUCKET);
  const folder = path.slice(0, path.lastIndexOf("/"));
  const { data: listed } = await storage.list(folder, { search: path.slice(folder.length + 1) });
  const object = listed?.find((o) => `${folder}/${o.name}` === path);
  const meta = object?.metadata as { size?: number; mimetype?: string } | undefined;
  const contentType = meta?.mimetype ?? "";
  if (!object || !meta?.size || evidenceProblem({ type: contentType, size: meta.size })) {
    if (object) await storage.remove([path]);
    return { ok: false, code: "failed" };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("goal_evidence").insert({
    goal_id: id,
    student_id: studentId,
    storage_path: path,
    file_name: safeFileName(originalName, contentType),
    content_type: contentType,
    size_bytes: meta.size,
  });
  if (error) {
    await storage.remove([path]);
    return { ok: false, code: error.code === "23514" ? "count" : "failed" };
  }
  refresh();
  return { ok: true };
}

export async function removeEvidence(evidenceId: string): Promise<EvidenceResult> {
  await currentStudentId();
  const supabase = await createClient();
  // RLS: students can only see and delete their own evidence.
  const { data: row } = await supabase.from("goal_evidence").select("id, storage_path").eq("id", z.uuid().parse(evidenceId)).maybeSingle();
  if (!row) return { ok: false, code: "failed" };
  const { error } = await supabase.from("goal_evidence").delete().eq("id", row.id);
  if (error) return { ok: false, code: "failed" };
  await createAdminClient().storage.from(EVIDENCE_BUCKET).remove([row.storage_path]);
  refresh();
  return { ok: true };
}

/** The student's reply on their own help request; RLS checks it's theirs. Logged, append-only. */
export async function replyHelp(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Sign in first.");
  const { helpId, body } = z.object({ helpId: z.uuid(), body: z.string().trim().min(1).max(1000) }).parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.from("messages").insert({ help_request_id: helpId, sender_id: profile.id, body });
  if (error) throw error;
  refresh();
}

export async function leaveSession(formData: FormData) {
  await currentStudentId();
  const supabase = await createClient();
  const { error } = await supabase.rpc("check_out", { p_session: z.uuid().parse(formData.get("sessionId")) });
  if (error) throw error;
  refresh();
}

/** "I'm stuck" (spec §4.3): goes to the session supervisor's queue as an open request. */
export async function raiseHelp(formData: FormData) {
  const studentId = await currentStudentId();
  const parsed = z
    .object({
      sessionId: z.uuid(),
      subject: z.string().trim().min(1).max(60),
      description: z.string().trim().min(1).max(500),
    })
    .parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.from("help_requests").insert({
    session_id: parsed.sessionId,
    student_id: studentId,
    subject: parsed.subject,
    description: parsed.description,
  });
  if (error) throw error;
  refresh();
}
