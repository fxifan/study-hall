import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDaysToDateKey, dateKeyOf } from "@/lib/time";
import {
  DEFAULT_GOAL_MINUTES,
  FULL_WEEK_DAYS,
  FULL_WEEK_POINTS,
  STREAK_LOOKBACK_DAYS,
  STUDY_DAY_POINTS,
  awardLineage,
  streak,
  studyDays,
  studyDaysInWeek,
  weekDots,
  weekStart,
  type DayDot,
} from "./consistency";
import { syncRank, type Promotion } from "./rank-sync";
import { liveSessionFor, sessionSeconds } from "./server";

export type Consistency = {
  goalMinutes: number;
  todayMinutes: number;
  todayCounted: boolean;
  finishedToday: boolean;
  streak: number;
  dots: DayDot[];
  studyDaysThisWeek: number;
  /** The latest "tomorrow" line from a solo check-in, until a newer solo task starts. */
  tomorrow: string | null;
};

/** Everything the streak strip needs, for one student, as of now (Melbourne days). */
export async function consistencyFor(profileId: string): Promise<Consistency> {
  const admin = createAdminClient();
  const today = dateKeyOf();
  const since = addDaysToDateKey(today, -STREAK_LOOKBACK_DAYS);
  const sinceIso = new Date(`${since}T00:00:00+10:00`).toISOString();
  const [settings, sessions, attempts, completions, tutorDone, solo, live] = await Promise.all([
    admin.from("student_settings").select("daily_goal_minutes").eq("profile_id", profileId).maybeSingle(),
    admin.from("study_sessions").select("started_at, credited_seconds, state").eq("profile_id", profileId).gte("started_at", sinceIso),
    admin.from("resource_attempts").select("submitted_at").eq("profile_id", profileId).gte("submitted_at", sinceIso),
    admin.from("points_ledger").select("day").eq("profile_id", profileId).eq("kind", "completion").gte("day", since),
    admin
      .from("tutor_tasks")
      .select("updated_at, tutor_students!inner(linked_profile_id)")
      .eq("tutor_students.linked_profile_id", profileId)
      .eq("updated_by", "student")
      .eq("status", "done")
      .gte("updated_at", sinceIso),
    admin.from("solo_tasks").select("status, day, tomorrow, created_at, finished_at").eq("profile_id", profileId).order("created_at", { ascending: false }).limit(200),
    liveSessionFor(profileId),
  ]);

  const goalMinutes = (settings.data?.daily_goal_minutes as number | undefined) ?? DEFAULT_GOAL_MINUTES;
  const minutesByDay = new Map<string, number>();
  for (const s of sessions.data ?? []) {
    if (s.state !== "stopped") continue; // the live session is added below, with its current credit
    const day = dateKeyOf(s.started_at as string);
    minutesByDay.set(day, (minutesByDay.get(day) ?? 0) + Math.floor((s.credited_seconds as number) / 60));
  }
  if (live) minutesByDay.set(today, (minutesByDay.get(today) ?? 0) + Math.floor((await sessionSeconds(live)) / 60));

  const finished = new Set<string>();
  for (const a of attempts.data ?? []) finished.add(dateKeyOf(a.submitted_at as string));
  for (const c of completions.data ?? []) finished.add(c.day as string);
  for (const t of tutorDone.data ?? []) finished.add(dateKeyOf(t.updated_at as string));
  const soloRows = solo.data ?? [];
  for (const t of soloRows) if ((t.status === "done" || t.status === "partly") && t.day) finished.add(t.day as string);

  const days = studyDays(minutesByDay, finished, goalMinutes);
  const s = streak(days, today);
  const latest = soloRows[0];
  return {
    goalMinutes,
    todayMinutes: minutesByDay.get(today) ?? 0,
    todayCounted: s.todayCounted,
    finishedToday: finished.has(today),
    streak: s.length,
    dots: weekDots(days, s.restDays, today),
    studyDaysThisWeek: studyDaysInWeek(days, today),
    tomorrow: latest && latest.status !== "open" && latest.tomorrow ? (latest.tomorrow as string) : null,
  };
}

/**
 * Award today's study day (+5) and this week's bonus (+15) if earned, once each, then re-sync the
 * rank. Safe to call after anything that might complete a study day; never throws.
 */
export async function awardConsistency(
  profileId: string,
  options: { sync?: boolean } = {},
): Promise<{ points: number; consistency: Consistency | null; promotion: Promotion | null }> {
  try {
    const c = await consistencyFor(profileId);
    const today = dateKeyOf();
    const rows = [];
    if (c.todayCounted) rows.push({ profile_id: profileId, lineage_id: awardLineage(profileId, "study_day", today), kind: "study_day", points: STUDY_DAY_POINTS, day: today });
    if (c.studyDaysThisWeek >= FULL_WEEK_DAYS) {
      const week = weekStart(today);
      rows.push({ profile_id: profileId, lineage_id: awardLineage(profileId, "full_week", week), kind: "full_week", points: FULL_WEEK_POINTS, day: today });
    }
    let points = 0;
    const admin = createAdminClient();
    for (const row of rows) {
      const { error } = await admin.from("points_ledger").insert(row);
      if (!error) points += row.points;
      else if (error.code !== "23505") console.error("Consistency award failed", row.kind, error.code);
    }
    // Callers that sync the rank themselves pass sync: false, so one sync reports the promotion.
    return { points, consistency: c, promotion: points && options.sync !== false ? await syncRank(profileId) : null };
  } catch (e) {
    console.error("Consistency check failed", e instanceof Error ? e.message : e);
    return { points: 0, consistency: null, promotion: null };
  }
}
