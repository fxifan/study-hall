import { postRecapIfDue, sweepStale, type Group } from "@/lib/social/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily (vercel.json, just after Melbourne midnight): close study sessions whose device went quiet
 * and post each group's day-end recap. Both are idempotent, and group pages also run them lazily,
 * so a missed or doubled run changes nothing.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  await sweepStale();
  const { data: groups } = await createAdminClient().from("study_groups").select("id, name, timezone, daily_target_minutes, next_target_minutes").is("archived_at", null);
  let recaps = 0;
  for (const g of (groups ?? []) as Group[]) if (await postRecapIfDue(g).catch((e) => (console.error("Recap failed", g.id, e), false))) recaps++;
  return Response.json({ groups: groups?.length ?? 0, recaps });
}
