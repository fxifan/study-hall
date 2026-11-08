import "server-only";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TaskStatus } from "./next-steps";

/**
 * Tutor ↔ student links (docs/tutor-next-steps.md). A tutor's student record can be linked to the
 * student's own Edumi account through an invite link the student accepts. Linked students see
 * their tutor's next steps and report progress; the tutor sees only that progress. All link writes
 * use the service role after the caller is checked (the database blocks tutors writing them).
 */

/** Holds an invite through sign-up or login, like the group invite cookie. */
export const TUTOR_LINK_COOKIE = "edumi_tutor_link";

export const isLinkToken = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{24,64}$/.test(v);

export function newLinkToken(): string {
  return randomBytes(24).toString("base64url"); // 32 characters
}

export type Invite = { recordId: string; tutorName: string; studentFirstName: string; linkedTo: string | null };

/** An invite by its token, or null if it doesn't exist (or was already used and cleared). */
export async function findInvite(token: string): Promise<Invite | null> {
  if (!isLinkToken(token)) return null;
  const { data } = await createAdminClient()
    .from("tutor_students")
    .select("id, first_name, linked_profile_id, tutors(display_name)")
    .eq("link_token", token)
    .maybeSingle<{ id: string; first_name: string; linked_profile_id: string | null; tutors: { display_name: string } | null }>();
  if (!data) return null;
  return { recordId: data.id, tutorName: data.tutors?.display_name ?? "Your tutor", studentFirstName: data.first_name, linkedTo: data.linked_profile_id };
}

/**
 * Accept an invite as this student. The token is cleared, so a forwarded link can't be reused.
 * Fails if the tutor already has this student linked on another record.
 */
export async function acceptInvite(token: string, profileId: string): Promise<{ ok: true; tutorName: string } | { ok: false; error: string }> {
  const invite = await findInvite(token);
  if (!invite) return { ok: false, error: "This invite link has expired or was already used. Ask your tutor for a new one." };
  if (invite.linkedTo && invite.linkedTo !== profileId) return { ok: false, error: "This invite was already used. Ask your tutor for a new one." };
  const { data, error } = await createAdminClient()
    .from("tutor_students")
    .update({ linked_profile_id: profileId, linked_at: new Date().toISOString(), link_token: null })
    .eq("id", invite.recordId)
    .eq("link_token", token)
    .select("id");
  if (error?.code === "23505") return { ok: false, error: "You're already linked to this tutor." };
  if (error || !data?.length) return { ok: false, error: "Couldn't link your account. Try the link again." };
  return { ok: true, tutorName: invite.tutorName };
}

export type LinkedTutor = {
  recordId: string;
  tutorName: string;
  linkedAt: string;
  task: { id: string; body: string; dueOn: string | null; status: TaskStatus; note: string | null; updatedBy: "tutor" | "student" } | null;
};

/** The tutors this student is linked to, each with their current next step. */
export async function linkedTutors(profileId: string): Promise<LinkedTutor[]> {
  const admin = createAdminClient();
  const { data: records } = await admin
    .from("tutor_students")
    .select("id, linked_at, tutors(display_name)")
    .eq("linked_profile_id", profileId)
    .order("linked_at")
    .returns<{ id: string; linked_at: string; tutors: { display_name: string } | null }[]>();
  if (!records?.length) return [];
  const { data: tasks } = await admin
    .from("tutor_tasks")
    .select("id, student_id, body, due_on, status, note, updated_by, created_at")
    .in("student_id", records.map((r) => r.id))
    .order("created_at", { ascending: false })
    .returns<{ id: string; student_id: string; body: string; due_on: string | null; status: TaskStatus; note: string | null; updated_by: "tutor" | "student" }[]>();
  return records.map((r) => {
    const t = (tasks ?? []).find((x) => x.student_id === r.id);
    return {
      recordId: r.id,
      tutorName: r.tutors?.display_name ?? "Your tutor",
      linkedAt: r.linked_at,
      task: t ? { id: t.id, body: t.body, dueOn: t.due_on, status: t.status, note: t.note, updatedBy: t.updated_by } : null,
    };
  });
}

export async function isTutorLinked(profileId: string): Promise<boolean> {
  const { count } = await createAdminClient().from("tutor_students").select("id", { count: "exact", head: true }).eq("linked_profile_id", profileId);
  return (count ?? 0) > 0;
}

/** The student reports progress on their current next step from a tutor they're linked to. */
export async function studentUpdateTask(profileId: string, taskId: string, status: TaskStatus, note: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: task } = await admin
    .from("tutor_tasks")
    .select("id, tutor_students!inner(linked_profile_id)")
    .eq("id", taskId)
    .eq("tutor_students.linked_profile_id", profileId)
    .maybeSingle();
  if (!task) return false;
  const { error } = await admin.from("tutor_tasks").update({ status, note: note || null, updated_by: "student" }).eq("id", taskId);
  return !error;
}

/** Either side ends a link. `by` limits it to the student's own link or the tutor's own record. */
export async function unlink(recordId: string, by: { profileId: string } | { tutorId: string }): Promise<boolean> {
  let q = createAdminClient().from("tutor_students").update({ linked_profile_id: null, linked_at: null }).eq("id", recordId);
  q = "profileId" in by ? q.eq("linked_profile_id", by.profileId) : q.eq("tutor_id", by.tutorId);
  const { data, error } = await q.select("id");
  return !error && Boolean(data?.length);
}

/** A tutor creates (or replaces) the invite link for one of their students. */
export async function createInvite(recordId: string, tutorId: string): Promise<string | null> {
  const token = newLinkToken();
  const { data, error } = await createAdminClient()
    .from("tutor_students")
    .update({ link_token: token })
    .eq("id", recordId)
    .eq("tutor_id", tutorId)
    .is("linked_profile_id", null)
    .select("id");
  return !error && data?.length ? token : null;
}
