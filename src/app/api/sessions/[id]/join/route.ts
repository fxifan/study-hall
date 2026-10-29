import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, localizePath } from "@/i18n/config";
import { createClient } from "@/lib/supabase/server";

/**
 * The Join button (spec §4.2): records check-in through public.check_in (which requires enrolment,
 * an open session and at least one goal), then sends the student to the room's external video link.
 * Opened in a new tab; on failure it returns to /student with a reason.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/sessions/[id]/join">) {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
  const back = (reason: string) =>
    NextResponse.redirect(new URL(`${localizePath("/student", locale)}?error=${reason}`, request.url));

  const sessionId = z.uuid().safeParse((await params).id);
  if (!sessionId.success) return back("join");

  const supabase = await createClient();
  const { data: videoUrl, error } = await supabase.rpc("check_in", { p_session: sessionId.data });
  if (error || typeof videoUrl !== "string") {
    if (error?.message.includes("goal")) return back("goals");
    if (error?.message.includes("not open") || error?.message.includes("cancelled")) return back("closed");
    return back("join");
  }
  return NextResponse.redirect(videoUrl);
}
