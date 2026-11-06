"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { emailLimitKind } from "@/lib/email";
import { track } from "@/lib/events";
import { siteOrigin } from "@/lib/site";
import { canSelfSignUp } from "@/lib/social/age";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type JoinState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "under13" }
  | { status: "error"; message: string };

export const INVITE_COOKIE = "edumi_invite";

const schema = z.object({
  firstName: z.string().trim().min(1).max(50),
  lastInitial: z
    .string()
    .trim()
    .regex(/^\p{L}$/u)
    .transform((v) => v.toUpperCase()),
  yearLevel: z.coerce.number().int().min(7).max(12),
  birthMonth: z.coerce.number().int().min(1).max(12),
  birthYear: z.coerce.number().int().min(1990).max(2030),
  email: z.email().trim().toLowerCase(),
  agree: z.literal("on"),
  invite: z
    .string()
    .regex(/^[A-Za-z0-9]{8,16}$/)
    .optional()
    .or(z.literal("")),
});

/**
 * Student self sign-up (13+, owner decision 6 Nov 2026). Under-13s are told to ask a parent, who
 * adds them from the parent account. Creates the student login (role fixed by app_metadata) and
 * an active, self-signed student record with Edumi switched on, then emails a login link. The
 * 7-day trial starts on first use (student_plans default).
 */
export async function studentSignUp(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Check each field, and tick the box to agree." };
  const d = parsed.data;
  if (!canSelfSignUp(d.birthYear, d.birthMonth)) return { status: "under13" };

  const admin = createAdminClient();
  const name = `${d.firstName} ${d.lastInitial}.`;
  const created = await admin.auth.admin.createUser({
    email: d.email,
    app_metadata: { role: "student" },
    user_metadata: { full_name: name },
  });
  const taken = created.error && (created.error.code === "email_exists" || /already/i.test(created.error.message));
  if (created.error && !taken) {
    console.error("Student sign-up failed", created.error.code);
    return { status: "error", message: "We couldn't create your account. Try again in a minute." };
  }
  if (created.data?.user) {
    const userId = created.data.user.id;
    const { data: profile } = await admin.from("profiles").select("org_id").eq("id", userId).single();
    const student = await admin.from("students").insert({
      org_id: profile?.org_id,
      profile_id: userId,
      first_name: d.firstName,
      last_initial: d.lastInitial,
      year_level: d.yearLevel,
      status: "active",
      self_signed: true,
      social_enabled: true,
      birth_year: d.birthYear,
      birth_month: d.birthMonth,
    });
    if (student.error) {
      await admin.auth.admin.deleteUser(userId);
      console.error("Student record failed", student.error.code);
      return { status: "error", message: "We couldn't create your account. Try again in a minute." };
    }
    await track({ name: "user_signed_up", product: "platform", role: "student", userId, email: d.email, props: { via: "self" }, dedupeKey: `signup:${userId}` });
  }
  if (d.invite) (await cookies()).set(INVITE_COOKIE, d.invite, { httpOnly: true, sameSite: "lax", maxAge: 7 * 86400, path: "/" });

  // An existing account just gets a login link: the form never says whether an email is registered.
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: d.email,
    options: { shouldCreateUser: false, emailRedirectTo: `${await siteOrigin()}/auth/confirm` },
  });
  if (error && error.code !== "otp_disabled" && error.code !== "user_not_found") {
    const limit = emailLimitKind(error);
    if (limit === "cooldown") return { status: "error", message: "Wait a minute before asking for another email." };
    console.error("Student login email failed", error.code);
    return { status: "error", message: "We couldn't send the email. Try again in a minute." };
  }
  return { status: "sent", email: d.email };
}
