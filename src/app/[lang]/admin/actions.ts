"use server";

import { refresh, updateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, localizePath } from "@/i18n/config";
import { getCurrentProfile, type CurrentProfile } from "@/lib/auth";
import { isReservedTestEmail } from "@/lib/email";
import { enrolEligibleStudents, generateSessions } from "@/lib/sessions";
import { siteOrigin } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Admin writes go through RLS ("admins manage org …") as the signed-in admin, except inviting a
// supervisor and generating sessions, which need the service role.

async function requireAdmin(): Promise<CurrentProfile> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") throw new Error("Admins only.");
  return profile;
}

async function back(path: string, query: string): Promise<never> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  redirect(localizePath(path, isLocale(value) ? value : DEFAULT_LOCALE) + query);
}

const optionalUuid = z.union([z.uuid(), z.literal("")]).transform((v) => v || null);
const time = z.string().regex(/^\d{2}:\d{2}$/);

// --- Rooms --------------------------------------------------------------------------------------

export async function saveRoom(formData: FormData) {
  const admin = await requireAdmin();
  const room = z
    .object({
      id: optionalUuid,
      name: z.string().trim().min(1).max(80),
      videoUrl: z.url().startsWith("https://"),
      capacity: z.coerce.number().int().min(1).max(500),
      defaultProctorId: optionalUuid,
    })
    .parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const values = {
    org_id: admin.orgId,
    name: room.name,
    video_url: room.videoUrl,
    capacity: room.capacity,
    default_proctor_id: room.defaultProctorId,
  };
  const { error } = room.id
    ? await supabase.from("rooms").update(values).eq("id", room.id)
    : await supabase.from("rooms").insert(values);
  if (error) throw error;
  refresh();
}

// --- Schedule and sessions -----------------------------------------------------------------------

export async function saveSchedule(formData: FormData) {
  await requireAdmin();
  const schedule = z
    .object({
      id: z.uuid(),
      start: time,
      end: time,
      block: z.coerce.number().int().min(10).max(240),
      break: z.coerce.number().int().min(0).max(60),
    })
    .parse(Object.fromEntries(formData));
  const days = formData.getAll("days").map((d) => z.coerce.number().int().min(1).max(7).parse(d));
  if (!days.length || schedule.end <= schedule.start) await back("/admin/schedule", "?error=schedule");

  const supabase = await createClient();
  const { error } = await supabase
    .from("schedules")
    .update({
      days_of_week: days,
      start_time: schedule.start,
      end_time: schedule.end,
      block_minutes: schedule.block,
      break_minutes: schedule.break,
      active: formData.get("active") === "on",
    })
    .eq("id", schedule.id);
  if (error) throw error;
  refresh();
}

export async function generateNow() {
  await requireAdmin();
  const { created } = await generateSessions();
  const { enrolled, full } = await enrolEligibleStudents();
  await back("/admin/schedule", `?created=${created}&enrolled=${enrolled}&full=${full.length}`);
}

export async function assignSupervisor(formData: FormData) {
  await requireAdmin();
  const { sessionId, proctorId } = z
    .object({ sessionId: z.uuid(), proctorId: optionalUuid })
    .parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.from("sessions").update({ proctor_id: proctorId }).eq("id", sessionId);
  if (error?.code === "23514") await back("/admin/schedule", "?error=wwcc");
  if (error) throw error;
  refresh();
}

export async function setSessionStatus(formData: FormData) {
  await requireAdmin();
  const { sessionId, status } = z
    .object({ sessionId: z.uuid(), status: z.enum(["scheduled", "cancelled"]) })
    .parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.from("sessions").update({ status }).eq("id", sessionId);
  if (error) throw error;
  refresh();
}

// --- Plans --------------------------------------------------------------------------------------

const daysPerWeek = z.union([z.literal(""), z.coerce.number().int().min(1).max(7)]).transform((v) => (v === "" ? null : v));

export async function savePlan(formData: FormData) {
  await requireAdmin();
  const plan = z
    .object({ id: z.uuid(), name: z.string().trim().min(1).max(80), daysPerWeek })
    .parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase
    .from("plans")
    .update({ name: plan.name, days_per_week: plan.daysPerWeek, active: formData.get("active") === "on" })
    .eq("id", plan.id);
  if (error) throw error;
  updateTag("plans"); // the landing page's cached prices
  refresh();
}

/** New plans start inactive: they need a Stripe price (npm run stripe:setup) before going on sale. */
export async function addPlan(formData: FormData) {
  const admin = await requireAdmin();
  const plan = z
    .object({ name: z.string().trim().min(1).max(80), priceCents: z.coerce.number().int().min(0), daysPerWeek })
    .parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.from("plans").insert({
    org_id: admin.orgId,
    name: plan.name,
    price_cents: plan.priceCents,
    days_per_week: plan.daysPerWeek,
    active: false,
  });
  if (error) throw error;
  updateTag("plans");
  refresh();
}

// --- Supervisors and WWCC -----------------------------------------------------------------------

export async function recordCheck(formData: FormData) {
  await requireAdmin();
  const check = z
    .object({ proctorId: z.uuid(), number: z.string().trim().min(3).max(40), expiry: z.iso.date() })
    .parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase
    .from("proctor_checks")
    .insert({ proctor_id: check.proctorId, wwcc_number: check.number, wwcc_expiry: check.expiry });
  if (error) throw error;
  refresh();
}

export async function verifyCheck(formData: FormData) {
  const admin = await requireAdmin();
  const checkId = z.uuid().parse(formData.get("checkId"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("proctor_checks")
    .update({ verified_at: new Date().toISOString(), verified_by: admin.id })
    .eq("id", checkId);
  if (error) throw error;
  refresh();
}

/** Creates a supervisor login (role proctor) and emails them a login link. */
export async function inviteSupervisor(formData: FormData) {
  const admin = await requireAdmin();
  const invite = z
    .object({ fullName: z.string().trim().min(1).max(100), email: z.email().trim().toLowerCase() })
    .parse(Object.fromEntries(formData));
  const service = createAdminClient();
  const { data, error } = await service.auth.admin.createUser({
    email: invite.email,
    email_confirm: true,
    app_metadata: { role: "proctor", org_id: admin.orgId },
    user_metadata: { full_name: invite.fullName },
  });
  if (error || !data.user) await back("/admin/proctors", "?error=invite");
  await service
    .from("profiles")
    .upsert({ id: data.user!.id, org_id: admin.orgId, role: "proctor", full_name: invite.fullName, email: invite.email });

  if (isReservedTestEmail(invite.email)) {
    refresh(); // test account: no email (it would only burn the hourly email quota)
    return;
  }
  const supabase = await createClient();
  const { error: mailError } = await supabase.auth.signInWithOtp({
    email: invite.email,
    options: { shouldCreateUser: false, emailRedirectTo: `${await siteOrigin()}/auth/confirm` },
  });
  if (mailError) console.warn("Supervisor login email not sent", mailError.code ?? mailError.message);
  refresh();
}
