"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, localizePath } from "@/i18n/config";
import { track } from "@/lib/events";
import { llmConfigured, openAiLlm } from "@/lib/llm";
import { siteOrigin } from "@/lib/site";
import { getStripe } from "@/lib/stripe";
import { studentCheckoutUrl } from "@/lib/social/billing";
import { awardsFor, grade, milestonesFor, type PointKind } from "@/lib/social/points";
import { DAILY_LIMITS, generateStudentResource, offlineStudentLlm, RESOURCE_KINDS, StudentResourceError, type QuizKey } from "@/lib/social/resources";
import {
  beat,
  displayName,
  finishSession,
  groupMembers,
  inviteCode,
  liveSessionFor,
  postSystemMessage,
  requireMember,
  socialActor,
  startSession,
  token,
} from "@/lib/social/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { dateKeyOf } from "@/lib/time";

const MAX_MEMBERS = 12;
const uuid = z.uuid();

async function href(path: string) {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return localizePath(path, isLocale(v) ? v : DEFAULT_LOCALE);
}

// --- Groups -----------------------------------------------------------------------------------

export async function createGroup(formData: FormData) {
  const me = await socialActor();
  const parsed = z
    .object({ name: z.string().trim().min(1).max(60), hours: z.coerce.number().min(0.25).max(24) })
    .safeParse({ name: formData.get("name"), hours: formData.get("hours") });
  if (!parsed.success) redirect(await href("/student/groups?error=group"));
  const admin = createAdminClient();
  const { data: group, error } = await admin
    .from("study_groups")
    .insert({ org_id: me.profile.orgId, name: parsed.data.name, daily_target_minutes: Math.round(parsed.data.hours * 60), created_by: me.profile.id })
    .select("id")
    .single();
  if (error) throw error;
  await admin.from("study_group_members").insert({ group_id: group.id, profile_id: me.profile.id, role: "owner" });
  await admin.from("study_group_invites").insert({ code: inviteCode(), group_id: group.id, created_by: me.profile.id });
  await track({ name: "study_group_created", product: "platform", role: "student", userId: me.profile.id, objectType: "study_group", objectId: group.id });
  redirect(await href(`/student/groups/${group.id}`));
}

export async function joinGroup(formData: FormData) {
  const me = await socialActor();
  const code = String(formData.get("code") ?? "").trim();
  (await cookies()).delete("edumi_invite");
  if (!/^[A-Za-z0-9]{8,16}$/.test(code)) redirect(await href("/student/groups?error=code"));
  const admin = createAdminClient();
  const { data: invite } = await admin.from("study_group_invites").select("code, group_id, max_uses, uses, expires_at, revoked_at").eq("code", code).maybeSingle();
  if (!invite || invite.revoked_at || Date.parse(invite.expires_at) < Date.now() || invite.uses >= invite.max_uses) redirect(await href("/student/groups?error=code"));
  const { count } = await admin.from("study_group_members").select("profile_id", { count: "exact", head: true }).eq("group_id", invite.group_id);
  const { count: already } = await admin
    .from("study_group_members")
    .select("profile_id", { count: "exact", head: true })
    .eq("group_id", invite.group_id)
    .eq("profile_id", me.profile.id);
  if (!already) {
    if ((count ?? 0) >= MAX_MEMBERS) redirect(await href("/student/groups?error=full"));
    const ins = await admin.from("study_group_members").insert({ group_id: invite.group_id, profile_id: me.profile.id });
    if (ins.error && ins.error.code !== "23505") throw ins.error;
    await admin.from("study_group_invites").update({ uses: invite.uses + 1 }).eq("code", code);
    await postSystemMessage(invite.group_id, "system", `${displayName(me.student)} joined the group.`, { event: "joined" });
    await track({ name: "study_group_joined", product: "platform", role: "student", userId: me.profile.id, objectType: "study_group", objectId: invite.group_id });
  }
  redirect(await href(`/student/groups/${invite.group_id}`));
}

export async function newInvite(groupId: string) {
  const me = await socialActor();
  await requireMember(groupId, me.profile.id);
  await createAdminClient().from("study_group_invites").insert({ code: inviteCode(), group_id: groupId, created_by: me.profile.id });
  refresh();
}

