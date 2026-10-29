import "server-only";
import { createClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { isReservedTestEmail } from "@/lib/email";
import { enrolEligibleStudents } from "@/lib/sessions";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@/lib/subscription-status";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Subscription state is driven by Stripe (spec §10). Both the webhook and the checkout return page
 * call these, so a payment is recorded even when the webhook can't reach this environment
 * (local dev). Everything here is idempotent.
 *
 * Pricing is per student (owner decision, 2026-10-30): the subscription quantity is the number of
 * students in the checkout, listed in metadata.student_ids.
 */

export async function syncCheckoutSession(sessionId: string, origin: string): Promise<{ parentId: string } | null> {
  const session = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  if (session.status !== "complete" || !session.subscription || typeof session.subscription === "string") return null;
  await syncSubscription(session.subscription, origin);
  return { parentId: session.subscription.metadata.parent_id };
}

export async function syncSubscription(subscription: Stripe.Subscription, origin: string): Promise<void> {
  const parentId = subscription.metadata.parent_id;
  if (!parentId) return; // not created by Study Hall's checkout
  const admin = createAdminClient();
  const item = subscription.items.data[0];

  const { data: plan } = await admin.from("plans").select("id").eq("stripe_price_id", item.price.id).maybeSingle();
  if (!plan) throw new Error(`No plan uses Stripe price ${item.price.id}`);

  const { error } = await admin.from("subscriptions").upsert(
    {
      parent_id: parentId,
      plan_id: plan.id,
      stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      current_period_end: new Date(item.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      quantity: item.quantity ?? 1,
    },
    { onConflict: "stripe_subscription_id" },
  );
  if (error) throw error;

  const studentIds = (subscription.metadata.student_ids ?? "").split(",").filter(Boolean);
  await updateStudentAccess(parentId, studentIds, origin);
}

/**
 * Students in an active subscription become active (and get a login email and enrolments);
 * when the parent has no active subscription left, their active students become cancelled.
 */
async function updateStudentAccess(parentId: string, studentIds: string[], origin: string) {
  const admin = createAdminClient();
  const { data: active } = await admin
    .from("subscriptions")
    .select("id")
    .eq("parent_id", parentId)
    .in("status", [...ACTIVE_SUBSCRIPTION_STATUSES])
    .limit(1);
  const { data: links } = await admin.from("parent_students").select("student_id").eq("parent_id", parentId);
  const mine = new Set((links ?? []).map((l) => l.student_id));

  if (active?.length) {
    const toActivate = studentIds.filter((id) => mine.has(id));
    if (!toActivate.length) return;
    const { data: activated, error } = await admin
      .from("students")
      .update({ status: "active" })
      .in("id", toActivate)
      .neq("status", "active")
      .select("id, profile_id");
    if (error) throw error;
    if (activated?.length) {
      await enrolEligibleStudents({ studentIds: activated.map((s) => s.id) });
      await sendLoginEmails(activated.map((s) => s.profile_id).filter((id): id is string => Boolean(id)), origin);
    }
  } else if (mine.size) {
    const { data: cancelled, error } = await admin
      .from("students")
      .update({ status: "cancelled" })
      .in("id", [...mine])
      .eq("status", "active")
      .select("id");
    if (error) throw error;
    // Take them off future rosters; past attendance and reports stay.
    if (cancelled?.length) {
      const { data: upcoming } = await admin.from("sessions").select("id").gt("starts_at", new Date().toISOString());
      const sessionIds = (upcoming ?? []).map((s) => s.id);
      if (sessionIds.length) {
        const { error: unenrolError } = await admin
          .from("enrolments")
          .delete()
          .in("student_id", cancelled.map((s) => s.id))
          .in("session_id", sessionIds);
        if (unenrolError) throw unenrolError;
      }
    }
  }
}

/**
 * Email newly active students a login link. Uses Supabase Auth's mailer, which (until Resend SMTP is
 * configured) only delivers to the Supabase project's team, so failures are logged, not fatal.
 */
async function sendLoginEmails(profileIds: string[], origin: string) {
  if (!profileIds.length) return;
  const admin = createAdminClient();
  const { data: profiles } = await admin.from("profiles").select("email").in("id", profileIds);
  const auth = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } }).auth;
  // Test accounts use reserved domains: sending would only burn the hourly email quota.
  for (const { email } of (profiles ?? []).filter((p) => !isReservedTestEmail(p.email))) {
    const { error } = await auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/confirm` },
    });
    if (error) console.warn("Student login email not sent", error.code ?? error.message);
  }
}

/** The parent's Stripe customer, from their most recent subscription. */
export async function stripeCustomerFor(parentId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("parent_id", parentId)
    .not("stripe_customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.stripe_customer_id ?? null;
}

let portalConfigurationId: string | null | undefined;

/** The Customer Portal configuration made by scripts/stripe-setup.ts (metadata app=study-hall). */
export async function studyHallPortalConfiguration(): Promise<string | undefined> {
  if (portalConfigurationId === undefined) {
    const configs = await getStripe().billingPortal.configurations.list({ active: true, limit: 100 });
    portalConfigurationId = configs.data.find((c) => c.metadata?.app === "study-hall")?.id ?? null;
  }
  return portalConfigurationId ?? undefined;
}
