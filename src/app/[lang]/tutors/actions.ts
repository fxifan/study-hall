"use server";

import { z } from "zod";
import { emailLimitKind, isReservedTestEmail } from "@/lib/email";
import { siteOrigin } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SignUpState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email().trim().toLowerCase(),
  terms: z.literal("on"),
});

/**
 * Tutor sign-up (spec §3.1): create the account as a tutor, then email a magic link.
 *
 * The role is set server-side in app_metadata (the only place the profile trigger trusts), so a
 * tutor account is never a parent account first. The 14-day trial starts now. An email that
 * already has a Edumi family or staff account is refused rather than converted.
 */
export async function signUpTutor(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const parsed = schema.safeParse({ name: formData.get("name"), email: formData.get("email"), terms: formData.get("terms") });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues.some((i) => i.path[0] === "terms") ? "Please accept the terms." : "Check your name and email." };
  }
  const { name, email } = parsed.data;
  const admin = createAdminClient();

  const { data: existing } = await admin.from("profiles").select("id, role").eq("email", email).maybeSingle();
  if (existing && existing.role !== "tutor") {
    return { status: "error", message: "That email already has a Edumi family or staff account. Please use a different email." };
  }
  if (!existing) {
    const { data: orgs } = await admin.from("orgs").select("id").order("created_at").limit(1);
    const orgId = orgs?.[0]?.id;
    if (!orgId) return { status: "error", message: "Sign-up isn't available right now." };
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: false,
      app_metadata: { role: "tutor", org_id: orgId },
      user_metadata: { full_name: name },
    });
    if (error || !created.user) {
      console.error("Tutor sign-up failed", error?.code ?? error?.message);
      return { status: "error", message: "Couldn't create your account. Try again in a minute." };
    }
    const { error: rowError } = await admin.from("tutors").insert({ id: created.user.id, display_name: name });
    if (rowError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return { status: "error", message: "Couldn't create your account. Try again in a minute." };
    }
  }

  // Seeded and test addresses can't receive mail: don't burn the auth email quota on them.
  if (isReservedTestEmail(email)) return { status: "sent", email };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${await siteOrigin()}/auth/confirm` },
  });
  if (error) {
    const limit = emailLimitKind(error);
    if (limit === "cooldown") return { status: "error", message: "We just sent you a link. Wait a minute before asking for another." };
    console.error("Tutor sign-up email failed", error.code, error.message);
    return { status: "error", message: "Your account is ready, but the email didn't send. Log in from the login page in a minute." };
  }
  return { status: "sent", email };
}
