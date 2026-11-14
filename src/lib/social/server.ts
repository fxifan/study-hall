import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { getCurrentProfile, type CurrentProfile } from "@/lib/auth";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@/lib/subscription-status";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDaysToDateKey } from "@/lib/time";
import { TUTOR_LINK_COOKIE, isTutorLinked } from "@/lib/tutor/links";
import {
  ABANDONED_SECONDS,
  awayTooLong,
  clampEnd,
  dayWindow,
  formatMinutes,
  goalProgress,
  groupDayOf,
  openEnd,
  secondsByMember,
  standouts,
  trimTo,
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
  /** Signed up, but hasn't started the free trial (that needs a card, in Stripe Checkout). */
  | { kind: "none" }
  /** `billed`: a Stripe trial that becomes A$3.99/month when it ends. Older no-card trials aren't. */
  | { kind: "trial"; trialEndsAt: string; billed: boolean }
  | { kind: "paid"; periodEnd: string | null }
  | { kind: "studyhall" }
  | { kind: "expired"; trialEndsAt: string }
  | { kind: "disabled" };

/** Most members a study group can have. */
export const MAX_GROUP_MEMBERS = 12;

export type SocialStudent = { profile: CurrentProfile; student: StudentRow; access: Access };

export { STUDENT_PRICE_CENTS } from "./plan-price";

export const hasAccess = (a: Access) => a.kind === "trial" || a.kind === "paid" || a.kind === "studyhall";

export function displayName(s: { first_name: string; last_initial: string }): string {
  return `${s.first_name} ${s.last_initial}.`;
}

export function token(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

/** A 10-character invite code: capitals and digits, without look-alikes (no I, L, O, 0 or 1). */
export function inviteCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

async function accessFor(student: StudentRow, profile: CurrentProfile): Promise<Access> {
  if (!student.social_enabled) return { kind: "disabled" };
  // An admin's Student view: full access, no trial or checkout.
  if (profile.role === "admin") return { kind: "paid", periodEnd: null };
  const profileId = profile.id;
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
  const { data: plan } = await admin
    .from("student_plans")
    .select("status, trial_ends_at, current_period_end, stripe_subscription_id")
    .eq("profile_id", profileId)
    .maybeSingle();
  // The free trial starts in Stripe Checkout, with a card (owner, 8 Nov 2026): no row means not started.
  if (!plan) return { kind: "none" };
  if (plan.status === "active" || plan.status === "past_due") return { kind: "paid", periodEnd: plan.current_period_end };
  // A Stripe trial: Stripe ends it and starts billing, so trust the subscription over the clock.
  if (plan.status === "trialing" && plan.stripe_subscription_id) return { kind: "trial", trialEndsAt: plan.trial_ends_at, billed: true };
  // Older no-card trials run out on their date.
  if (Date.parse(plan.trial_ends_at) > Date.now() && plan.status === "trialing") return { kind: "trial", trialEndsAt: plan.trial_ends_at, billed: false };
  return { kind: "expired", trialEndsAt: plan.trial_ends_at };
}

/** Students, and admins in Student view (they have their own preview student row). */
export async function loadSocialStudent(profile: CurrentProfile): Promise<SocialStudent | null> {
  if (profile.role !== "student" && profile.role !== "admin") return null;
  const { data: student } = await createAdminClient()
    .from("students")
    .select("id, first_name, last_initial, year_level, status, social_enabled, self_signed, chat_suspended_until")
    .eq("profile_id", profile.id)
    .maybeSingle<StudentRow>();
  if (!student) return null;
  return { profile, student, access: await accessFor(student, profile) };
}

/** Pages: a signed-in student with Edumi switched on. Paid features also need `paid`. */
export async function requireSocialStudent(options: { paid?: boolean } = { paid: true }): Promise<SocialStudent> {
  const [profile, locale] = await Promise.all([getCurrentProfile(), getLocale()]);
  if (!profile) redirect(localizePath("/login", locale));
  const me = await loadSocialStudent(profile);
  if (!me) redirect(localizePath(profile.role === "student" ? "/student" : profile.role === "admin" ? "/admin" : "/", locale));
  if (options.paid !== false && !hasAccess(me.access)) {
    // Students linked to a tutor (or opening a tutor's invite) keep their tutor's next steps for free.
    const tutorInvite = (await cookies()).has(TUTOR_LINK_COOKIE);
    redirect(localizePath(tutorInvite || (await isTutorLinked(me.profile.id)) ? "/student/tutor" : "/student/plan", locale));
  }
  return me;
}

/** Free with a tutor link: the study timer and the tutor's next steps. Everything else needs a plan. */
export async function canUseTutorFeatures(me: SocialStudent): Promise<boolean> {
  return hasAccess(me.access) || (await isTutorLinked(me.profile.id));
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

/** The group a student came from (?group= on Practice), if they're still in it: for "Back to group". */
export async function cameFromGroup(value: unknown, profileId: string): Promise<{ id: string; name: string } | null> {
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value) || !(await isMember(value, profileId))) return null;
  const { data } = await createAdminClient().from("study_groups").select("id, name").eq("id", value).is("archived_at", null).maybeSingle();
  return data ? { id: data.id as string, name: data.name as string } : null;
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

/** End a session's pieces at `end` (see trimTo) without stopping it. */
async function trimSession(sessionId: string, end: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("study_intervals").select("id, started_at, ended_at").eq("session_id", sessionId);
  const { drop, close } = trimTo(data ?? [], end);
  if (drop.length) await admin.from("study_intervals").delete().in("id", drop);
  if (close.length) await admin.from("study_intervals").update({ ended_at: end }).in("id", close);
}

/**
 * Stop a session and total it. Time ends at `closeAt` if given (a stop time the student picked),
 * otherwise now, or the last time Edumi was open if it has been closed for over 2 hours.
 * Safe to repeat: a stopped session is left alone.
 */
export async function finishSession(sessionId: string, reason: "manual" | "idle" | "timeout" | "left_group" | "replaced", closeAt?: string) {
  const admin = createAdminClient();
  const { data: s } = await admin.from("study_sessions").select("id, state, last_beat_at").eq("id", sessionId).maybeSingle();
  if (!s || s.state === "stopped") return;
  const end = closeAt ?? new Date(openEnd(s.last_beat_at as string, Date.now())).toISOString();
  await trimSession(sessionId, end);
  const credited = await sumCredited(sessionId);
  await admin
    .from("study_sessions")
    .update({ state: "stopped", stopped_at: new Date().toISOString(), stop_reason: reason, credited_seconds: credited })
    .eq("id", sessionId)
    .neq("state", "stopped");
}

/** Close sessions nobody came back to within a day. Their time ends when Edumi was last open. */
export async function sweepStale(filter: { profileId?: string; groupId?: string } = {}) {
  const cutoff = new Date(Date.now() - ABANDONED_SECONDS * 1000).toISOString();
  let q = createAdminClient().from("study_sessions").select("id, last_beat_at").neq("state", "stopped").lt("last_beat_at", cutoff);
  if (filter.profileId) q = q.eq("profile_id", filter.profileId);
  if (filter.groupId) q = q.eq("group_id", filter.groupId);
  const { data } = await q;
  for (const s of data ?? []) await finishSession(s.id as string, "timeout", s.last_beat_at as string);
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

/** Seconds counted so far in a live session. `until` overrides where an open piece ends. */
export async function sessionSeconds(session: Pick<LiveSession, "id" | "last_beat_at">, until?: number): Promise<number> {
  const { data } = await createAdminClient().from("study_intervals").select("started_at, ended_at").eq("session_id", session.id);
  const now = Date.now();
  const openUntil = until ?? openEnd(session.last_beat_at, now);
  return Math.round((data ?? []).reduce((s, i) => s + Math.max(0, (i.ended_at ? Date.parse(i.ended_at) : openUntil) - Date.parse(i.started_at)) / 1000, 0));
}

/** True while a running session has been away too long and needs the student's answer. */
export function needsCheck(session: { state: string; last_beat_at: string }, now = Date.now()): boolean {
  return session.state === "running" && awayTooLong(session.last_beat_at, now);
}

async function settleBeforeStartOrNull(profileId: string): Promise<LiveSession | null> {
  const live = await liveSessionFor(profileId);
  return live ? settleBeforeStart(live) : null;
}

/** A session left away too long is closed at the last time Edumi was open before a new one starts. */
async function settleBeforeStart(existing: LiveSession): Promise<LiveSession | null> {
  if (!needsCheck(existing)) return existing;
  await finishSession(existing.id, "timeout", existing.last_beat_at);
  return null;
}

/**
 * Start (or rejoin) the student's one timer. A second device gets the session that's already
 * running, so time is never counted twice. The group is snapshotted at start.
 */
/** A timer that counts towards no group: studying for a tutor's next step. */
export async function startSoloSession(me: SocialStudent): Promise<LiveSession> {
  const admin = createAdminClient();
  const existing = await settleBeforeStartOrNull(me.profile.id);
  if (existing) {
    if (existing.group_id === null) {
      await setPaused(me.profile.id, existing.id, false);
      return existing;
    }
    await finishSession(existing.id, "replaced");
  }
  const now = new Date().toISOString();
  const inserted = await admin
    .from("study_sessions")
    .insert({ profile_id: me.profile.id, group_id: null, state: "running", started_at: now, last_beat_at: now, announced: true })
    .select("id, group_id, state, started_at, last_beat_at, announced")
    .single<LiveSession>();
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      const live = await liveSessionFor(me.profile.id);
      if (live) return live;
    }
    throw inserted.error;
  }
  await admin.from("study_intervals").insert({ session_id: inserted.data.id, profile_id: me.profile.id, group_id: null, started_at: now });
  return inserted.data;
}

export async function startSession(me: SocialStudent, groupId: string): Promise<LiveSession> {
  const group = await requireMember(groupId, me.profile.id);
  const admin = createAdminClient();
  const existing = await settleBeforeStartOrNull(me.profile.id);
  if (existing) {
    if (existing.group_id === group.id) {
      await setPaused(me.profile.id, existing.id, false);
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

export type Away = { startedAt: string; lastSeenAt: string; seenSeconds: number; allSeconds: number };
export type BeatResult = { state: "running" | "paused" | "stopped" | "check"; seconds: number; startedAt?: string; away?: Away };

type SessionRow = { id: string; profile_id: string; group_id: string | null; state: "running" | "paused" | "stopped"; started_at: string; last_beat_at: string };

async function loadSession(profileId: string, sessionId: string): Promise<SessionRow | null> {
  const { data } = await createAdminClient()
    .from("study_sessions")
    .select("id, profile_id, group_id, state, started_at, last_beat_at")
    .eq("id", sessionId)
    .eq("profile_id", profileId)
    .maybeSingle<SessionRow>();
  return data;
}

/** The welcome-back question: what each answer would count. */
async function awayFor(s: SessionRow): Promise<BeatResult> {
  const seenSeconds = await sessionSeconds(s, Date.parse(s.last_beat_at));
  const allSeconds = await sessionSeconds(s, Date.now());
  return { state: "check", seconds: seenSeconds, startedAt: s.started_at, away: { startedAt: s.started_at, lastSeenAt: s.last_beat_at, seenSeconds, allSeconds } };
}

/** Checks shared by every timer write: stopped, left the group, abandoned, or away too long. */
async function guard(profileId: string, s: SessionRow | null): Promise<BeatResult | null> {
  if (!s || s.state === "stopped") return { state: "stopped", seconds: s ? await sumCredited(s.id) : 0 };
  if (s.group_id && !(await isMember(s.group_id, profileId))) {
    await finishSession(s.id, "left_group", new Date().toISOString());
    return { state: "stopped", seconds: await sumCredited(s.id) };
  }
  if (Date.now() - Date.parse(s.last_beat_at) > ABANDONED_SECONDS * 1000) {
    await finishSession(s.id, "timeout", s.last_beat_at);
    return { state: "stopped", seconds: await sumCredited(s.id) };
  }
  if (needsCheck(s)) return awayFor(s);
  return null;
}

/**
 * "Edumi is open somewhere" (any tab, visible or not). It never pauses or resumes: only the
 * student does that. After a long absence it asks what to count instead of carrying on.
 */
export async function beat(profileId: string, sessionId: string): Promise<BeatResult> {
  const s = await loadSession(profileId, sessionId);
  const stop = await guard(profileId, s);
  if (stop) return stop;
  const now = new Date().toISOString();
  await createAdminClient().from("study_sessions").update({ last_beat_at: now }).eq("id", sessionId).neq("state", "stopped");
  return { state: s!.state as "running" | "paused", seconds: await sessionSeconds({ id: sessionId, last_beat_at: now }), startedAt: s!.started_at };
}

/** Pause (close the open piece now) or resume (open a new piece now). Repeats change nothing. */
export async function setPaused(profileId: string, sessionId: string, paused: boolean): Promise<BeatResult> {
  const s = await loadSession(profileId, sessionId);
  const stop = await guard(profileId, s);
  if (stop) return stop;
  const admin = createAdminClient();
  const now = new Date().toISOString();
  if (paused) {
    await admin.from("study_intervals").update({ ended_at: now }).eq("session_id", sessionId).is("ended_at", null);
  } else {
    const { data: open } = await admin.from("study_intervals").select("id").eq("session_id", sessionId).is("ended_at", null).maybeSingle();
    if (!open) {
      const ins = await admin.from("study_intervals").insert({ session_id: sessionId, profile_id: profileId, group_id: s!.group_id, started_at: now });
      // 23505: a second device resumed in the same instant. One open piece is enough.
      if (ins.error && ins.error.code !== "23505") throw ins.error;
    }
  }
  await admin.from("study_sessions").update({ state: paused ? "paused" : "running", last_beat_at: now }).eq("id", sessionId).neq("state", "stopped");
  return { state: paused ? "paused" : "running", seconds: await sessionSeconds({ id: sessionId, last_beat_at: now }), startedAt: s!.started_at };
}

/**
 * The student's answer after a long absence: count until they left Edumi, the whole time, or until
 * a time they pick. Then either finish, or keep going from now (the gap isn't counted).
 */
export async function resolveAway(profileId: string, sessionId: string, until: "left" | "now" | { at: string }, then: "finish" | "resume"): Promise<BeatResult> {
  const s = await loadSession(profileId, sessionId);
  if (!s || s.state === "stopped") return { state: "stopped", seconds: s ? await sumCredited(s.id) : 0 };
  const now = Date.now();
  const end = until === "left" ? s.last_beat_at : until === "now" ? new Date(now).toISOString() : clampEnd(until.at, s.started_at, now);
  if (then === "finish") {
    await finishSession(sessionId, "manual", end);
    return { state: "stopped", seconds: await sumCredited(sessionId) };
  }
  await trimSession(sessionId, end);
  const admin = createAdminClient();
  const nowIso = new Date(now).toISOString();
  const ins = await admin.from("study_intervals").insert({ session_id: sessionId, profile_id: profileId, group_id: s.group_id, started_at: nowIso });
  if (ins.error && ins.error.code !== "23505") throw ins.error;
  await admin.from("study_sessions").update({ state: "running", last_beat_at: nowIso }).eq("id", sessionId).neq("state", "stopped");
  return { state: "running", seconds: await sessionSeconds({ id: sessionId, last_beat_at: nowIso }), startedAt: s.started_at };
}

