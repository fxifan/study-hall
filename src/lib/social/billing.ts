import "server-only";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { STUDENT_PRICE_CENTS } from "./server";

/**
 * Stripe for Edumi students: the A$11.99/month student plan, paid by the student or by a parent
 * through a shared link. Subscriptions carry metadata.student_profile_id. The webhook and the return
 * pages both call the sync functions, which are idempotent.
 */
export const STUDENT_PRICE_LOOKUP_KEY = "edumi-student-monthly";

async function studentLineItem(): Promise<Stripe.Checkout.SessionCreateParams.LineItem> {
  const price = (await getStripe().prices.list({ lookup_keys: [STUDENT_PRICE_LOOKUP_KEY], active: true, limit: 1 })).data[0];
  if (price) return { price: price.id, quantity: 1 };
  // Before `npm run stripe:setup` has made the price: same amount, inline.
  return {
    quantity: 1,
    price_data: { currency: "aud", unit_amount: STUDENT_PRICE_CENTS, recurring: { interval: "month" }, product_data: { name: "Edumi Student" } },
  };
}

export async function studentCheckoutUrl(input: { profileId: string; payer: "student" | "parent"; email: string | null; customer: string | null; origin: string; returnPath: string }) {
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [await studentLineItem()],
    ...(input.customer ? { customer: input.customer } : input.email ? { customer_email: input.email } : {}),
    client_reference_id: input.profileId,
    subscription_data: { metadata: { student_profile_id: input.profileId, payer: input.payer, app: "edumi" } },
    metadata: { student_profile_id: input.profileId, payer: input.payer },
    managed_payments: { enabled: false },
    success_url: `${input.origin}${input.returnPath}?checkout={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.origin}${input.returnPath}`,
  });
  return session.url!;
}

const PLAN_STATUS: Partial<Record<Stripe.Subscription.Status, string>> = {
  active: "active",
  trialing: "active",
  past_due: "past_due",
  unpaid: "past_due",
  canceled: "canceled",
  incomplete_expired: "expired",
};

export async function syncStudentSubscription(subscription: Stripe.Subscription): Promise<void> {
  const profileId = subscription.metadata.student_profile_id;
  if (!profileId) return;
  const status = PLAN_STATUS[subscription.status];
  if (!status) return; // incomplete: wait for the next event
  const customer = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const periodEnd = subscription.items.data[0]?.current_period_end;
  const { error } = await createAdminClient()
    .from("student_plans")
    .upsert({
      profile_id: profileId,
      status,
      payer: subscription.metadata.payer === "parent" ? "parent" : "student",
      stripe_customer_id: customer,
      stripe_subscription_id: subscription.id,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
}

export async function syncStudentCheckout(sessionId: string, profileId: string): Promise<boolean> {
  const session = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  const sub = session.subscription;
  if (session.status !== "complete" || !sub || typeof sub === "string" || sub.metadata.student_profile_id !== profileId) return false;
  await syncStudentSubscription(sub);
  return true;
}