export async function leaveGroup(groupId: string) {
  const me = await socialActor({ paid: false });
  await requireMember(groupId, me.profile.id);
  const admin = createAdminClient();
  const live = await liveSessionFor(me.profile.id);
  if (live?.group_id === groupId) await finishSession(live.id, "left_group", new Date().toISOString());
  const members = await groupMembers(groupId);
  await admin.from("study_group_members").delete().eq("group_id", groupId).eq("profile_id", me.profile.id);
  const rest = members.filter((m) => m.profile_id !== me.profile.id);
  if (!rest.length) await admin.from("study_groups").update({ archived_at: new Date().toISOString() }).eq("id", groupId);
  else {
    if (members.find((m) => m.profile_id === me.profile.id)?.role === "owner" && !rest.some((m) => m.role === "owner")) {
      await admin.from("study_group_members").update({ role: "owner" }).eq("group_id", groupId).eq("profile_id", rest[0].profile_id);
    }
    await postSystemMessage(groupId, "system", `${displayName(me.student)} left the group.`, { event: "left" });
  }
  redirect(await href("/student/groups"));
}

/** Target edits apply from the next group day; today's snapshot stays as it was. */
export async function setTarget(groupId: string, formData: FormData) {
  const me = await socialActor();
  await requireMember(groupId, me.profile.id);
  const hours = z.coerce.number().min(0.25).max(24).safeParse(formData.get("hours"));
  if (!hours.success) return;
  await createAdminClient().from("study_groups").update({ next_target_minutes: Math.round(hours.data * 60) }).eq("id", groupId);
  await postSystemMessage(groupId, "system", `${displayName(me.student)} set tomorrow's goal to ${hours.data} hours.`, { event: "target" });
  refresh();
}

export async function updateMembership(groupId: string, formData: FormData) {
  const me = await socialActor({ paid: false });
  await requireMember(groupId, me.profile.id);
  const on = (k: string) => formData.get(k) === "on";
  await createAdminClient()
    .from("study_group_members")
    .update({ share_status: on("share_status"), board_opt_in: on("board_opt_in"), spotlight_opt_in: on("spotlight_opt_in"), muted: on("muted") })
    .eq("group_id", groupId)
    .eq("profile_id", me.profile.id);
  refresh();
}

// --- Chat -------------------------------------------------------------------------------------

export type SendResult = { ok: true } | { ok: false; error: string };

export async function sendMessage(groupId: string, body: string): Promise<SendResult> {
  const me = await socialActor();
  const text = body.trim();
  if (!text || text.length > 1000) return { ok: false, error: "Messages can be up to 1000 characters." };
  if (!uuid.safeParse(groupId).success) return { ok: false, error: "Unknown group." };
  if (me.student.chat_suspended_until && Date.parse(me.student.chat_suspended_until) > Date.now()) {
    return { ok: false, error: "Your chat is paused by a moderator for now." };
  }
  const admin = createAdminClient();
  const { count } = await admin
    .from("group_messages")
    .select("id", { count: "exact", head: true })
    .eq("sender_id", me.profile.id)
    .gt("created_at", new Date(Date.now() - 60_000).toISOString());
  if ((count ?? 0) >= 15) return { ok: false, error: "Slow down a little: try again in a minute." };
  // The user's own client, so the RLS insert policy (member, not suspended, kind text) applies.
  const { error } = await (await createClient()).from("group_messages").insert({ group_id: groupId, sender_id: me.profile.id, kind: "text", body: text });
  if (error) return { ok: false, error: "That message didn't send." };
  return { ok: true };
}

export async function reportMessage(messageId: string, reason: string): Promise<SendResult> {
  const me = await socialActor({ paid: false });
  const admin = createAdminClient();
  const { data: msg } = await admin.from("group_messages").select("group_id").eq("id", messageId).maybeSingle();
  if (!msg) return { ok: false, error: "Message not found." };
  await requireMember(msg.group_id as string, me.profile.id);
  const { error } = await admin.from("message_reports").insert({ message_id: messageId, reporter_id: me.profile.id, reason: reason.trim().slice(0, 300) || "No reason given" });
  if (error && error.code !== "23505") return { ok: false, error: "The report didn't send." };
  await track({ name: "message_reported", product: "platform", role: "student", userId: me.profile.id });
  return { ok: true };
}

export async function blockUser(profileId: string) {
  const me = await socialActor({ paid: false });
  if (!uuid.safeParse(profileId).success || profileId === me.profile.id) return;
  const admin = createAdminClient();
  await admin.from("user_blocks").upsert({ blocker_id: me.profile.id, blocked_id: profileId }, { ignoreDuplicates: true });
  // Blocking also ends any friendship.
  const [a, b] = [me.profile.id, profileId].sort();
  await admin.from("friendships").delete().eq("a", a).eq("b", b);
  refresh();
}

