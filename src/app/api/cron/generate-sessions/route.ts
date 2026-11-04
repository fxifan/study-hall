import { deleteEndedFamilies } from "@/lib/retention";
import { enrolEligibleStudents, generateSessions } from "@/lib/sessions";

/**
 * Daily (vercel.json): create sessions 14 days ahead from the schedules, enrol active students, and
 * delete families whose subscription ended more than 7 days ago (src/lib/retention.ts).
 * Vercel Cron sends "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const sessions = await generateSessions();
  const enrolments = await enrolEligibleStudents();
  if (enrolments.full.length) console.warn("Sessions at capacity", enrolments.full);
  const deleted = await deleteEndedFamilies();
  return Response.json({ sessions, enrolments, deleted });
}
