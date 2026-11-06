import "server-only";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { getCurrentProfile, type CurrentProfile } from "@/lib/auth";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@/lib/subscription-status";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDaysToDateKey } from "@/lib/time";
import {
  BEAT_GRACE_SECONDS,
  STALE_SECONDS,
  dayWindow,
  formatMinutes,
  goalProgress,
  groupDayOf,
  planBeat,
  secondsByMember,
  standouts,
  type CreditInterval,
} from "./credit";

/**
 * Server side of Edumi's student social core (docs/student-social.md). Every function here runs
 * after the caller is known: pages use requireSocialStudent(), actions use socialActor(). Writes
 * go through the service role, because timing, credit and messages from the system are
 * server-authoritative; members read their own groups through RLS-equivalent checks below.
 */

export type StudentRow = {
  id: string;
  first_name: string;
  last_initial: string;
  year_level: number;
  status: string;
  social_enabled: boolean;
  self_signed: boolean;
  chat_suspended_until: string | null;
};

export type Access =
  | { kind: "trial"; trialEndsAt: string }
  | { kind: "paid"; periodEnd: string | null }
  | { kind: "studyhall" }
  | { kind: "expired"; trialEndsAt: string }
  | { kind: "disabled" };

export type SocialStudent = { profile: CurrentProfile; student: StudentRow; access: Access };

export const STUDENT_PRICE_CENTS = 1199;

export const hasAccess = (a: Access) => a.kind === "trial" || a.kind === "paid" || a.kind === "studyhall";

export function displayName(s: { first_name: string; last_initial: string }): string {
  return `${s.first_name} ${s.last_initial}.`;
}

export function token(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

/** An 8-character invite code without look-alike characters. */
export function inviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

async function accessFor(student: StudentRow, profileId: string): Promise<Access> {
  if (!student.social_enabled) return { kind: "disabled" };
  const admin = createAdminClient();
  // Families on a Study Hall plan get Edumi with it.
  const { data: parents } = await admin.from("parent_students").select("parent_id").eq("student_id", student.id);
  const parentIds = (parents ?? []).map((p) => p.parent_id as string);
  if (parentIds.length) {
    const { count } = await admin
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .in("parent_id", parentIds)
      .in("status", [...ACTIVE_SUBSCRIPTION_STATUSES]);
    if (count) return { kind: "studyhall" };
  }
  let { data: plan } = await admin.from("student_plans").select("status, trial_ends_at, current_period_end").eq("profile_id", profileId).maybeSingle();
  if (!plan) {
    const created = await admin.from("student_plans").insert({ profile_id: profileId }).select("status, trial_ends_at, current_period_end").single();
    if (created.error) throw created.error;
    plan = created.data;
  }
  if (plan.status === "active" || plan.status === "past_due") return { kind: "paid", periodEnd: plan.current_period_end };
  if (Date.parse(plan.trial_ends_at) > Date.now() && plan.status === "trialing") return { kind: "trial", trialEndsAt: plan.trial_ends_at };
  return { kind: "expired", trialEndsAt: plan.trial_ends_at };
}

export async function loadSocialStudent(profile: CurrentProfile): Promise<SocialStudent | null> {
  if (profile.role !== "student") return null;
  const { data: student } = await createAdminClient()
    .from("students")
    .select("id, first_name, last_initial, year_level, status, social_enabled, self_signed, chat_suspended_until")
    .eq("profile_id", profile.id)
    .maybeSingle<StudentRow>();
  if (!student) return null;
  return { profile, student, access: await accessFor(student, profile.id) };
}

/** Pages: a signed-in student with Edumi switched on. Paid features also need `paid`. */
export async function requireSocialStudent(options: { paid?: boolean } = { paid: true }): Promise<SocialStudent> {
  const [profile, locale] = await Promise.all([getCurrentProfile(), getLocale()]);
  if (!profile) redirect(localizePath("/login", locale));
  const me = await loadSocialStudent(profile);
  if (!me) redirect(localizePath(profile.role === "student" ? "/student" : "/", locale));
  if (options.paid !== false && !hasAccess(me.access)) redirect(localizePath("/student/plan", locale));
  return me;
}

/** Server Actions: throws instead of redirecting. */
export async function socialActor(options: { paid?: boolean } = { paid: true }): Promise<SocialStudent> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Sign in first.");
  const me = await loadSocialStudent(profile);
  if (!me) throw new Error("Only students can do this.");
  if (options.paid !== false && !hasAccess(me.access)) throw new Error("Your Edumi trial has ended. Subscribe to keep going.");
  return me;
}

