import "server-only";
import { cache } from "react";
import { getCurrentProfile, requireRole, type CurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { dateKeyOf, zonedDateTimeToUtc } from "@/lib/time";
import type { TutorPlan } from "./config";
import { draftAccess, type Access, type PlanState } from "./plan";

export type TutorRow = {
  id: string;
  display_name: string;
  business_name: string | null;
  abn: string | null;
  gst_registered: boolean;
  default_rate_cents: number;
  bank_account_name: string | null;
  bank_bsb_enc: string | null;
  bank_acct_enc: string | null;
  report_langs: ("en" | "zh-CN")[];
  invoice_due_days: number;
  overdue_reminders: boolean;
  plan: TutorPlan;
  trial_ends_at: string;
  calendar_feed_token: string | null;
  calendar_feed_fetched_at: string | null;
  stripe_customer_id: string | null;
  created_at: string;
};

export type Tutor = { profile: CurrentProfile; tutor: TutorRow };

const TUTOR_COLUMNS =
  "id, display_name, business_name, abn, gst_registered, default_rate_cents, bank_account_name, bank_bsb_enc, bank_acct_enc, report_langs, invoice_due_days, overdue_reminders, plan, trial_ends_at, calendar_feed_token, calendar_feed_fetched_at, stripe_customer_id, created_at";

const loadTutor = cache(async (id: string): Promise<TutorRow | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("tutors").select(TUTOR_COLUMNS).eq("id", id).maybeSingle<TutorRow>();
  return data;
});

/**
 * Admins (the founders) can use the tutor app too, as their own tutor workspace: the first visit
 * creates their tutors row, on Solo at no charge. RLS keys every tutor table to auth.uid(), so an
 * admin's workspace holds only their own families and reports, never another tutor's.
 */
async function ensureAdminWorkspace(profile: CurrentProfile): Promise<TutorRow | null> {
  const name = (profile.fullName || profile.email.split("@")[0]).slice(0, 80);
  const service = createAdminClient();
  const { error } = await service.from("tutors").upsert({ id: profile.id, display_name: name, plan: "solo" }, { onConflict: "id", ignoreDuplicates: true });
  if (error) console.error("Admin tutor workspace", error.code, error.message);
  const { data, error: readError } = await service.from("tutors").select(TUTOR_COLUMNS).eq("id", profile.id).maybeSingle<TutorRow>();
  if (readError) console.error("Admin tutor workspace read", readError.code, readError.message);
  return data;
}

/**
 * A tutor who hasn't started a Solo trial: sign-up sets trial_ends_at to the sign-up time, so their
 * first Checkout gets the 14-day trial. Older no-card trials (14 days after sign-up) and anyone who
 * has been to Checkout don't count. They use the free plan until then.
 */
export function needsTrialStart(t: Pick<TutorRow, "plan" | "stripe_customer_id" | "trial_ends_at" | "created_at">): boolean {
  return t.plan === "trial" && !t.stripe_customer_id && Date.parse(t.trial_ends_at) - Date.parse(t.created_at) < 3600_000;
}

/** Pages: the signed-in tutor, or an admin using their own workspace (redirects anyone else). */
export async function requireTutor(options: { allowTrialStart?: boolean } = {}): Promise<Tutor> {
  const profile = await requireRole("tutor");
  const tutor = (await loadTutor(profile.id)) ?? (profile.role === "admin" ? await ensureAdminWorkspace(profile) : null);
  if (!tutor) throw new Error("This tutor account has no profile row.");
  // Since the free plan (13 Nov 2026), new tutors go straight in; the Solo trial is an upgrade.
  void options;
  return { profile, tutor };
}

/** After a checkout sync: read the tutor row again, past the request cache. */
export async function refreshTutorAfterCheckout(): Promise<Tutor> {
  const profile = await requireRole("tutor");
  const supabase = await createClient();
  const { data } = await supabase.from("tutors").select(TUTOR_COLUMNS).eq("id", profile.id).single<TutorRow>();
  return { profile, tutor: data! };
}

/** Server Actions and Route Handlers: the signed-in tutor, or null. */
export async function currentTutor(): Promise<Tutor | null> {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "tutor" && profile.role !== "admin")) return null;
  const tutor = await loadTutor(profile.id);
  return tutor ? { profile, tutor } : null;
}

/** Start of the current calendar month in Melbourne, as a UTC instant. */
export function monthStart(now = new Date()): Date {
  return zonedDateTimeToUtc(`${dateKeyOf(now).slice(0, 7)}-01`, "00:00");
}

/** AI drafts and translations this month (each is one llm_tokens event). */
export async function draftsThisMonth(tutorId: string, now = new Date()): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("tutor_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("tutor_id", tutorId)
    .eq("kind", "llm_tokens")
    .eq("purpose", "report") // resources have their own cap (src/lib/tutor/resources)
    .gte("created_at", monthStart(now).toISOString());
  if (error) throw error;
  return count ?? 0;
}

/** How many students the tutor has (the free plan covers up to FREE_STUDENT_LIMIT). */
export async function studentCount(tutorId: string): Promise<number> {
  const { count, error } = await createAdminClient().from("tutor_students").select("id", { count: "exact", head: true }).eq("tutor_id", tutorId);
  if (error) throw error;
  return count ?? 0;
}

/** Everything the plan rules need about this tutor (src/lib/tutor/plan.ts). */
export async function planStateFor(tutor: Pick<TutorRow, "id" | "plan" | "trial_ends_at">): Promise<PlanState> {
  return { plan: tutor.plan, trialEndsAt: tutor.trial_ends_at, students: await studentCount(tutor.id) };
}

export async function accessFor(tutor: TutorRow): Promise<Access> {
  const [state, drafts] = await Promise.all([planStateFor(tutor), draftsThisMonth(tutor.id)]);
  return draftAccess({ ...state, draftsThisMonth: drafts });
}

/** Usage logging (spec §7). Service role: tutors can read their usage but not write it. */
export async function logUsage(
  tutorId: string,
  kind: "transcribe_seconds" | "llm_tokens" | "email",
  amount: number,
  purpose: "report" | "resource" | "resource_edit" = "report",
) {
  const { error } = await createAdminClient().from("tutor_usage_events").insert({ tutor_id: tutorId, kind, amount, purpose });
  if (error) console.error("Usage event not recorded", kind, error.message);
}
