import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ROLE_HOME, isRole, roleForPath } from "@/lib/roles";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Runs before every page request. It refreshes the Supabase session cookie, then routes by role:
 *   - signed out on /parent, /student, /proctor or /admin -> /login
 *   - signed in on /login or on another role's area -> their own home
 * Pages check the role again with requireRole(), and RLS guards the data itself.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Validates the JWT and refreshes it if needed. Keep this the first call on the client.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  const { pathname } = request.nextUrl;
  const area = roleForPath(pathname);
  const isLogin = pathname === "/login";
  if (!area && !isLogin) return response;

  if (!userId) {
    return isLogin ? response : redirectKeepingCookies(new URL("/login", request.url), response);
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = isRole(profile?.role) ? profile.role : null;
  if (!role) {
    // A session without a profile shouldn't happen; treat it as signed out rather than loop.
    return isLogin ? response : redirectKeepingCookies(new URL("/login?error=no-profile", request.url), response);
  }

  if (isLogin || area !== role) {
    return redirectKeepingCookies(new URL(ROLE_HOME[role], request.url), response);
  }
  return response;
}

/** A redirect that carries over any refreshed session cookies and no-cache headers. */
function redirectKeepingCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(header);
    if (value) redirect.headers.set(header, value);
  }
  return redirect;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
