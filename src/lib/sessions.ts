import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@/lib/subscription-status";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDaysToDateKey, dateKeyOf, isoWeekdayOfDateKey, zonedDateTimeToUtc } from "@/lib/time";

/** How far ahead sessions are generated (spec §6: cron creates sessions 14 days ahead). */
export const SESSION_HORIZON_DAYS = 14;

type Schedule = {
  id: string;
  room_id: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  timezone: string;
  rooms: { default_proctor_id: string | null } | null;
};

/**
 * Create sessions from active schedules for the next SESSION_HORIZON_DAYS calendar days in each
 * schedule's timezone. Idempotent: (room_id, starts_at) is unique, so re-runs add nothing. The room's
 * default proctor is assigned only on days their verified WWCC covers (the DB enforces it too).
 */
export async function generateSessions(now = new Date()): Promise<{ created: number }> {
  const admin = createAdminClient();
  const { data: schedules, error } = await admin
    .from("schedules")
    .select("id, room_id, days_of_week, start_time, end_time, timezone, rooms(default_proctor_id)")
    .eq("active", true)
    .returns<Schedule[]>();
  if (error) throw error;

  const rows = [];
  for (const schedule of schedules ?? []) {
    const proctorId = schedule.rooms?.default_proctor_id ?? null;
    const coveredUntil = proctorId ? await wwccCoveredUntil(admin, proctorId) : null;
    const today = dateKeyOf(now, schedule.timezone);
    for (let d = 0; d < SESSION_HORIZON_DAYS; d++) {
      const day = addDaysToDateKey(today, d);
      if (!schedule.days_of_week.includes(isoWeekdayOfDateKey(day))) continue;
      const startsAt = zonedDateTimeToUtc(day, schedule.start_time, schedule.timezone);
      const endsAt = zonedDateTimeToUtc(day, schedule.end_time, schedule.timezone);
      if (endsAt <= now) continue;
      rows.push({
        room_id: schedule.room_id,
        schedule_id: schedule.id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        proctor_id: coveredUntil && coveredUntil >= day ? proctorId : null,
      });
    }
  }
  if (!rows.length) return { created: 0 };

  const { data: inserted, error: insertError } = await admin
    .from("sessions")
    .upsert(rows, { onConflict: "room_id,starts_at", ignoreDuplicates: true })
    .select("id");
  if (insertError) throw insertError;
  return { created: inserted?.length ?? 0 };
}

/** The last day (yyyy-MM-dd) a proctor's verified WWCC is valid, or null. */
async function wwccCoveredUntil(admin: SupabaseClient, proctorId: string): Promise<string | null> {
  const { data } = await admin
    .from("proctor_checks")
    .select("wwcc_expiry")
    .eq("proctor_id", proctorId)
    .not("verified_at", "is", null)
    .order("wwcc_expiry", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.wwcc_expiry ?? null;
}

export type EnrolResult = { enrolled: number; full: { sessionId: string; startsAt: string; notEnrolled: number }[] };

/**
 * Enrol active students on unlimited plans into every upcoming session that isn't cancelled.
 * Respects room capacity: when a session is full, the remaining students are reported in `full`
 * rather than silently skipped (product brief §8). Plans with days_per_week set need a day picker,
 * which isn't built yet, so their students aren't auto-enrolled.
 */
export async function enrolEligibleStudents(options: { studentIds?: string[]; now?: Date } = {}): Promise<EnrolResult> {
  const admin = createAdminClient();
  const now = options.now ?? new Date();

  let query = admin.from("students").select("id, created_at, parent_students(parent_id)").eq("status", "active");
  if (options.studentIds) query = query.in("id", options.studentIds);
  const { data: students, error } = await query.order("created_at");
  if (error) throw error;
  if (!students?.length) return { enrolled: 0, full: [] };

  const parentIds = [...new Set(students.flatMap((s) => s.parent_students.map((p) => p.parent_id)))];
  const { data: subs } = await admin
    .from("subscriptions")
    .select("parent_id, plans(days_per_week)")
    .in("parent_id", parentIds)
    .in("status", [...ACTIVE_SUBSCRIPTION_STATUSES])
    .returns<{ parent_id: string; plans: { days_per_week: number | null } | null }[]>();
  const unlimitedParents = new Set((subs ?? []).filter((s) => s.plans && s.plans.days_per_week === null).map((s) => s.parent_id));
  const eligible = students.filter((s) => s.parent_students.some((p) => unlimitedParents.has(p.parent_id))).map((s) => s.id);
  if (!eligible.length) return { enrolled: 0, full: [] };

  const { data: sessions, error: sessionsError } = await admin
    .from("sessions")
    .select("id, starts_at, rooms(capacity), enrolments(student_id)")
    .neq("status", "cancelled")
    .gt("ends_at", now.toISOString())
    .order("starts_at")
    .returns<{ id: string; starts_at: string; rooms: { capacity: number } | null; enrolments: { student_id: string }[] }[]>();
  if (sessionsError) throw sessionsError;

  const result: EnrolResult = { enrolled: 0, full: [] };
  for (const session of sessions ?? []) {
    const already = new Set(session.enrolments.map((e) => e.student_id));
    const wanted = eligible.filter((id) => !already.has(id));
    if (!wanted.length) continue;
    const room = Math.max(0, (session.rooms?.capacity ?? 0) - already.size);
    const fits = wanted.slice(0, room);
    if (fits.length) {
      const { error: enrolError } = await admin
        .from("enrolments")
        .insert(fits.map((studentId) => ({ session_id: session.id, student_id: studentId })));
      if (enrolError) throw enrolError;
      result.enrolled += fits.length;
    }
    if (wanted.length > fits.length) {
      result.full.push({ sessionId: session.id, startsAt: session.starts_at, notEnrolled: wanted.length - fits.length });
    }
  }
  return result;
}
