"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Saves a child's subjects ("takes" / "wants help") and short note on current work. Parents only;
 * RLS limits writes to their own children.
 */
export async function saveStudies(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "parent") throw new Error("Only a signed-in parent can do this.");
  const studentId = z.uuid().parse(formData.get("studentId"));
  const taking = new Set(formData.getAll("taking").map((v) => z.uuid().parse(v)));
  const help = new Set(formData.getAll("help").map((v) => z.uuid().parse(v)));
  for (const id of help) taking.add(id); // wanting help implies taking it
  const note = z.string().trim().max(200).parse(formData.get("note") ?? "") || null;

  const supabase = await createClient();
  const { error: noteError } = await supabase.from("students").update({ study_note: note }).eq("id", studentId);
  if (noteError) throw noteError;

  const { data: current } = await supabase.from("student_subjects").select("subject_id").eq("student_id", studentId);
  const removed = (current ?? []).map((r) => r.subject_id).filter((id) => !taking.has(id));
  if (removed.length) {
    const { error } = await supabase.from("student_subjects").delete().eq("student_id", studentId).in("subject_id", removed);
    if (error) throw error;
  }
  if (taking.size) {
    const { error } = await supabase
      .from("student_subjects")
      .upsert([...taking].map((id) => ({ student_id: studentId, subject_id: id, wants_help: help.has(id) })), {
        onConflict: "student_id,subject_id",
      });
    if (error) throw error;
  }
  refresh();
}
