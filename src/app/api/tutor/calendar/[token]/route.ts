import { createAdminClient } from "@/lib/supabase/admin";
import { TUTOR_PRODUCT_NAME } from "@/lib/tutor/config";
import { buildIcs } from "@/lib/tutor/ics";

/**
 * GET /api/tutor/calendar/<token>: a tutor's lessons as an iCalendar feed, for subscribing from
 * Apple Calendar (webcal://), Google Calendar ("From URL") or Outlook. The unguessable token is the
 * credential (rotated or turned off from the dashboard). Read-only, one-way.
 *
 * What a subscriber sees: lesson times, the student's first name and last initial, subjects, the
 * meeting link and notes. Nothing about families, reports or money.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/tutor/calendar/[token]">) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/, "");
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return new Response("Not found", { status: 404 });
  const admin = createAdminClient();
  const { data: tutor } = await admin
    .from("tutors")
    .select("id, display_name, calendar_feed_fetched_at")
    .eq("calendar_feed_token", token)
    .maybeSingle();
  if (!tutor) return new Response("Not found", { status: 404 });

  const from = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const to = new Date(Date.now() + 365 * 86_400_000).toISOString();
  const { data: lessons } = await admin
    .from("tutor_lessons")
    .select("id, starts_at, duration_min, subjects, notes, status, updated_at, tutor_students(first_name, last_initial), tutor_meeting_links(url)")
    .eq("tutor_id", tutor.id)
    .gte("starts_at", from)
    .lt("starts_at", to)
    .order("starts_at")
    .returns<
      {
        id: string;
        starts_at: string;
        duration_min: number;
        subjects: string[];
        notes: string | null;
        status: string;
        updated_at: string;
        tutor_students: { first_name: string; last_initial: string } | null;
        tutor_meeting_links: { url: string } | null;
      }[]
    >();

  // Record the fetch (at most every 5 minutes) so the dashboard can show sync status.
  const last = tutor.calendar_feed_fetched_at ? Date.parse(tutor.calendar_feed_fetched_at) : 0;
  if (Date.now() - last > 5 * 60_000) {
    await admin.from("tutors").update({ calendar_feed_fetched_at: new Date().toISOString() }).eq("id", tutor.id);
  }

  const body = buildIcs(
    `${TUTOR_PRODUCT_NAME}: ${tutor.display_name}`,
    (lessons ?? []).map((l) => {
      const student = l.tutor_students ? `${l.tutor_students.first_name} ${l.tutor_students.last_initial}.` : "Student";
      return {
        id: l.id,
        startsAt: l.starts_at,
        durationMin: l.duration_min,
        title: `Tutoring: ${student}${l.subjects.length ? ` (${l.subjects.join(", ")})` : ""}`,
        description: [l.notes, l.tutor_meeting_links?.url ? `Join: ${l.tutor_meeting_links.url}` : null].filter(Boolean).join("\n"),
        url: l.tutor_meeting_links?.url ?? null,
        cancelled: l.status === "cancelled",
        updatedAt: l.updated_at,
      };
    }),
  );
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="lessons.ics"',
      "cache-control": "private, max-age=300",
    },
  });
}
