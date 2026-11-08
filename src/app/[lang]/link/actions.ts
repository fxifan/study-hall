"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { TUTOR_LINK_COOKIE, isLinkToken } from "@/lib/tutor/links";

/**
 * Signed out on a tutor's invite: keep the invite in a cookie through sign-up or login, then the
 * student accepts it on /student/tutor (docs/tutor-next-steps.md).
 */
export async function continueWithInvite(formData: FormData) {
  const token = formData.get("token");
  const to = formData.get("to") === "login" ? "/login" : "/join";
  if (isLinkToken(token)) {
    (await cookies()).set(TUTOR_LINK_COOKIE, token, { httpOnly: true, sameSite: "lax", maxAge: 7 * 86400, path: "/" });
  }
  redirect(localizePath(to, await getLocale()));
}
