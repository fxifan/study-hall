import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, localizePath } from "@/i18n/config";
import { currentTutor, type Tutor } from "@/lib/tutor/server";

// Not in a "use server" file on purpose: these must not become callable endpoints.

export async function requireTutorAction(): Promise<Tutor> {
  const tutor = await currentTutor();
  if (!tutor) throw new Error("Only a signed-in tutor can do this.");
  return tutor;
}

/** Redirect within the app, in the language the tutor last used. */
export async function back(path: string, query = ""): Promise<never> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  redirect(localizePath(path, isLocale(value) ? value : DEFAULT_LOCALE) + query);
}
