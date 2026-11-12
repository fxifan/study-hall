"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { track } from "@/lib/events";
import { GOAL_CHOICES } from "@/lib/social/consistency";
import { awardConsistency } from "@/lib/social/consistency-server";
import { finishSession, liveSessionFor, setPaused, socialActor, startSoloSession } from "@/lib/social/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dateKeyOf } from "@/lib/time";

// Solo mode (docs/consistency-and-solo.md): one task, a timer that counts towards no group, and a
// check-in at the end with a line for tomorrow. Needs a plan, like groups.

const startSchema = z.object({
  source: z.enum(["own", "tutor", "practice", "tomorrow"]),
  body: z.string().trim().min(1).max(200),
});

/** Start a solo session on one task. A task already open is kept (one at a time). */
export async function startSolo(formData: FormData) {
  const me = await socialActor();
  const parsed = startSchema.safeParse({ source: formData.get("source"), body: formData.get("body") });
  if (!parsed.success) redirect("/student/solo?error=task");
  const admin = createAdminClient();
  const { data: open } = await admin.from("solo_tasks").select("id").eq("profile_id", me.profile.id).eq("status", "open").maybeSingle();
  const session = await startSoloSession(me);
  await setPaused(me.profile.id, session.id, false);
  if (!open) {
    const ins = await admin.from("solo_tasks").insert({ profile_id: me.profile.id, session_id: session.id, source: parsed.data.source, body: parsed.data.body });
    if (ins.error && ins.error.code !== "23505") throw ins.error;
    await track({ name: "study_session_started", product: "platform", role: "student", userId: me.profile.id, props: { mode: "solo" }, dedupeKey: `study:${session.id}` });
  }
  redirect("/student/solo");
}

const finishSchema = z.object({
  status: z.enum(["done", "partly", "stuck"]),
  tomorrow: z.string().trim().max(200),
});

export type SoloFinish = { ok: true; points: number; streak: number; studyDaysThisWeek: number; counted: boolean } | { ok: false; error: string };

/** End the solo session: how it went, and what's next. Counts towards today's study day. */
export async function finishSolo(input: z.input<typeof finishSchema>): Promise<SoloFinish> {
  const me = await socialActor();
  const parsed = finishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Keep tomorrow's note under 200 characters." };
  const admin = createAdminClient();
  const { data: task } = await admin.from("solo_tasks").select("id").eq("profile_id", me.profile.id).eq("status", "open").maybeSingle();
  if (!task) return { ok: false, error: "There's no solo task to finish. Refresh the page." };
  // Stop a solo timer if it's still running (a group timer is left alone).
  const live = await liveSessionFor(me.profile.id);
  if (live && live.group_id === null) await finishSession(live.id, "manual");
  const { error } = await admin
    .from("solo_tasks")
    .update({ status: parsed.data.status, tomorrow: parsed.data.tomorrow || null, day: dateKeyOf(), finished_at: new Date().toISOString() })
    .eq("id", task.id);
  if (error) return { ok: false, error: "Couldn't save. Try again." };
  const award = await awardConsistency(me.profile.id);
  // No refresh: the check-in shows the result in place (a refresh would swap it for the task picker).
  const c = award.consistency;
  return { ok: true, points: award.points, streak: c?.streak ?? 0, studyDaysThisWeek: c?.studyDaysThisWeek ?? 0, counted: c?.todayCounted ?? false };
}

/** The personal daily goal, in minutes (15, 25, 45 or 60). */
export async function setDailyGoal(formData: FormData) {
  const me = await socialActor({ paid: false });
  const minutes = Number(formData.get("minutes"));
  if (!(GOAL_CHOICES as readonly number[]).includes(minutes)) return;
  await createAdminClient().from("student_settings").upsert({ profile_id: me.profile.id, daily_goal_minutes: minutes, updated_at: new Date().toISOString() });
  await awardConsistency(me.profile.id); // a lower goal may already be met today
  refresh();
}
