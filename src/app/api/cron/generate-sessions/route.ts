import { enrolEligibleStudents, generateSessions } from "@/lib/sessions";

/**
 * Daily (vercel.json): create sessions 14 days ahead from the schedules, then enrol active students.
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
  return Response.json({ sessions, enrolments });
}
