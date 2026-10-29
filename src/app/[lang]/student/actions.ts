"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
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

/** Up to three goals for a session (spec §4.2). Empty boxes remove that goal. */
export async function saveGoals(formData: FormData) {
  const studentId = await currentStudentId();
  const sessionId = z.uuid().parse(formData.get("sessionId"));
  const supabase = await createClient();

  for (const position of [1, 2, 3]) {
    const text = goalText.parse(formData.get(`goal${position}`) ?? "");
    if (text) {
      const { error } = await supabase
        .from("goals")
        .upsert({ session_id: sessionId, student_id: studentId, position, text }, { onConflict: "session_id,student_id,position" });
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

/** Marks each goal done / partial / not done, with an optional one-line note. */
export async function markGoals(formData: FormData) {
  await currentStudentId();
  const supabase = await createClient();
  const ids = formData.getAll("goalId").map((v) => z.uuid().parse(v));
  for (const id of ids) {
    const outcome = z.enum(["done", "partial", "not_done"]).nullable().parse(formData.get(`outcome_${id}`) || null);
    const note = goalText.parse(formData.get(`note_${id}`) ?? "") || null;
    const { error } = await supabase.from("goals").update({ outcome, note }).eq("id", id);
    if (error) throw error;
  }
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
