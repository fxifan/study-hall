import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { ROLE_HOME, isRole, type Role } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export type CurrentProfile = {
  id: string;
  orgId: string;
  role: Role;
  fullName: string | null;
  email: string;
};

/** The signed-in user's profile, or null. Reads the session, so render it inside <Suspense>. */
export const getCurrentProfile = cache(async (): Promise<CurrentProfile | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id, role, full_name, email")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || !isRole(profile.role)) return null;

  return {
    id: profile.id,
    orgId: profile.org_id,
    role: profile.role,
    fullName: profile.full_name,
    email: profile.email,
  };
});

/**
 * Use at the top of every role page: redirects anyone who isn't `role`, staying in the page's
 * language. Server Components only (it reads the [lang] root param); Server Actions should call
 * getCurrentProfile() and throw instead.
 */
export async function requireRole(role: Role): Promise<CurrentProfile> {
  const profile = await getCurrentProfile();
  const locale = await getLocale();
  if (!profile) redirect(localizePath("/login", locale));
  if (profile.role !== role) redirect(localizePath(ROLE_HOME[profile.role], locale));
  return profile;
}