export async function unblockUser(profileId: string) {
  const me = await socialActor({ paid: false });
  await createAdminClient().from("user_blocks").delete().eq("blocker_id", me.profile.id).eq("blocked_id", profileId);
  refresh();
}

// --- Timer ------------------------------------------------------------------------------------

export type TimerState = { sessionId: string | null; state: "running" | "paused" | "stopped"; seconds: number; groupId: string | null };

export async function startStudy(groupId: string): Promise<TimerState> {
  const me = await socialActor();
  const s = await startSession(me, groupId);
  const b = await beat(me.profile.id, s.id, true);
  await track({ name: "study_session_started", product: "platform", role: "student", userId: me.profile.id, objectType: "study_group", objectId: groupId, dedupeKey: `study:${s.id}` });
  return { sessionId: s.id, groupId: s.group_id, ...b };
}

export async function heartbeat(sessionId: string, active: boolean): Promise<TimerState> {
  const me = await socialActor();
  if (!uuid.safeParse(sessionId).success) return { sessionId: null, state: "stopped", seconds: 0, groupId: null };
  const b = await beat(me.profile.id, sessionId, active);
  return { sessionId, groupId: null, ...b };
}

export async function stopStudy(sessionId: string): Promise<TimerState> {
  const me = await socialActor({ paid: false });
  if (!uuid.safeParse(sessionId).success) return { sessionId: null, state: "stopped", seconds: 0, groupId: null };
  // A last inactive beat closes the open interval at now (within grace), then the stop totals it.
  const b = await beat(me.profile.id, sessionId, false);
  if (b.state !== "stopped") await finishSession(sessionId, "manual");
  const { data } = await createAdminClient().from("study_sessions").select("credited_seconds, group_id").eq("id", sessionId).eq("profile_id", me.profile.id).maybeSingle();
  await track({ name: "study_session_stopped", product: "platform", role: "student", userId: me.profile.id, props: { seconds: data?.credited_seconds ?? 0 }, dedupeKey: `study_stop:${sessionId}` });
  return { sessionId: null, state: "stopped", seconds: (data?.credited_seconds as number) ?? 0, groupId: (data?.group_id as string) ?? null };
}

// --- Call Out for Help -------------------------------------------------------------------------

const HELP_KIND_LABEL = { question: "has a question", buddy: "wants a study buddy", checkin: "would like a quick check-in" } as const;

export async function askForHelp(groupId: string, formData: FormData) {
  const me = await socialActor();
  await requireMember(groupId, me.profile.id);
  const parsed = z
    .object({ kind: z.enum(["question", "buddy", "checkin"]), target: z.uuid().optional().or(z.literal("")), body: z.string().trim().max(300) })
    .safeParse({ kind: formData.get("kind"), target: formData.get("target") ?? "", body: formData.get("body") ?? "" });
  if (!parsed.success) return;
  const admin = createAdminClient();
  // Limit repeat call-outs: three open requests per student per group.
  const { count } = await admin
    .from("group_help_requests")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId)
    .eq("requester_id", me.profile.id)
    .in("state", ["open", "accepted"]);
  if ((count ?? 0) >= 3) redirect(await href(`/student/groups/${groupId}?error=help_limit`));
  const members = await groupMembers(groupId);
  const target = parsed.data.target ? members.find((m) => m.profile_id === parsed.data.target && m.profile_id !== me.profile.id) : undefined;
  const who = target ? `${target.name}, ` : "";
  const body = `${who}${displayName(me.student)} ${HELP_KIND_LABEL[parsed.data.kind]}${parsed.data.body ? `: ${parsed.data.body}` : "."}`;
  const { data: req, error } = await admin
    .from("group_help_requests")
    .insert({ group_id: groupId, requester_id: me.profile.id, target_id: target?.profile_id ?? null, kind: parsed.data.kind, body: parsed.data.body || null })
    .select("id")
    .single();
  if (error) throw error;
  const messageId = await postSystemMessage(groupId, "help", body, { help: req.id }, me.profile.id);
  await admin.from("group_help_requests").update({ message_id: messageId }).eq("id", req.id);
  await track({ name: "help_requested", product: "platform", role: "student", userId: me.profile.id, props: { kind: parsed.data.kind, via: target ? "member" : "group" } });
  refresh();
}

