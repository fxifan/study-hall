"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { z } from "zod";
import { track } from "@/lib/events";
import { awardConsistency } from "@/lib/social/consistency-server";
import { socialActor } from "@/lib/social/server";
import { TUTOR_LINK_COOKIE, acceptInvite, isLinkToken, studentUpdateTask, unlink } from "@/lib/tutor/links";

// The student's side of tutor links (docs/tutor-next-steps.md). Free: no plan needed.

export type TutorActionResult = { ok: true; message?: string } | { ok: false; error: string };

/** Accept a tutor's invite (from the link page, or one held in the cookie through sign-up). */
export async function acceptTutorInvite(token: string): Promise<TutorActionResult> {
  const me = await socialActor({ paid: false });
  if (!isLinkToken(token)) return { ok: false, error: "This invite link isn't valid. Ask your tutor for a new one." };
  const r = await acceptInvite(token, me.profile.id);
  (await cookies()).delete(TUTOR_LINK_COOKIE);
  if (!r.ok) return r;
  await track({ name: "tutor_link_accepted", product: "tutors", role: "student", userId: me.profile.id });
  refresh();
  return { ok: true, message: `You're linked with ${r.tutorName}.` };
}

/** Dismiss an invite held in the cookie without accepting. */
export async function declineTutorInvite(): Promise<void> {
  await socialActor({ paid: false });
  (await cookies()).delete(TUTOR_LINK_COOKIE);
  refresh();
}

const progress = z.object({
  id: z.uuid(),
  status: z.enum(["not_started", "started", "done", "stuck"]),
  note: z.string().trim().max(300),
});

/** Report how far you got on your tutor's next step, and where you got stuck. */
export async function reportTutorTask(input: z.input<typeof progress>): Promise<TutorActionResult> {
  const me = await socialActor({ paid: false });
  const parsed = progress.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Keep your note under 300 characters." };
  const ok = await studentUpdateTask(me.profile.id, parsed.data.id, parsed.data.status, parsed.data.note);
  if (!ok) return { ok: false, error: "Couldn't save. Refresh and try again." };
  if (parsed.data.status === "done") await awardConsistency(me.profile.id); // finishing it makes today a study day
  refresh();
  return { ok: true, message: "Saved. Your tutor will see this." };
}

/** Stop sharing next-step progress with a tutor. */
export async function leaveTutor(recordId: string): Promise<TutorActionResult> {
  const me = await socialActor({ paid: false });
  if (!z.uuid().safeParse(recordId).success || !(await unlink(recordId, { profileId: me.profile.id }))) return { ok: false, error: "Couldn't unlink. Try again." };
  refresh();
  return { ok: true, message: "Unlinked." };
}
