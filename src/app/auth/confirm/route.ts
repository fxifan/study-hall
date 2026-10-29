import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { ROLE_HOME, isRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["email", "magiclink", "invite", "signup", "recovery", "email_change"];

/**
 * Where magic links land. Supports both link styles:
 *   ?token_hash=…&type=email  from supabase/templates/magic_link.html (works on any device)
 *   ?code=…                    from Supabase's default template (PKCE; same browser only)
 * On success it sends the user to their role's home page.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const supabase = await createClient();
  let userId: string | undefined;

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) userId = data.user?.id;
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) userId = data.user?.id;
  }

  if (!userId) return NextResponse.redirect(new URL("/login?error=link", request.url));

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const home = isRole(profile?.role) ? ROLE_HOME[profile.role] : "/login?error=no-profile";
  return NextResponse.redirect(new URL(home, request.url));
}
