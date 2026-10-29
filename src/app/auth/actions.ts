"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, localizePath } from "@/i18n/config";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  redirect(localizePath("/login", isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE));
}
