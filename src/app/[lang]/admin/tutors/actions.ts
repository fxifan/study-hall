"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, localizePath } from "@/i18n/config";
import { getCurrentProfile, type CurrentProfile } from "@/lib/auth";
import { isReservedTestEmail } from "@/lib/email";
import { siteOrigin } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Long enough to mean "until restored"; Supabase takes a Go duration. */
const SUSPENDED = "876000h";

async function requireAdmin(): Promise<CurrentProfile> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") throw new Error("Admins only.");
  return profile;
}

async function back(query: string): Promise<never> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  redirect(localizePath("/admin/tutors", isLocale(value) ? value : DEFAULT_LOCALE) + query);
}

async function audit(profile: CurrentProfile, action: string, tutorId: string) {
  await createAdminClient()
    .from("audit_log")
    .insert({ org_id: profile.orgId, actor_id: profile.id, action, entity: "tutors", entity_id: tutorId });
}

/**
 * Gives someone tutor access (the /app tutor product): creates the login and tutor profile, or
 * restores a suspended tutor, then emails a login link. Like tutor sign-up, it refuses an email
 * that already has a family or staff account, so nobody's existing account changes role.
 */
export async function grantTutorAccess(formData: FormData) {
  const profile = await requireAdmin();
  const parsed = z
    .object({ name: z.string().trim().min(1).max(80), email: z.email().trim().toLowerCase() })
    .safeParse({ name: formData.get("name"), email: formData.get("email") });
  if (!parsed.success) await back("?error=input");
  const { name, email } = parsed.data!;
  const admin = createAdminClient();

  const { data: existing } = await admin.from("profiles").select("id, role").eq("email", email).maybeSingle();
  if (existing && existing.role !== "tutor") await back("?error=taken");

  let tutorId = existing?.id as string | undefined;
  if (!tutorId) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { role: "tutor", org_id: profile.orgId },
      user_metadata: { full_name: name },
    });
    if (error || !created.user) await back("?error=create");
    tutorId = created.user!.id;
    // The profile trigger reads app_metadata; upsert in case it ran without a name.
    await admin.from("profiles").upsert({ id: tutorId, org_id: profile.orgId, role: "tutor", email, full_name: name });
  } else {
    const { error } = await admin.auth.admin.updateUserById(tutorId, { ban_duration: "none" });
    if (error) throw error;
  }
  const { data: row } = await admin.from("tutors").select("id").eq("id", tutorId).maybeSingle();
  if (!row) {
    const { error } = await admin.from("tutors").insert({ id: tutorId, display_name: name });
    if (error) throw error;
  }
  await audit(profile, "tutor_access_granted", tutorId!);

  if (!isReservedTestEmail(email)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: `${await siteOrigin()}/auth/confirm` },
    });
    if (error) {
      console.warn("Tutor login email not sent", error.code ?? error.message);
      await back("?granted=nomail");
    }
  }
  await back("?granted=1");
}

/**
 * Suspends or restores a tutor's login. Suspending blocks sign-in and token refresh (a session
 * already open ends within the hour, when its token expires); their data is kept as it is.
 * Only tutor accounts: this never touches a family or staff login.
 */
export async function setTutorAccess(formData: FormData) {
  const profile = await requireAdmin();
  const parsed = z
    .object({ tutorId: z.uuid(), access: z.enum(["suspend", "restore"]) })
    .parse({ tutorId: formData.get("tutorId"), access: formData.get("access") });
  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("role").eq("id", parsed.tutorId).maybeSingle();
  if (target?.role !== "tutor") throw new Error("Not a tutor account.");
  const { error } = await admin.auth.admin.updateUserById(parsed.tutorId, {
    ban_duration: parsed.access === "suspend" ? SUSPENDED : "none",
  });
  if (error) throw error;
  await audit(profile, parsed.access === "suspend" ? "tutor_access_suspended" : "tutor_access_restored", parsed.tutorId);
  refresh();
}
