import { createClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";
import { DEFAULT_TIMETABLE, type TimetableBlock } from "@/lib/timetable";

/**
 * The session blocks families see, from active schedules (read as a signed-out visitor; migration
 * public_timetable exposes the times only). Cached and tagged "timetable"; schedule edits in
 * /admin/schedule refresh it. Falls back to the default block if no schedule is active.
 */
export async function getPublicTimetable(): Promise<TimetableBlock[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("timetable");

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("schedules")
    .select("days_of_week, start_time, end_time, block_minutes, break_minutes")
    .eq("active", true);
  if (error) throw new Error(`Loading the timetable: ${error.message}`);
  if (!data?.length) return DEFAULT_TIMETABLE;
  return data.map((s) => ({
    days: s.days_of_week,
    start: s.start_time.slice(0, 5),
    end: s.end_time.slice(0, 5),
    blockMinutes: s.block_minutes,
    breakMinutes: s.break_minutes,
  }));
}
