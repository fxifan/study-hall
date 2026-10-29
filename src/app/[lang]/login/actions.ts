"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/** Error codes, not text: the form shows them in the page's language. */
export type LoginErrorCode = "invalid_email" | "rate_limited" | "send_failed";

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; code: LoginErrorCode };

const loginSchema = z.object({ email: z.email().trim().toLowerCase() });

/**
 * Email a magic link to an existing account. New parents sign up through /onboarding (Phase 1),
 * so this never creates users. Unknown addresses get the same "check your email" reply, so the form
 * doesn't reveal who has an account.
 */
export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { status: "error", code: "invalid_email" };
  const { email } = parsed.data;

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: new URL("/auth/confirm", siteUrl).toString() },
  });

  if (error) {
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return { status: "error", code: "rate_limited" };
    }
    // otp_disabled / user_not_found: no account with that email. Reply as if it worked.
    if (error.code !== "otp_disabled" && error.code !== "user_not_found") {
      console.error("signInWithOtp failed", error.code, error.message);
      return { status: "error", code: "send_failed" };
    }
  }
  return { status: "sent", email };
}
