"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { checkZoomUrl } from "@/lib/tutor/dashboard";
import { addDaysToDateKey, zonedDateTimeToUtc } from "@/lib/time";
import { requireTutorAction } from "./_lib/action-helpers";

// Dashboard actions (tutor dashboard brief): lessons, meeting links and the calendar feed.
// Writes go through RLS as the signed-in tutor, except the feed token (service role, see migration).

export type DashboardResult = { ok: true; message?: string } | { ok: false; error: string };

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}$/);
const subjects = z.array(z.string().trim().min(1).max(40)).max(10);

const lessonSchema = z.object({
  id: z.uuid().nullable(),
  studentId: z.uuid(),
  date: day,
  time,
  durationMin: z.number().int().min(15).max(600),
  subjects,
  notes: z.string().trim().max(300),
  meetingLinkId: z.uuid().nullable(),
  repeatWeeks: z.number().int().min(1).max(26),
});
export type LessonInput = z.input<typeof lessonSchema>;

/** Create a lesson (optionally weekly for N weeks), or update one: rescheduling is just a new date/time. */
export async function saveLesson(input: LessonInput): Promise<DashboardResult> {
  const { profile } = await requireTutorAction();
  const parsed = lessonSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the student, date, time and length." };
  const l = parsed.data;
  const supabase = await createClient();
  const fields = {
    student_id: l.studentId,
    duration_min: l.durationMin,
    subjects: l.subjects,
    notes: l.notes || null,
    meeting_link_id: l.meetingLinkId,
  };
  if (l.id) {
    const { data, error } = await supabase
      .from("tutor_lessons")
      .update({ ...fields, starts_at: zonedDateTimeToUtc(l.date, l.time).toISOString() })
      .eq("id", l.id)
      .select("id");
    if (error || !data?.length) return { ok: false, error: "Couldn't save the lesson." };
    refresh();
    return { ok: true, message: "Lesson updated." };
  }
  const rows = Array.from({ length: l.repeatWeeks }, (_, i) => ({
    ...fields,
    tutor_id: profile.id,
    starts_at: zonedDateTimeToUtc(addDaysToDateKey(l.date, i * 7), l.time).toISOString(),
  }));
  const { error } = await supabase.from("tutor_lessons").insert(rows);
  if (error) return { ok: false, error: "Couldn't schedule the lesson." };
  refresh();
  return { ok: true, message: l.repeatWeeks > 1 ? `${l.repeatWeeks} weekly lessons scheduled.` : "Lesson scheduled." };
}

export async function setLessonCancelled(id: string, cancelled: boolean): Promise<DashboardResult> {
  await requireTutorAction();
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Lesson not found." };
  const { data, error } = await (await createClient())
    .from("tutor_lessons")
    .update({ status: cancelled ? "cancelled" : "scheduled" })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return { ok: false, error: "Couldn't update the lesson." };
  refresh();
  return { ok: true, message: cancelled ? "Lesson cancelled." : "Lesson restored." };
}

export async function deleteLesson(id: string): Promise<DashboardResult> {
  await requireTutorAction();
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Lesson not found." };
  // The logged session (and its report and billing) stays if the lesson was logged.
  const { error } = await (await createClient()).from("tutor_lessons").delete().eq("id", id);
  if (error) return { ok: false, error: "Couldn't delete the lesson." };
  refresh();
  return { ok: true, message: "Lesson deleted." };
}

// --- Meeting links ---------------------------------------------------------------------------------

const linkSchema = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(1, "Give the link a name.").max(60, "Keep the name under 60 characters."),
  url: z.string().max(500),
  studentId: z.uuid().nullable(),
});
export type MeetingLinkInput = z.input<typeof linkSchema>;

export async function saveMeetingLink(input: MeetingLinkInput): Promise<DashboardResult> {
  const { profile } = await requireTutorAction();
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the link." };
  const zoom = checkZoomUrl(parsed.data.url);
  if (!zoom.ok) return { ok: false, error: zoom.error };
  const row = { name: parsed.data.name, url: zoom.url, student_id: parsed.data.studentId };
  const supabase = await createClient();
  const { error } = parsed.data.id
    ? await supabase.from("tutor_meeting_links").update(row).eq("id", parsed.data.id)
    : await supabase.from("tutor_meeting_links").insert({ ...row, tutor_id: profile.id });
  if (error) return { ok: false, error: "Couldn't save the link." };
  refresh();
  return { ok: true, message: parsed.data.id ? "Link updated." : "Link saved." };
}

export async function deleteMeetingLink(id: string): Promise<DashboardResult> {
  await requireTutorAction();
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Link not found." };
  const { error } = await (await createClient()).from("tutor_meeting_links").delete().eq("id", id);
  if (error) return { ok: false, error: "Couldn't delete the link." };
  refresh();
  return { ok: true, message: "Link deleted." };
}

// --- Calendar feed (ICS subscription) ----------------------------------------------------------------

/** Create (or replace) the private feed URL. Replacing it stops the old URL working. */
export async function setCalendarFeed(on: boolean): Promise<DashboardResult> {
  const { profile } = await requireTutorAction();
  const { error } = await createAdminClient()
    .from("tutors")
    .update({ calendar_feed_token: on ? randomBytes(24).toString("base64url") : null, calendar_feed_fetched_at: null })
    .eq("id", profile.id);
  if (error) return { ok: false, error: "Couldn't update the calendar feed." };
  refresh();
  return { ok: true, message: on ? "Calendar link ready." : "Calendar link turned off. Calendars subscribed to it will stop updating." };
}
