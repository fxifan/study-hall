"use server";

import { z } from "zod";
import { sendLoginLink } from "@/lib/email/login";
import { siteOrigin } from "@/lib/site";

/** Error codes, not text: the form shows them in the page's language. */
export type LoginErrorCode = "invalid_email" | "rate_limited" | "email_quota" | "send_failed";

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

  const result = await sendLoginLink(email, { origin: await siteOrigin() });
  if (!result.ok) {
    if (result.reason === "cooldown") return { status: "error", code: "rate_limited" };
    if (result.reason === "quota") return { status: "error", code: "email_quota" };
    return { status: "error", code: "send_failed" };
  }
  return { status: "sent", email };
}
