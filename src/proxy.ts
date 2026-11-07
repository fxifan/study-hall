import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  DEFAULT_LOCALE,
  LOCALE_CHOICE_COOKIE,
  LOCALE_CHOICE_PARAM,
  LOCALE_COOKIE,
  isLocale,
  localizePath,
  negotiateLocale,
  splitLocale,
  type Locale,
} from "@/i18n/config";
import { ROLE_HOME, canEnterArea, isRole, roleForPath } from "@/lib/roles";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Runs before every page request. In order, it:
 *   1. refreshes the Supabase session cookie;
 *   2. picks the language: /zh/… is Chinese; /en/… redirects to the unprefixed English URL; an
 *      unprefixed URL is English unless the language switch's remembered choice or, without one,
 *      the browser's Accept-Language says Chinese, in which case it redirects to /zh/…. Merely
 *      opening a /zh link doesn't change that. English is served by rewriting to app/en/…;
 *   3. routes by role, in that language:
 *      - signed out on /parent, /student, /proctor or /admin -> /login
 *      - signed in on /login or on another role's area -> their own home (admins may also use
 *        the supervisor area)
 *      - /onboarding is for signed-out visitors and parents only
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

  // Supabase sends an email link to the project's Site URL (the home page) when the link's own
  // redirect isn't on its allow list, so a sign-in code or token can arrive on any page. Finish it.
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  if (code && /^[0-9a-f-]{36}$/i.test(code)) {
    return finish(NextResponse.redirect(new URL(`/auth/confirm?code=${code}`, request.url)), response);
  }
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  if (tokenHash && /^[0-9a-f]+$/i.test(tokenHash) && type && /^[a-z_]+$/.test(type)) {
    return finish(NextResponse.redirect(new URL(`/auth/confirm?token_hash=${tokenHash}&type=${type}`, request.url)), response);
  }

  // --- Language -------------------------------------------------------------
  const { locale: urlLocale, path } = splitLocale(pathname);
  if (urlLocale === "en") {
    // /en/… is how the language switch picks English: remember it, then show the canonical URL.
    return finish(NextResponse.redirect(new URL(path + search, request.url)), response, "en", true);
  }
  const chosen = params.get(LOCALE_CHOICE_PARAM);
  if (urlLocale && chosen === urlLocale) {
    // /zh/…?lang=zh is how the language switch picks Chinese: remember it, then drop the parameter.
    const clean = new URL(request.url);
    clean.searchParams.delete(LOCALE_CHOICE_PARAM);
    return finish(NextResponse.redirect(clean), response, urlLocale, true);
  }
  const choice = request.cookies.get(LOCALE_CHOICE_COOKIE)?.value;
  const locale: Locale =
    urlLocale ?? (isLocale(choice) ? choice : negotiateLocale(request.headers.get("accept-language")));
  if (!urlLocale && locale !== DEFAULT_LOCALE) {
    return finish(NextResponse.redirect(new URL(localizePath(path, locale) + search, request.url)), response);
  }
  const at = (target: string) => new URL(localizePath(target, locale), request.url);
  // Chinese URLs exist as app/zh/…; English ones are served from app/en/….
  const serve = () =>
    finish(
      urlLocale ? response : NextResponse.rewrite(new URL(`/en${path === "/" ? "" : path}${search}`, request.url), { request }),
      response,
      locale,
    );

  // --- Role routing ---------------------------------------------------------
  const area = roleForPath(path);
  const isLogin = path === "/login";
  // Sign-up: open to signed-out visitors and parents; the checkout return page needs a session.
  const isOnboarding = path === "/onboarding" || path.startsWith("/onboarding/");
  // The tutor product's public page: signed-in tutors go straight to their dashboard (/app).
  const isTutorLanding = path === "/tutors";
  if (!area && !isLogin && !isOnboarding && !(isTutorLanding && userId)) return serve();

  if (!userId) {
    return isLogin || path === "/onboarding" ? serve() : finish(NextResponse.redirect(at("/login")), response);
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = isRole(profile?.role) ? profile.role : null;
  if (!role) {
    // A session without a profile shouldn't happen; treat it as signed out rather than loop.
    return isLogin ? serve() : finish(NextResponse.redirect(at("/login?error=no-profile")), response);
  }

  if (isTutorLanding) {
    return role === "tutor" ? finish(NextResponse.redirect(at(ROLE_HOME.tutor)), response) : serve();
  }
  if (isOnboarding) {
    return role === "parent" ? serve() : finish(NextResponse.redirect(at(ROLE_HOME[role])), response);
  }
  if (isLogin || !area || !canEnterArea(role, area)) return finish(NextResponse.redirect(at(ROLE_HOME[role])), response);
  return serve();
}

/**
 * Copy any refreshed session cookies and no-cache headers from `from` onto the outgoing response,
 * record the language being served (for server actions), and remember an explicit choice.
 */
function finish(outgoing: NextResponse, from: NextResponse, servedLocale?: Locale, chosen = false) {
  if (outgoing !== from) {
    from.cookies.getAll().forEach((cookie) => outgoing.cookies.set(cookie));
    for (const header of ["cache-control", "expires", "pragma"]) {
      const value = from.headers.get(header);
      if (value) outgoing.headers.set(header, value);
    }
  }
  const year = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" } as const;
  if (servedLocale) outgoing.cookies.set(LOCALE_COOKIE, servedLocale, year);
  if (servedLocale && chosen) outgoing.cookies.set(LOCALE_CHOICE_COOKIE, servedLocale, year);
  return outgoing;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webm|mp4|vtt|webmanifest)$).*)"],
};
