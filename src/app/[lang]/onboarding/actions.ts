"use server";

import { createHash } from "node:crypto";
import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, localizePath, type Locale } from "@/i18n/config";
import { getCurrentProfile, type CurrentProfile } from "@/lib/auth";
import { emailLimitKind } from "@/lib/email";
import { stripeCustomerFor } from "@/lib/billing";
import { getCurrentLegalDocument } from "@/lib/legal";
import { siteOrigin } from "@/lib/site";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Server Actions can't read the [lang] root param, so the language comes from the locale cookie.
async function actionLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

async function onboardingUrl(query = "") {
  return localizePath("/onboarding", await actionLocale()) + query;
}

async function requireParent(): Promise<CurrentProfile> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "parent") throw new Error("Only a signed-in parent can do this.");
  return profile;
}

// --- Step 0: create the parent account (signed out) --------------------------------------------

export type StartState =
  | { status: "idle" }
  | { status: "sent" }
  | { status: "error"; code: "invalid_email" | "rate_limited" | "email_quota" | "send_failed" };

export async function startSignUp(_prev: StartState, formData: FormData): Promise<StartState> {
  const parsed = z.object({ email: z.email().trim().toLowerCase() }).safeParse({ email: formData.get("email") });
  if (!parsed.success) return { status: "error", code: "invalid_email" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    // New users become parents (the auth trigger's default role); students are only created by parents.
    options: { shouldCreateUser: true, emailRedirectTo: `${await siteOrigin()}/auth/confirm` },
  });
  if (error) {
    const limit = emailLimitKind(error);
    if (limit === "cooldown") return { status: "error", code: "rate_limited" };
    if (limit === "quota") {
      console.error("Auth email quota reached (Supabase Auth > Rate Limits)", error.message);
      return { status: "error", code: "email_quota" };
    }
    console.error("Sign-up email failed", error.code, error.message);
    return { status: "error", code: "send_failed" };
  }
  return { status: "sent" };
}

// --- Step 1: parent details ---------------------------------------------------------------------

const SOURCES = ["wechat_referral", "parent_referral", "social_media", "search", "other"] as const;

export async function saveDetails(formData: FormData) {
  const parent = await requireParent();
  const parsed = z
    .object({
      fullName: z.string().trim().min(1).max(100),
      source: z.enum([...SOURCES, "none"]),
    })
    .safeParse({ fullName: formData.get("fullName"), source: formData.get("source") ?? "none" });
  if (!parsed.success) redirect(await onboardingUrl("?error=details"));

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      acquisition_source: parsed.data.source === "none" ? null : parsed.data.source,
    })
    .eq("id", parent.id);
  if (error) throw error;
  refresh();
}

// --- Step 2: children ---------------------------------------------------------------------------

export type AddStudentState = { status: "idle" | "added" } | { status: "error"; code: "invalid" | "email_taken" | "failed" };

const studentSchema = z.object({
  firstName: z.string().trim().min(1).max(50),
  lastInitial: z
    .string()
    .trim()
    .regex(/^\p{L}$/u)
    .transform((v) => v.toUpperCase()),
  yearLevel: z.coerce.number().int().min(7).max(12),
  school: z
    .string()
    .trim()
    .max(100)
    .transform((v) => v || null),
  email: z.email().trim().toLowerCase(),
});

/**
 * Creates the child's login account (role student, fixed by app_metadata) and their student record,
 * linked to this parent. They get a login email only once the subscription is paid.
 */
export async function addStudent(_prev: AddStudentState, formData: FormData): Promise<AddStudentState> {
  const parent = await requireParent();
  const parsed = studentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", code: "invalid" };
  const { firstName, lastInitial, yearLevel, school, email } = parsed.data;
  const admin = createAdminClient();

  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { role: "student", org_id: parent.orgId },
    user_metadata: { full_name: `${firstName} ${lastInitial}.` },
  });
  if (userError || !created.user) {
    const taken = userError?.code === "email_exists" || /already/i.test(userError?.message ?? "");
    if (!taken) console.error("Creating student login failed", userError?.code, userError?.message);
    return { status: "error", code: taken ? "email_taken" : "failed" };
  }
  const userId = created.user.id;

  try {
    // The auth trigger creates the profile; make sure it's a student in this org.
    const profile = await admin
      .from("profiles")
      .upsert({ id: userId, org_id: parent.orgId, role: "student", full_name: `${firstName} ${lastInitial}.`, email });
    if (profile.error) throw profile.error;
    const student = await admin
      .from("students")
      .insert({
        org_id: parent.orgId,
        profile_id: userId,
        first_name: firstName,
        last_initial: lastInitial,
        year_level: yearLevel,
        school,
        status: "invited",
      })
      .select("id")
      .single();
    if (student.error) throw student.error;
    const link = await admin.from("parent_students").insert({ parent_id: parent.id, student_id: student.data.id });
    if (link.error) throw link.error;
  } catch (error) {
    console.error("Adding student failed", error);
    await admin.auth.admin.deleteUser(userId); // cascades to the profile and student record
    return { status: "error", code: "failed" };
  }

  refresh();
  return { status: "added" };
}