// --- Groups -----------------------------------------------------------------------------------

export type Group = { id: string; name: string; timezone: string; daily_target_minutes: number; next_target_minutes: number | null };
export type Member = {
  profile_id: string;
  role: string;
  share_status: boolean;
  board_opt_in: boolean;
  spotlight_opt_in: boolean;
  muted: boolean;
  name: string;
};

export async function isMember(groupId: string, profileId: string): Promise<boolean> {
  const { count } = await createAdminClient()
    .from("study_group_members")
    .select("group_id", { count: "exact", head: true })
    .eq("group_id", groupId)
    .eq("profile_id", profileId);
  return Boolean(count);
}

export async function requireMember(groupId: string, profileId: string): Promise<Group> {
  if (!/^[0-9a-f-]{36}$/i.test(groupId) || !(await isMember(groupId, profileId))) throw new Error("You're not in this group.");
  const { data, error } = await createAdminClient()
    .from("study_groups")
    .select("id, name, timezone, daily_target_minutes, next_target_minutes")
    .eq("id", groupId)
    .is("archived_at", null)
    .single<Group>();
  if (error || !data) throw new Error("This group no longer exists.");
  return data;
}

export async function groupMembers(groupId: string): Promise<Member[]> {
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("study_group_members")
    .select("profile_id, role, share_status, board_opt_in, spotlight_opt_in, muted, joined_at")
    .eq("group_id", groupId)
    .order("joined_at");
  if (error) throw error;
  const ids = (rows ?? []).map((r) => r.profile_id as string);
  const names = await namesFor(ids);
  return (rows ?? []).map((r) => ({ ...(r as Omit<Member, "name">), name: names.get(r.profile_id as string) ?? "Student" }));
}

export async function namesFor(profileIds: string[]): Promise<Map<string, string>> {
  if (!profileIds.length) return new Map();
  const { data } = await createAdminClient().from("students").select("profile_id, first_name, last_initial").in("profile_id", profileIds);
  return new Map((data ?? []).map((s) => [s.profile_id as string, displayName(s as { first_name: string; last_initial: string })]));
}

/**
 * Today's target, snapshotted once per group day. A target edit is saved as next_target_minutes
 * and becomes the target when the next day's snapshot is taken.
 */
export async function ensureDayTarget(group: Group, day: string): Promise<number> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("group_day_targets").select("target_minutes").eq("group_id", group.id).eq("day", day).maybeSingle();
  if (existing) return existing.target_minutes as number;
  const target = group.next_target_minutes ?? group.daily_target_minutes;
  await admin.from("group_day_targets").upsert({ group_id: group.id, day, target_minutes: target }, { onConflict: "group_id,day", ignoreDuplicates: true });
  if (group.next_target_minutes !== null) {
    await admin.from("study_groups").update({ daily_target_minutes: target, next_target_minutes: null }).eq("id", group.id);
  }
  const { data } = await admin.from("group_day_targets").select("target_minutes").eq("group_id", group.id).eq("day", day).single();
  return (data?.target_minutes as number) ?? target;
}

type IntervalRow = { profile_id: string; started_at: string; ended_at: string | null; study_sessions: { last_beat_at: string } | null };

