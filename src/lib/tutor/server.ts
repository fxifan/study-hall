import "server-only";
import { cache } from "react";
import { getCurrentProfile, requireRole, type CurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { dateKeyOf, zonedDateTimeToUtc } from "@/lib/time";
import type { TutorPlan } from "./config";
import { draftAccess, type Access } from "./plan";

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
};

export type Tutor = { profile: CurrentProfile; tutor: TutorRow };

const TUTOR_COLUMNS =
  "id, display_name, business_name, abn, gst_registered, default_rate_cents, bank_account_name, bank_bsb_enc, bank_acct_enc, report_langs, invoice_due_days, overdue_reminders, plan, trial_ends_at";

const loadTutor = cache(async (id: string): Promise<TutorRow | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("tutors").select(TUTOR_COLUMNS).eq("id", id).maybeSingle<TutorRow>();
  return data;
});

/** Pages: the signed-in tutor (redirects anyone else). */
export async function requireTutor(): Promise<Tutor> {
  const profile = await requireRole("tutor");
  const tutor = await loadTutor(profile.id);
  if (!tutor) throw new Error("This tutor account has no profile row.");
  return { profile, tutor };
}

/** Server Actions and Route Handlers: the signed-in tutor, or null. */
export async function currentTutor(): Promise<Tutor | null> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "tutor") return null;
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
    .gte("created_at", monthStart(now).toISOString());
  if (error) throw error;
  return count ?? 0;
}

export async function accessFor(tutor: TutorRow): Promise<Access> {
  return draftAccess({ plan: tutor.plan, trialEndsAt: tutor.trial_ends_at, draftsThisMonth: await draftsThisMonth(tutor.id) });
}

/** Usage logging (spec §7). Service role: tutors can read their usage but not write it. */
export async function logUsage(tutorId: string, kind: "transcribe_seconds" | "llm_tokens" | "email", amount: number) {
  const { error } = await createAdminClient().from("tutor_usage_events").insert({ tutor_id: tutorId, kind, amount });
  if (error) console.error("Usage event not recorded", kind, error.message);
}
