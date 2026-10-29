import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  localizePath,
  negotiateLocale,
  splitLocale,
  type Locale,
} from "@/i18n/config";
import { ROLE_HOME, isRole, roleForPath } from "@/lib/roles";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Runs before every page request. In order, it:
 *   1. refreshes the Supabase session cookie;
 *   2. picks the language: /zh/… is Chinese; /en/… redirects to the unprefixed English URL; an
 *      unprefixed URL is English unless the locale cookie or the browser's Accept-Language says
 *      Chinese, in which case it redirects to /zh/…. English is served by rewriting to app/en/…;
 *   3. routes by role, in that language:
 *      - signed out on /parent, /student, /proctor or /admin -> /login
 *      - signed in on /login or on another role's area -> their own home
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

  const { pathname, search } = request.nextUrl;
  // Route handlers (/auth/confirm, later /api/*) aren't localized.
  if (pathname.startsWith("/auth/") || pathname.startsWith("/api/")) return response;

  // --- Language -------------------------------------------------------------
  const { locale: urlLocale, path } = splitLocale(pathname);
  if (urlLocale === "en") {
    // /en/… is how the language switch picks English: remember it, then show the canonical URL.
    return finish(NextResponse.redirect(new URL(path + search, request.url)), response, "en");
  }
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale: Locale =
    urlLocale ?? (isLocale(cookieLocale) ? cookieLocale : negotiateLocale(request.headers.get("accept-language")));
  if (!urlLocale && locale !== DEFAULT_LOCALE) {
    return finish(NextResponse.redirect(new URL(localizePath(path, locale) + search, request.url)), response);
  }
  const at = (target: string) => new URL(localizePath(target, locale), request.url);
  // Chinese URLs exist as app/zh/…; English ones are served from app/en/….
  const serve = () =>
    finish(
      urlLocale ? response : NextResponse.rewrite(new URL(`/en${path === "/" ? "" : path}${search}`, request.url), { request }),
      response,
      urlLocale ?? undefined,
    );

  // --- Role routing ---------------------------------------------------------
  const area = roleForPath(path);
  const isLogin = path === "/login";
  if (!area && !isLogin) return serve();

  if (!userId) {
    return isLogin ? serve() : finish(NextResponse.redirect(at("/login")), response);
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = isRole(profile?.role) ? profile.role : null;
  if (!role) {
    // A session without a profile shouldn't happen; treat it as signed out rather than loop.
    return isLogin ? serve() : finish(NextResponse.redirect(at("/login?error=no-profile")), response);
  }

  if (isLogin || area !== role) return finish(NextResponse.redirect(at(ROLE_HOME[role])), response);
  return serve();
}

/**
 * Copy any refreshed session cookies and no-cache headers from `from` onto the outgoing response,
 * and remember an explicitly chosen locale.
 */
function finish(outgoing: NextResponse, from: NextResponse, rememberLocale?: Locale) {
  if (outgoing !== from) {
    from.cookies.getAll().forEach((cookie) => outgoing.cookies.set(cookie));
    for (const header of ["cache-control", "expires", "pragma"]) {
      const value = from.headers.get(header);
      if (value) outgoing.headers.set(header, value);
    }
  }
  if (rememberLocale) {
    outgoing.cookies.set(LOCALE_COOKIE, rememberLocale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  return outgoing;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