async function intervalsBetween(filter: { groupId?: string; profileIds?: string[] }, from: Date, to: Date): Promise<CreditInterval[]> {
  let q = createAdminClient()
    .from("study_intervals")
    .select("profile_id, started_at, ended_at, study_sessions(last_beat_at)")
    .lt("started_at", to.toISOString())
    .or(`ended_at.is.null,ended_at.gt.${from.toISOString()}`);
  if (filter.groupId) q = q.eq("group_id", filter.groupId);
  if (filter.profileIds) q = q.in("profile_id", filter.profileIds);
  const { data, error } = await q.returns<IntervalRow[]>();
  if (error) throw error;
  return (data ?? []).map((r) => ({
    profileId: r.profile_id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    lastBeatAt: r.study_sessions?.last_beat_at ?? r.started_at,
  }));
}

/** Seconds per member contributed to a group inside a window. */
export async function groupSeconds(groupId: string, from: Date, to: Date): Promise<Map<string, number>> {
  return secondsByMember(await intervalsBetween({ groupId }, from, to), from, to);
}

/** Seconds per person across all their sessions (Friends board): each session counted once. */
export async function personSeconds(profileIds: string[], from: Date, to: Date): Promise<Map<string, number>> {
  if (!profileIds.length) return new Map();
  return secondsByMember(await intervalsBetween({ profileIds }, from, to), from, to);
}

export async function todayProgress(group: Group) {
  const day = groupDayOf(Date.now(), group.timezone);
  const target = await ensureDayTarget(group, day);
  const { start, end } = dayWindow(day, group.timezone);
  const totals = await groupSeconds(group.id, start, end);
  const total = [...totals.values()].reduce((s, x) => s + x, 0);
  return { day, totals, ...goalProgress(target, total) };
}

// --- Messages ---------------------------------------------------------------------------------