export async function respondHelp(requestId: string, action: "accept" | "decline" | "resolve" | "close") {
  const me = await socialActor();
  const admin = createAdminClient();
  const { data: r } = await admin.from("group_help_requests").select("id, group_id, requester_id, target_id, state, accepted_by").eq("id", requestId).maybeSingle();
  if (!r) return;
  await requireMember(r.group_id as string, me.profile.id);
  const mine = r.requester_id === me.profile.id;
  const name = displayName(me.student);
  const update = (state: string, extra: Record<string, unknown> = {}) =>
    admin.from("group_help_requests").update({ state, updated_at: new Date().toISOString(), ...extra }).eq("id", requestId);
  if (action === "accept" && !mine && r.state === "open" && (!r.target_id || r.target_id === me.profile.id)) {
    await update("accepted", { accepted_by: me.profile.id });
    await postSystemMessage(r.group_id as string, "system", `${name} is on it.`, { help: requestId, event: "help_accepted" });
    await track({ name: "help_accepted", product: "platform", role: "student", userId: me.profile.id });
  } else if (action === "decline" && !mine && r.target_id === me.profile.id && r.state === "open") {
    // A targeted request that's declined goes to the whole group instead.
    await admin.from("group_help_requests").update({ target_id: null, updated_at: new Date().toISOString() }).eq("id", requestId);
    await postSystemMessage(r.group_id as string, "system", `${name} can't help right now. Anyone else?`, { help: requestId, event: "help_declined" });
  } else if (action === "resolve" && mine && (r.state === "open" || r.state === "accepted")) {
    await update("resolved");
    await postSystemMessage(r.group_id as string, "system", `${name}'s request is sorted. Thanks!`, { help: requestId, event: "help_resolved" });
    await track({ name: "help_resolved", product: "platform", role: "student", userId: me.profile.id });
  } else if (action === "close" && mine && r.state !== "resolved") {
    await update("closed");
  }
  refresh();
}

// --- Friends ----------------------------------------------------------------------------------

