/**
 * Edumi student metrics for /admin/analytics (the "Edumi students" tab): acquisition, plan
 * conversion, group engagement, practice and the pilot funnel. Pure: the loader (analytics-load.ts)
 * passes rows with test accounts already removed.
 */
import { STUDENT_PRICE_CENTS } from "./plan-price";

export type Range = { from: Date; to: Date };
const inRange = (iso: string | null | undefined, r: Range) => Boolean(iso) && Date.parse(iso!) >= r.from.getTime() && Date.parse(iso!) < r.to.getTime();
const ratio = (a: number, b: number) => (b ? a / b : null);

export type EdumiRows = {
  students: { profile_id: string; created_at: string; self_signed: boolean; social_enabled: boolean }[];
  plans: { profile_id: string; status: string; payer: string | null; trial_ends_at: string }[];
  groups: { id: string; created_at: string }[];
  members: { group_id: string; profile_id: string; joined_at: string }[];
  sessions: { profile_id: string; group_id: string | null; started_at: string; credited_seconds: number }[];
  recaps: { day: string; created_at: string; done: number | null; target: number | null }[];
  help: { state: string; created_at: string }[];
  messages: number;
  resources: { profile_id: string; kind: string; created_at: string; curriculum: boolean; flagged: boolean }[];
  attempts: { profile_id: string; submitted_at: string; correct: number; total: number }[];
};

export function edumiMetrics(d: EdumiRows, r: Range, now: Date) {
  const signups = d.students.filter((s) => s.self_signed && inRange(s.created_at, r)).length;
  const enabled = d.students.filter((s) => s.social_enabled).length;
  const trialStart = (p: EdumiRows["plans"][number]) => new Date(Date.parse(p.trial_ends_at) - 7 * 86_400_000).toISOString();
  const trialsStarted = d.plans.filter((p) => inRange(trialStart(p), r)).length;
  const trialing = d.plans.filter((p) => p.status === "trialing" && Date.parse(p.trial_ends_at) > now.getTime()).length;
  const paying = d.plans.filter((p) => p.status === "active" || p.status === "past_due");
  const ended = d.plans.filter((p) => inRange(p.trial_ends_at, r));
  const converted = ended.filter((p) => p.status === "active" || p.status === "past_due" || p.status === "canceled").length;

  const sessions = d.sessions.filter((s) => inRange(s.started_at, r));
  const minutes = Math.round(sessions.reduce((sum, s) => sum + s.credited_seconds, 0) / 60);
  const studiers = new Set(sessions.filter((s) => s.credited_seconds >= 60).map((s) => s.profile_id));
  const activeGroups = new Set(sessions.filter((s) => s.group_id && s.credited_seconds >= 60).map((s) => s.group_id));
  const weeks = Math.max(1, (r.to.getTime() - r.from.getTime()) / (7 * 86_400_000));
  const groupsWithTwo = new Set(
    [...activeGroups].filter((g) => new Set(sessions.filter((s) => s.group_id === g && s.credited_seconds >= 60).map((s) => s.profile_id)).size >= 2),
  );
  const recaps = d.recaps.filter((x) => inRange(x.created_at, r));
  const goalsHit = recaps.filter((x) => x.done !== null && x.target !== null && x.done >= x.target).length;
  const help = d.help.filter((h) => inRange(h.created_at, r));
  const helped = help.filter((h) => h.state === "accepted" || h.state === "resolved").length;

  const resources = d.resources.filter((x) => inRange(x.created_at, r));
  const attempts = d.attempts.filter((a) => inRange(a.submitted_at, r));
  const avgScore = ratio(
    attempts.reduce((s, a) => s + a.correct, 0),
    attempts.reduce((s, a) => s + a.total, 0),
  );

  // Funnel: students who signed up in the period, and how far each got (at any time since).
  const cohort = d.students.filter((s) => s.social_enabled && inRange(s.created_at, r)).map((s) => s.profile_id);
  const inGroup = new Set(d.members.map((m) => m.profile_id));
  const studied = new Set(d.sessions.filter((s) => s.credited_seconds >= 60).map((s) => s.profile_id));
  const practised = new Set([...d.resources.map((x) => x.profile_id), ...d.attempts.map((a) => a.profile_id)]);
  const paid = new Set(paying.map((p) => p.profile_id));
  const funnelCounts = [
    ["Signed up", cohort.length],
    ["Joined a group", cohort.filter((id) => inGroup.has(id)).length],
    ["Studied 1+ minute", cohort.filter((id) => studied.has(id)).length],
    ["Made practice", cohort.filter((id) => practised.has(id)).length],
    ["Paying", cohort.filter((id) => paid.has(id)).length],
  ] as const;
  const funnel = funnelCounts.map(([stage, count], i) => ({ stage, count, fromPrevious: i === 0 ? null : ratio(count, funnelCounts[i - 1][1]) }));

  return {
    acquisition: { signups, enabled, trialsStarted, trialing },
    plans: {
      paying: paying.length,
      byStudent: paying.filter((p) => p.payer !== "parent").length,
      byParent: paying.filter((p) => p.payer === "parent").length,
      mrrCents: paying.length * STUDENT_PRICE_CENTS,
      trialConversion: ratio(converted, ended.length),
      trialsEnded: ended.length,
    },
    groups: {
      created: d.groups.filter((g) => inRange(g.created_at, r)).length,
      active: activeGroups.size,
      activeWithTwo: groupsWithTwo.size,
      membersPerActiveGroup: ratio([...activeGroups].reduce((s, g) => s + d.members.filter((m) => m.group_id === g).length, 0), activeGroups.size),
      goalsHit,
      goalDays: recaps.length,
      messages: d.messages,
    },
    study: {
      minutes,
      sessions: sessions.length,
      studiers: studiers.size,
      minutesPerStudierPerWeek: studiers.size ? minutes / studiers.size / weeks : null,
    },
    help: { requests: help.length, acceptedOrResolved: helped, rate: ratio(helped, help.length) },
    practice: {
      generated: resources.length,
      quizzes: resources.filter((x) => x.kind === "quiz").length,
      curriculumShare: ratio(resources.filter((x) => x.curriculum).length, resources.length),
      attempts: attempts.length,
      avgScore,
      flags: resources.filter((x) => x.flagged).length,
    },
    funnel,
  };
}
