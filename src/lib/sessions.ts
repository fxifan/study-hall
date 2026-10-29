import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@/lib/subscription-status";
import { createAdminClient } from "@/lib/supabase/admin";
import { placeStudentsInSlot, type SessionWithRoom } from "@/lib/enrolment";
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
  rooms: { default_proctor_id: string | null; default_tutor_id: string | null } | null;
};

/**
 * Create sessions from active schedules for the next SESSION_HORIZON_DAYS calendar days in each
 * schedule's timezone, then fill any empty supervisor/tutor slot on upcoming sessions from the room's
 * defaults. Idempotent: (room_id, starts_at) is unique, so re-runs add nothing. Staff are assigned
 * only on days their verified WWCC covers (the DB enforces it too).
 */
export async function generateSessions(now = new Date()): Promise<{ created: number; staffed: number }> {
  const admin = createAdminClient();
  const { data: schedules, error } = await admin
    .from("schedules")
    .select("id, room_id, days_of_week, start_time, end_time, timezone, rooms(default_proctor_id, default_tutor_id)")
    .eq("active", true)
    .returns<Schedule[]>();
  if (error) throw error;

  const covered = new Map<string, string | null>();
  const coveredOn = async (person: string | null, day: string) => {
    if (!person) return null;
    if (!covered.has(person)) covered.set(person, await wwccCoveredUntil(admin, person));
    const until = covered.get(person);
    return until && until >= day ? person : null;
  };

  const rows = [];
  for (const schedule of schedules ?? []) {
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
        proctor_id: await coveredOn(schedule.rooms?.default_proctor_id ?? null, day),
        tutor_id: await coveredOn(schedule.rooms?.default_tutor_id ?? null, day),
      });
    }
  }

  let created = 0;
  if (rows.length) {
    const { data: inserted, error: insertError } = await admin
      .from("sessions")
      .upsert(rows, { onConflict: "room_id,starts_at", ignoreDuplicates: true })
      .select("id");
    if (insertError) throw insertError;
    created = inserted?.length ?? 0;
  }

  // Existing upcoming sessions with an empty slot pick up the room's current default.
  const { data: unstaffed } = await admin
    .from("sessions")
    .select("id, starts_at, proctor_id, tutor_id, rooms(default_proctor_id, default_tutor_id)")
    .neq("status", "cancelled")
    .gt("starts_at", now.toISOString())
    .or("proctor_id.is.null,tutor_id.is.null")
    .returns<{ id: string; starts_at: string; proctor_id: string | null; tutor_id: string | null; rooms: Schedule["rooms"] }[]>();
  let staffed = 0;
  for (const session of unstaffed ?? []) {
    const day = dateKeyOf(session.starts_at);
    const update: { proctor_id?: string; tutor_id?: string } = {};
    const proctor = session.proctor_id ? null : await coveredOn(session.rooms?.default_proctor_id ?? null, day);
    const tutor = session.tutor_id ? null : await coveredOn(session.rooms?.default_tutor_id ?? null, day);
    if (proctor) update.proctor_id = proctor;
    if (tutor) update.tutor_id = tutor;
    if (!Object.keys(update).length) continue;
    const { error: staffError } = await admin.from("sessions").update(update).eq("id", session.id);
    if (staffError) throw staffError;
    staffed++;
  }
  return { created, staffed };
}

/** The last day (yyyy-MM-dd) a person's verified WWCC is valid, or null. */
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
    .select("id, starts_at, rooms(name, capacity), enrolments(student_id)")
    .neq("status", "cancelled")
    .gt("ends_at", now.toISOString())
    .order("starts_at")
    .returns<SessionWithRoom[]>();
  if (sessionsError) throw sessionsError;

  const result: EnrolResult = { enrolled: 0, full: [] };
  for (const [startsAt, slot] of groupBy(sessions ?? [], (s) => s.starts_at)) {
    const { assignments, unplaced } = placeStudentsInSlot(slot, eligible);
    if (assignments.length) {
      const { error: enrolError } = await admin.from("enrolments").insert(assignments);
      if (enrolError) throw enrolError;
      result.enrolled += assignments.length;
    }
    if (unplaced) result.full.push({ sessionId: slot[0].id, startsAt, notEnrolled: unplaced });
  }
  return result;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}
