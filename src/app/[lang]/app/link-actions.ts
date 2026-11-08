"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { track } from "@/lib/events";
import { createInvite, unlink } from "@/lib/tutor/links";
import { requireTutorAction } from "./_lib/action-helpers";

// Tutor side of student links (docs/tutor-next-steps.md). Link fields are written with the service
// role, scoped to the tutor's own record (the database blocks tutors writing them directly).

export type LinkResult = { ok: true; token?: string } | { ok: false; error: string };

/** Create (or replace) the invite link for one of your students. */
export async function createStudentInvite(recordId: string): Promise<LinkResult> {
  const { profile } = await requireTutorAction();
  if (!z.uuid().safeParse(recordId).success) return { ok: false, error: "Couldn't create the link." };
  const token = await createInvite(recordId, profile.id);
  if (!token) return { ok: false, error: "Couldn't create the link. Is this student already linked?" };
  await track({ name: "tutor_link_created", product: "tutors", role: "tutor", userId: profile.id, email: profile.email });
  refresh();
  return { ok: true, token };
}

/** Stop seeing a student's progress; they stop seeing your next steps. */
export async function unlinkStudent(recordId: string): Promise<LinkResult> {
  const { profile } = await requireTutorAction();
  if (!z.uuid().safeParse(recordId).success || !(await unlink(recordId, { tutorId: profile.id }))) return { ok: false, error: "Couldn't unlink." };
  refresh();
  return { ok: true };
}