export async function postSystemMessage(groupId: string, kind: "system" | "help" | "recap", body: string, meta: Record<string, unknown> = {}, senderId: string | null = null) {
  const { data, error } = await createAdminClient()
    .from("group_messages")
    .insert({ group_id: groupId, kind, body: body.slice(0, 1000), meta, sender_id: senderId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/**
 * The day-end recap, posted once per group day (group_recaps is the guard). Run lazily when a
 * member opens the group and from the daily cron. Standouts come only from members who opted in
 * to the spotlight; ties are joint; no activity means no award.
 */
export async function postRecapIfDue(group: Group): Promise<boolean> {
  const admin = createAdminClient();
  const today = groupDayOf(Date.now(), group.timezone);
  const day = addDaysToDateKey(today, -1);
  const { data: joinedBefore } = await admin.from("study_groups").select("created_at").eq("id", group.id).single();
  if (joinedBefore && groupDayOf(joinedBefore.created_at as string, group.timezone) > day) return false;
  const claim = await admin.from("group_recaps").insert({ group_id: group.id, day }).select("day");
  if (claim.error) {
    if (claim.error.code === "23505") return false;
    throw claim.error;
  }
  const { start, end } = dayWindow(day, group.timezone);
  const totals = await groupSeconds(group.id, start, end);
  const { data: target } = await admin.from("group_day_targets").select("target_minutes").eq("group_id", group.id).eq("day", day).maybeSingle();
  const members = await groupMembers(group.id);
  const spotlight = new Map([...totals].filter(([id]) => members.some((m) => m.profile_id === id && m.spotlight_opt_in)));
  const total = [...totals.values()].reduce((s, x) => s + x, 0);
  const progress = goalProgress((target?.target_minutes as number) ?? group.daily_target_minutes, total);
  const leaders = standouts(spotlight);
  const names = leaders.map((id) => members.find((m) => m.profile_id === id)?.name ?? "A member");
  const goalLine = progress.reached
    ? `Yesterday the group studied ${formatMinutes(progress.doneMinutes)} and reached the ${formatMinutes(progress.targetMinutes)} goal.`
    : `Yesterday the group studied ${formatMinutes(progress.doneMinutes)} of the ${formatMinutes(progress.targetMinutes)} goal.`;
  const standoutLine = names.length === 0 ? "" : names.length === 1 ? ` Standout: ${names[0]}.` : ` Joint standouts: ${names.join(" and ")}.`;
  const messageId = await postSystemMessage(group.id, "recap", goalLine + standoutLine, { day, done: progress.doneMinutes, target: progress.targetMinutes, standouts: leaders });
  await admin.from("group_recaps").update({ message_id: messageId }).eq("group_id", group.id).eq("day", day);
  return true;
}

// --- Timer ------------------------------------------------------------------------------------

export type LiveSession = { id: string; group_id: string | null; state: "running" | "paused"; started_at: string; last_beat_at: string; announced: boolean };

async function sumCredited(sessionId: string): Promise<number> {
  const { data } = await createAdminClient().from("study_intervals").select("started_at, ended_at").eq("session_id", sessionId);
  return Math.round((data ?? []).reduce((s, i) => s + (i.ended_at ? (Date.parse(i.ended_at) - Date.parse(i.started_at)) / 1000 : 0), 0));
}

/** Stop a session: close any open interval at `closeAt` (default: its last beat) and total it. */
export async function finishSession(sessionId: string, reason: "manual" | "idle" | "timeout" | "left_group" | "replaced", closeAt?: string) {
  const admin = createAdminClient();
  const { data: s } = await admin.from("study_sessions").select("id, state, last_beat_at").eq("id", sessionId).maybeSingle();
  if (!s || s.state === "stopped") return;
  const end = closeAt ?? (s.last_beat_at as string);
  await admin.from("study_intervals").update({ ended_at: end }).eq("session_id", sessionId).is("ended_at", null);
  const credited = await sumCredited(sessionId);
  await admin
    .from("study_sessions")
    .update({ state: "stopped", stopped_at: new Date().toISOString(), stop_reason: reason, credited_seconds: credited })
    .eq("id", sessionId)
    .neq("state", "stopped");
}

/** Close sessions whose device went quiet. Credit ends at their last heartbeat. */
export async function sweepStale(filter: { profileId?: string; groupId?: string } = {}) {
  const cutoff = new Date(Date.now() - STALE_SECONDS * 1000).toISOString();
  let q = createAdminClient().from("study_sessions").select("id").neq("state", "stopped").lt("last_beat_at", cutoff);
  if (filter.profileId) q = q.eq("profile_id", filter.profileId);
  if (filter.groupId) q = q.eq("group_id", filter.groupId);
  const { data } = await q;
  for (const s of data ?? []) await finishSession(s.id as string, "timeout");
}

export async function liveSessionFor(profileId: string): Promise<LiveSession | null> {
  await sweepStale({ profileId });
  const { data } = await createAdminClient()
    .from("study_sessions")
    .select("id, group_id, state, started_at, last_beat_at, announced")
    .eq("profile_id", profileId)
    .neq("state", "stopped")
    .maybeSingle<LiveSession>();
  return data ?? null;
}

/** Credited seconds so far in a live session (closed intervals plus the open one up to its last beat). */
export async function sessionSeconds(session: Pick<LiveSession, "id" | "last_beat_at">): Promise<number> {
  const { data } = await createAdminClient().from("study_intervals").select("started_at, ended_at").eq("session_id", session.id);
  const now = Date.now();
  return Math.round(
    (data ?? []).reduce((s, i) => {
      const end = i.ended_at ? Date.parse(i.ended_at) : Math.min(Date.parse(session.last_beat_at), now);
      return s + Math.max(0, end - Date.parse(i.started_at)) / 1000;
    }, 0),
  );
}

/**
 * Start (or rejoin) the student's one timer. A second device gets the session that's already
 * running, so time is never counted twice. The group is snapshotted at start.
 */
export async function startSession(me: SocialStudent, groupId: string): Promise<LiveSession> {
  const group = await requireMember(groupId, me.profile.id);
  const admin = createAdminClient();
  const existing = await liveSessionFor(me.profile.id);
  if (existing) {
    if (existing.group_id === group.id) {
      await beat(me.profile.id, existing.id, true);
      return existing;
    }
    await finishSession(existing.id, "replaced");
  }
  const now = new Date().toISOString();
  const inserted = await admin
    .from("study_sessions")
    .insert({ profile_id: me.profile.id, group_id: group.id, state: "running", started_at: now, last_beat_at: now })
    .select("id, group_id, state, started_at, last_beat_at, announced")
    .single<LiveSession>();
  if (inserted.error) {
    // 23505: another device started one a moment ago. Use that one.
    if (inserted.error.code === "23505") {
      const live = await liveSessionFor(me.profile.id);
      if (live) return live;
    }
    throw inserted.error;
  }
  await admin.from("study_intervals").insert({ session_id: inserted.data.id, profile_id: me.profile.id, group_id: group.id, started_at: now });

  // One start event per session; pause and resume never post again.
  const claim = await admin.from("study_sessions").update({ announced: true }).eq("id", inserted.data.id).eq("announced", false).select("id");
  if (claim.data?.length) {
    const members = await groupMembers(group.id);
    const mine = members.find((m) => m.profile_id === me.profile.id);
    if (mine?.share_status) {
      const progress = await todayProgress(group);
      const left = progress.reached ? "Today's goal is already reached." : `${formatMinutes(progress.remainingMinutes)} left on today's goal.`;
      await postSystemMessage(group.id, "system", `${displayName(me.student)} just started studying. ${left}`, { event: "study_start", session: inserted.data.id }, me.profile.id);
    }
  }
  return inserted.data;
}

/**
 * A heartbeat from the study screen. `active` is false when the tab is hidden, the student is
 * idle, or they pressed pause. Revalidates membership: a student who left the group stops earning.
 */
export async function beat(profileId: string, sessionId: string, active: boolean): Promise<{ state: "running" | "paused" | "stopped"; seconds: number }> {
  const admin = createAdminClient();
  const { data: s } = await admin
    .from("study_sessions")
    .select("id, profile_id, group_id, state, last_beat_at")
    .eq("id", sessionId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!s || s.state === "stopped") return { state: "stopped", seconds: s ? await sumCredited(sessionId) : 0 };
  if (s.group_id && !(await isMember(s.group_id as string, profileId))) {
    await finishSession(sessionId, "left_group", new Date().toISOString());
    return { state: "stopped", seconds: await sumCredited(sessionId) };
  }
  const now = new Date();
  if ((now.getTime() - Date.parse(s.last_beat_at as string)) / 1000 > STALE_SECONDS) {
    await finishSession(sessionId, "timeout");
    return { state: "stopped", seconds: await sumCredited(sessionId) };
  }
  const { data: open } = await admin.from("study_intervals").select("id").eq("session_id", sessionId).is("ended_at", null).maybeSingle();
  const plan = planBeat({ hasOpen: Boolean(open), lastBeatAt: s.last_beat_at as string, now, active });
  if (plan.closeAt && open) await admin.from("study_intervals").update({ ended_at: plan.closeAt }).eq("id", open.id).is("ended_at", null);
  if (plan.openAt) {
    const ins = await admin.from("study_intervals").insert({ session_id: sessionId, profile_id: profileId, group_id: s.group_id, started_at: plan.openAt });
    // 23505: a second device opened it in the same instant. One open interval is enough.
    if (ins.error && ins.error.code !== "23505") throw ins.error;
  }
  await admin.from("study_sessions").update({ state: plan.state, last_beat_at: now.toISOString() }).eq("id", sessionId).neq("state", "stopped");
  return { state: plan.state, seconds: await sessionSeconds({ id: sessionId, last_beat_at: now.toISOString() }) };
}

export { BEAT_GRACE_SECONDS };