/** Friend requests only between students who share a group (no search, no discovery). */
export async function requestFriend(profileId: string) {
  const me = await socialActor();
  if (!uuid.safeParse(profileId).success || profileId === me.profile.id) return;
  const admin = createAdminClient();
  const { data: mine } = await admin.from("study_group_members").select("group_id").eq("profile_id", me.profile.id);
  const { count } = await admin
    .from("study_group_members")
    .select("group_id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .in("group_id", (mine ?? []).map((g) => g.group_id as string));
  if (!count) return;
  const { count: blocked } = await admin
    .from("user_blocks")
    .select("blocker_id", { count: "exact", head: true })
    .or(`and(blocker_id.eq.${me.profile.id},blocked_id.eq.${profileId}),and(blocker_id.eq.${profileId},blocked_id.eq.${me.profile.id})`);
  if (blocked) return;
  const [a, b] = [me.profile.id, profileId].sort();
  await admin.from("friendships").upsert({ a, b, requested_by: me.profile.id }, { onConflict: "a,b", ignoreDuplicates: true });
  refresh();
}

export async function respondFriend(profileId: string, accept: boolean) {
  const me = await socialActor({ paid: false });
  if (!uuid.safeParse(profileId).success) return;
  const [a, b] = [me.profile.id, profileId].sort();
  const admin = createAdminClient();
  if (accept) {
    await admin.from("friendships").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("a", a).eq("b", b).neq("requested_by", me.profile.id);
  } else {
    await admin.from("friendships").delete().eq("a", a).eq("b", b);
  }
  refresh();
}

export async function setFriendsBoard(formData: FormData) {
  const me = await socialActor({ paid: false });
  await createAdminClient()
    .from("student_settings")
    .upsert({ profile_id: me.profile.id, friends_board_opt_in: formData.get("friends_board_opt_in") === "on", updated_at: new Date().toISOString() });
  refresh();
}

// --- Practice ---------------------------------------------------------------------------------

function resourceLlm() {
  return process.env.TUTOR_RESOURCES_OFFLINE === "1" || !llmConfigured() ? offlineStudentLlm() : openAiLlm();
}

async function createResource(meId: string, yearLevel: number, input: { kind: (typeof RESOURCE_KINDS)[number]; topic: string; notes: string }, lineage?: { id: string; version: number }) {
  const admin = createAdminClient();
  const limitKind = input.kind === "quiz" ? "quiz" : "study";
  // Daily allowance counts resources created today in Melbourne.
  const today = dateKeyOf();
  const { data: recent } = await admin
    .from("student_resources")
    .select("kind, created_at")
    .eq("profile_id", meId)
    .gte("created_at", new Date(Date.now() - 36 * 3600_000).toISOString());
  const count = (recent ?? []).filter((r) => dateKeyOf(r.created_at as string) === today && (limitKind === "quiz" ? r.kind === "quiz" : r.kind !== "quiz")).length;
  if (count >= DAILY_LIMITS[limitKind]) return { error: "limit" as const };

  let generated;
  try {
    generated = await generateStudentResource(resourceLlm(), { ...input, yearLevel });
  } catch (e) {
    console.error("Student resource failed", e instanceof Error ? e.message : e);
    return { error: e instanceof StudentResourceError ? ("shape" as const) : ("service" as const) };
  }
  const title = input.topic.slice(0, 120);
  const { data: row, error } = await admin
    .from("student_resources")
    .insert({
      profile_id: meId,
      kind: input.kind,
      title,
      topic: input.topic,
      content: generated.content,
      // AI-generated practice is never scored-eligible; vetted quiz banks are (pilot rule).
      scored_eligible: false,
      ...(lineage ? { lineage_id: lineage.id, version: lineage.version } : {}),
    })
    .select("id")
    .single();
  if (error) throw error;
  if (generated.key) await admin.from("student_resource_keys").insert({ resource_id: row.id, answer_key: generated.key });
  await admin.from("student_ai_usage").insert({ profile_id: meId, day: today, kind: lineage ? "regenerate" : "generate", tokens: generated.tokens });
  await track({ name: "student_resource_generated", product: "platform", role: "student", userId: meId, props: { kind: input.kind } });
  return { id: row.id as string };
}

export async function generateResource(formData: FormData) {
  const me = await socialActor();
  const parsed = z
    .object({ kind: z.enum(RESOURCE_KINDS), topic: z.string().trim().min(2).max(200), notes: z.string().trim().max(6000) })
    .safeParse({ kind: formData.get("kind"), topic: formData.get("topic"), notes: formData.get("notes") ?? "" });
  if (!parsed.success) redirect(await href("/student/practice?error=input"));
  const out = await createResource(me.profile.id, me.student.year_level, parsed.data);
  if ("error" in out) redirect(await href(`/student/practice?error=${out.error}`));
  redirect(await href(`/student/practice/${out.id}`));
}

export async function regenerateResource(resourceId: string) {
  const me = await socialActor();
  const admin = createAdminClient();
  const { data: r } = await admin.from("student_resources").select("kind, topic, lineage_id").eq("id", resourceId).eq("profile_id", me.profile.id).maybeSingle();
  if (!r) return;
  const { data: top } = await admin.from("student_resources").select("version").eq("lineage_id", r.lineage_id).order("version", { ascending: false }).limit(1).single();
  const out = await createResource(me.profile.id, me.student.year_level, { kind: r.kind, topic: r.topic ?? "", notes: "" }, { id: r.lineage_id as string, version: ((top?.version as number) ?? 1) + 1 });
  if ("error" in out) redirect(await href(`/student/practice/${resourceId}?error=${out.error}`));
  redirect(await href(`/student/practice/${out.id}`));
}

async function award(profileId: string, lineageId: string, reached: PointKind[]) {
  const admin = createAdminClient();
  const today = dateKeyOf();
  const [{ data: held }, { data: todayRows }] = await Promise.all([
    admin.from("points_ledger").select("kind").eq("profile_id", profileId).eq("lineage_id", lineageId),
    admin.from("points_ledger").select("points").eq("profile_id", profileId).eq("day", today),
  ]);
  const awards = awardsFor({
    reached,
    held: (held ?? []).map((h) => h.kind as PointKind),
    pointsToday: (todayRows ?? []).reduce((s, r) => s + (r.points as number), 0),
  });
  const written: { kind: PointKind; points: number }[] = [];
  for (const a of awards) {
    // The unique (profile, lineage, kind) index makes a retried submit award nothing twice.
    const { error } = await admin.from("points_ledger").insert({ profile_id: profileId, lineage_id: lineageId, kind: a.kind, points: a.points, day: today });
    if (!error) written.push(a);
    else if (error.code !== "23505") throw error;
  }
  return written;
}

export async function completeResource(resourceId: string) {
  const me = await socialActor();
  const admin = createAdminClient();
  const { data: r } = await admin.from("student_resources").select("id, kind, lineage_id, completed_at").eq("id", resourceId).eq("profile_id", me.profile.id).maybeSingle();
  if (!r || r.kind === "quiz") return;
  if (!r.completed_at) await admin.from("student_resources").update({ completed_at: new Date().toISOString() }).eq("id", resourceId);
  await award(me.profile.id, r.lineage_id as string, ["completion"]);
  await track({ name: "student_resource_completed", product: "platform", role: "student", userId: me.profile.id, props: { kind: r.kind }, dedupeKey: `complete:${resourceId}` });
  refresh();
}

export type QuizResult = {
  correct: number;
  total: number;
  pct: number;
  answers: number[];
  explanations: string[];
  awards: { kind: PointKind; points: number }[];
  scoredEligible: boolean;
} | { error: string };

export async function submitQuiz(resourceId: string, answers: (number | null)[]): Promise<QuizResult> {
  const me = await socialActor();
  const admin = createAdminClient();
  const { data: r } = await admin.from("student_resources").select("id, kind, lineage_id, scored_eligible, completed_at").eq("id", resourceId).eq("profile_id", me.profile.id).maybeSingle();
  if (!r || r.kind !== "quiz") return { error: "Quiz not found." };
  const { data: keyRow } = await admin.from("student_resource_keys").select("answer_key").eq("resource_id", resourceId).single();
  const key = keyRow?.answer_key as QuizKey | undefined;
  if (!key) return { error: "This quiz can't be marked." };
  const clean = z.array(z.number().int().min(0).max(3).nullable()).max(20).safeParse(answers);
  if (!clean.success) return { error: "Answers came through in the wrong shape." };
  const g = grade(clean.data, key.answers);
  if (!g.complete) return { error: "Answer every question before you submit." };
  await admin.from("resource_attempts").insert({ resource_id: resourceId, profile_id: me.profile.id, answers: clean.data, correct: g.correct, total: g.total, score_pct: g.pct });
  if (!r.completed_at) await admin.from("student_resources").update({ completed_at: new Date().toISOString() }).eq("id", resourceId);
  const awards = await award(me.profile.id, r.lineage_id as string, milestonesFor({ scorePct: g.pct, scoredEligible: r.scored_eligible as boolean, completed: true }));
  await track({ name: "quiz_submitted", product: "platform", role: "student", userId: me.profile.id, props: { count: g.total, status: r.scored_eligible ? "scored" : "practice" } });
  return { correct: g.correct, total: g.total, pct: g.pct, answers: key.answers, explanations: key.explanations, awards, scoredEligible: r.scored_eligible as boolean };
}

export async function flagResource(resourceId: string, formData: FormData) {
  const me = await socialActor({ paid: false });
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300) || "Something here looks wrong.";
  await createAdminClient().from("student_resources").update({ flagged_at: new Date().toISOString(), flag_reason: reason }).eq("id", resourceId).eq("profile_id", me.profile.id);
  await track({ name: "student_resource_flagged", product: "platform", role: "student", userId: me.profile.id });
  refresh();
}