/** Removes a child who hasn't started yet (status invited), including their login account. */
export async function removeStudent(formData: FormData) {
  const parent = await requireParent();
  const studentId = z.uuid().parse(formData.get("studentId"));
  const admin = createAdminClient();
  const { data: student } = await admin
    .from("students")
    .select("id, profile_id, status, parent_students!inner(parent_id)")
    .eq("id", studentId)
    .eq("parent_students.parent_id", parent.id)
    .maybeSingle();
  if (!student || student.status !== "invited") throw new Error("Only a child who hasn't started can be removed here.");

  const { error } = await admin.from("students").delete().eq("id", studentId);
  if (error) throw error;
  if (student.profile_id) await admin.auth.admin.deleteUser(student.profile_id);
  refresh();
}

// --- Step 3: consent ----------------------------------------------------------------------------

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256")
    .update(`${process.env.IP_HASH_SALT ?? ""}:${ip}`)
    .digest("hex");
}

/**
 * Records consent to the current house rules and privacy notice for each child who isn't active yet
 * (spec §4.1 step 4). Both boxes must be ticked; nothing is pre-ticked.
 */
export async function recordConsent(formData: FormData) {
  const parent = await requireParent();
  if (formData.get("houseRules") !== "on" || formData.get("privacy") !== "on") {
    redirect(await onboardingUrl("?error=consent_required#consent"));
  }
  const [houseRules, privacy] = await Promise.all([
    getCurrentLegalDocument("house_rules"),
    getCurrentLegalDocument("privacy_child_safety"),
  ]);
  if (!houseRules || !privacy) throw new Error("Legal documents aren't published.");

  const supabase = await createClient();
  const { data: students } = await supabase.from("students").select("id").neq("status", "active");
  const { data: existing } = await supabase.from("consents").select("student_id, document, document_version");
  const has = new Set((existing ?? []).map((c) => `${c.student_id}:${c.document}:${c.document_version}`));
  const ipHash = hashIp((await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null);

  const rows = (students ?? []).flatMap((s) =>
    [houseRules, privacy]
      .filter((doc) => !has.has(`${s.id}:${doc.document}:${doc.version}`))
      .map((doc) => ({
        student_id: s.id,
        parent_id: parent.id,
        document: doc.document,
        document_version: doc.version,
        ip_hash: ipHash,
      })),
  );
  if (rows.length) {
    const { error } = await supabase.from("consents").insert(rows);
    if (error) throw error;
  }
  refresh();
}

// --- Step 4: checkout ---------------------------------------------------------------------------

/**
 * Starts Stripe Checkout for every child who has agreed to the current documents and isn't active.
 * Pricing is per student: quantity = number of children.
 */
export async function startCheckout(formData: FormData) {
  const parent = await requireParent();
  if (!stripeConfigured()) redirect(await onboardingUrl("?error=not_configured#pay"));
  const planId = z.uuid().parse(formData.get("planId"));
  const locale = await actionLocale();

  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("plans")
    .select("id, stripe_price_id, includes_tutoring")
    .eq("id", planId)
    .eq("active", true)
    .maybeSingle();
  if (!plan?.stripe_price_id) redirect(await onboardingUrl("?error=not_configured#pay"));

  const [houseRules, privacy] = await Promise.all([
    getCurrentLegalDocument("house_rules"),
    getCurrentLegalDocument("privacy_child_safety"),
  ]);
  const { data: students } = await supabase
    .from("students")
    .select("id, consents(document, document_version), student_subjects(subject_id)")
    .neq("status", "active");
  const ready = (students ?? []).filter((s) =>
    [houseRules, privacy].every((doc) =>
      doc ? s.consents.some((c) => c.document === doc.document && c.document_version === doc.version) : false,
    ),
  );
  if (!ready.length) redirect(await onboardingUrl("?error=need_consent#pay"));
  // Tutors prepare from the subjects list, so the tutoring plan needs at least one per child.
  if (plan.includes_tutoring && ready.some((s) => !s.student_subjects.length)) {
    redirect(await onboardingUrl("?error=need_subjects#pay"));
  }

  const origin = await siteOrigin();
  const customer = await stripeCustomerFor(parent.id);
  const metadata = { parent_id: parent.id, plan_id: plan.id, student_ids: ready.map((s) => s.id).join(",") };
  let checkoutUrl: string | null = null;
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: plan.stripe_price_id, quantity: ready.length }],
      ...(customer ? { customer } : { customer_email: parent.email }),
      client_reference_id: parent.id,
      metadata,
      subscription_data: { metadata },
      locale: locale === "zh" ? "zh" : "en",
      // New Stripe accounts default to Managed Payments (Stripe as merchant of record, extra fees).
      // The spec's stack is plain Checkout + Billing (Study Hall, a sole trader, isn't registered for
      // GST), so opt out here until the owner decides otherwise.
      managed_payments: { enabled: false },
      success_url: `${origin}${localizePath("/onboarding/complete", locale)}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${localizePath("/onboarding", locale)}?checkout=cancelled#pay`,
    });
    checkoutUrl = session.url;
  } catch (error) {
    console.error("Creating Checkout session failed", error);
  }
  redirect(checkoutUrl ?? (await onboardingUrl("?error=checkout_failed#pay")));
}
