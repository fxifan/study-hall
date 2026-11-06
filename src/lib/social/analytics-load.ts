import "server-only";
import { isReservedTestEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EdumiRows } from "./analytics";

/** Rows for edumiMetrics, with test accounts (*.test, example.com) and admin previews left out. */
export async function loadEdumiRows(from: Date): Promise<EdumiRows> {
  const db = createAdminClient();
  const since = new Date(from.getTime() - 60 * 86_400_000).toISOString();
  const [profiles, students, plans, groups, members, sessions, recaps, help, messages, resources, attempts] = await Promise.all([
    db.from("profiles").select("id, email, role").in("role", ["student", "admin"]),
    db.from("students").select("profile_id, created_at, self_signed, social_enabled").not("profile_id", "is", null),
    db.from("student_plans").select("profile_id, status, payer, trial_ends_at"),
    db.from("study_groups").select("id, created_at, created_by"),
    db.from("study_group_members").select("group_id, profile_id, joined_at"),
    db.from("study_sessions").select("profile_id, group_id, started_at, credited_seconds").eq("state", "stopped").gte("started_at", since),
    db.from("group_recaps").select("day, created_at, group_messages(meta)").gte("created_at", since),
    db.from("group_help_requests").select("state, created_at, requester_id").gte("created_at", since),
    db.from("group_messages").select("id, sender_id").eq("kind", "text").gte("created_at", from.toISOString()),
    db.from("student_resources").select("profile_id, kind, created_at, content, flagged_at").gte("created_at", since),
    db.from("resource_attempts").select("profile_id, submitted_at, correct, total").gte("submitted_at", since),
  ]);
  // Test accounts and admins' Student view profiles don't count.
  const test = new Set((profiles.data ?? []).filter((p) => p.role === "admin" || isReservedTestEmail(p.email as string)).map((p) => p.id as string));
  const real = <T extends { profile_id?: string | null }>(rows: T[] | null) => (rows ?? []).filter((x) => !x.profile_id || !test.has(x.profile_id));
  const realGroups = (groups.data ?? []).filter((g) => !g.created_by || !test.has(g.created_by as string));
  const realGroupIds = new Set(realGroups.map((g) => g.id as string));
  return {
    students: real(students.data) as EdumiRows["students"],
    plans: real(plans.data) as EdumiRows["plans"],
    groups: realGroups.map((g) => ({ id: g.id as string, created_at: g.created_at as string })),
    members: real(members.data).filter((m) => realGroupIds.has(m.group_id as string)) as EdumiRows["members"],
    sessions: real(sessions.data) as EdumiRows["sessions"],
    recaps: (recaps.data ?? []).map((x) => {
      const meta = (x.group_messages as unknown as { meta: { done?: number; target?: number } } | null)?.meta;
      return { day: x.day as string, created_at: x.created_at as string, done: meta?.done ?? null, target: meta?.target ?? null };
    }),
    help: (help.data ?? []).filter((h) => !test.has(h.requester_id as string)).map((h) => ({ state: h.state as string, created_at: h.created_at as string })),
    messages: (messages.data ?? []).filter((m) => !m.sender_id || !test.has(m.sender_id as string)).length,
    resources: real(resources.data).map((x) => ({
      profile_id: x.profile_id as string,
      kind: x.kind as string,
      created_at: x.created_at as string,
      curriculum: Boolean((x.content as { curriculum?: unknown } | null)?.curriculum),
      flagged: Boolean(x.flagged_at),
    })),
    attempts: real(attempts.data) as EdumiRows["attempts"],
  };
}