// --- Plan -------------------------------------------------------------------------------------

export async function startStudentCheckout() {
  const me = await socialActor({ paid: false });
  const { data: plan } = await createAdminClient().from("student_plans").select("stripe_customer_id").eq("profile_id", me.profile.id).maybeSingle();
  const url = await studentCheckoutUrl({
    profileId: me.profile.id,
    payer: "student",
    email: me.profile.email,
    customer: (plan?.stripe_customer_id as string | null) ?? null,
    origin: await siteOrigin(),
    returnPath: await href("/student/plan"),
  });
  redirect(url);
}

/** A link the student sends a parent: the parent page shows the plan and price, nothing private. */
export async function createParentLink() {
  const me = await socialActor({ paid: false });
  const admin = createAdminClient();
  const { data: plan } = await admin.from("student_plans").select("parent_link_token").eq("profile_id", me.profile.id).maybeSingle();
  if (!plan?.parent_link_token) await admin.from("student_plans").upsert({ profile_id: me.profile.id, parent_link_token: token(), updated_at: new Date().toISOString() });
  refresh();
}

export async function openStudentPortal() {
  const me = await socialActor({ paid: false });
  const { data: plan } = await createAdminClient().from("student_plans").select("stripe_customer_id, payer").eq("profile_id", me.profile.id).maybeSingle();
  if (!plan?.stripe_customer_id || plan.payer !== "student") throw new Error("No student billing account.");
  const session = await getStripe().billingPortal.sessions.create({ customer: plan.stripe_customer_id as string, return_url: `${await siteOrigin()}${await href("/student/plan")}` });
  redirect(session.url);
}
