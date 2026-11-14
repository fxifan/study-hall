import "server-only";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { AI_ADDON_LOOKUP_KEY, AI_ADDON_PRICE_CENTS, findAiAddonItem } from "./assistant";
import { STUDENT_PRICE_CENTS } from "./server";

/**
 * Stripe for Edumi students: the A$3.99/month student plan, paid by the student or by a parent
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

/** Days in the student free trial. It starts in Checkout with a card and then bills monthly. */
export const STUDENT_TRIAL_DAYS = 7;

/**
 * The trial a checkout should include: a new student gets 7 days; a student still on an older
 * no-card trial keeps its end date (if Stripe can still honour it, 48 hours or more away); anyone
 * who has subscribed before gets none.
 */
async function studentTrial(profileId: string): Promise<{ trial_period_days: number } | { trial_end: number } | Record<string, never>> {
  const { data: plan } = await createAdminClient().from("student_plans").select("status, trial_ends_at, stripe_subscription_id").eq("profile_id", profileId).maybeSingle();
  if (!plan) return { trial_period_days: STUDENT_TRIAL_DAYS };
  const end = Date.parse(plan.trial_ends_at as string);
  if (!plan.stripe_subscription_id && plan.status === "trialing" && end - Date.now() > 48 * 3600_000) return { trial_end: Math.floor(end / 1000) };
  return {};
}

export async function studentCheckoutUrl(input: { profileId: string; payer: "student" | "parent"; email: string | null; customer: string | null; origin: string; returnPath: string }) {
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [await studentLineItem()],
    // A card is always collected, even with A$0 due today: the plan bills when the trial ends.
    payment_method_collection: "always",
    ...(input.customer ? { customer: input.customer } : input.email ? { customer_email: input.email } : {}),
    client_reference_id: input.profileId,
    subscription_data: { ...(await studentTrial(input.profileId)), metadata: { student_profile_id: input.profileId, payer: input.payer, app: "edumi" } },
    metadata: { student_profile_id: input.profileId, payer: input.payer },
    managed_payments: { enabled: false },
    success_url: `${input.origin}${input.returnPath}?checkout={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.origin}${input.returnPath}`,
  });
  return session.url!;
}

const PLAN_STATUS: Partial<Record<Stripe.Subscription.Status, string>> = {
  active: "active",
  trialing: "trialing",
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
  // The EduMi AI add-on rides on the same subscription as a second item (it ends with the plan).
  const addonItem = status === "canceled" || status === "expired" ? null : findAiAddonItem(subscription.items.data);
  const planItem = subscription.items.data.find((i) => i.id !== addonItem) ?? subscription.items.data[0];
  const periodEnd = planItem?.current_period_end;
  const { error } = await createAdminClient()
    .from("student_plans")
    .upsert({
      profile_id: profileId,
      status,
      payer: subscription.metadata.payer === "parent" ? "parent" : "student",
      stripe_customer_id: customer,
      stripe_subscription_id: subscription.id,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      ...(subscription.trial_end ? { trial_ends_at: new Date(subscription.trial_end * 1000).toISOString() } : {}),
      ai_addon_item_id: addonItem,
      ...(addonItem ? {} : { ai_addon_since: null }),
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

// --- EduMi AI add-on (A$2.99/month) ------------------------------------------------------------

/** The add-on's Stripe price: made on first use if `npm run stripe:setup` hasn't made it yet. */
async function aiAddonPriceId(): Promise<string> {
  const stripe = getStripe();
  const found = (await stripe.prices.list({ lookup_keys: [AI_ADDON_LOOKUP_KEY], active: true, limit: 1 })).data[0];
  if (found) return found.id;
  const product = await stripe.products.create({ name: "Edumi AI", metadata: { app: "edumi", product: "ai_addon" } });
  const price = await stripe.prices.create({
    product: product.id,
    currency: "aud",
    unit_amount: AI_ADDON_PRICE_CENTS,
    recurring: { interval: "month" },
    lookup_key: AI_ADDON_LOOKUP_KEY,
    metadata: { app: "edumi", addon: "ai" },
  });
  return price.id;
}

export class AddonError extends Error {}

/**
 * Add EduMi AI to the student's own subscription. During the free trial it trials too; after
 * that Stripe pro-rates it onto the next invoice. Only a plan the student pays for themselves: a
 * parent's card isn't charged from the student's account.
 */
export async function addAiAddon(profileId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: plan } = await admin.from("student_plans").select("status, payer, stripe_subscription_id").eq("profile_id", profileId).maybeSingle();
  if (!plan?.stripe_subscription_id || plan.payer !== "student" || !["active", "trialing", "past_due"].includes(plan.status as string)) {
    throw new AddonError("Add EduMi AI from a plan you pay for yourself.");
  }
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(plan.stripe_subscription_id as string);
  if (findAiAddonItem(subscription.items.data)) return syncStudentSubscription(subscription);
  await stripe.subscriptionItems.create(
    { subscription: subscription.id, price: await aiAddonPriceId(), quantity: 1, proration_behavior: "create_prorations", metadata: { addon: "ai" } },
    // A double click within the same minute creates one item, not two.
    { idempotencyKey: `ai-addon:${subscription.id}:${new Date().toISOString().slice(0, 16)}` },
  );
  await admin.from("student_plans").update({ ai_addon_since: new Date().toISOString() }).eq("profile_id", profileId);
  await syncStudentSubscription(await stripe.subscriptions.retrieve(subscription.id));
}

/** Take EduMi AI off: Stripe credits the unused part of the month on the next invoice. */
export async function removeAiAddon(profileId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: plan } = await admin.from("student_plans").select("payer, stripe_subscription_id").eq("profile_id", profileId).maybeSingle();
  if (!plan?.stripe_subscription_id || plan.payer !== "student") throw new AddonError("No add-on to remove.");
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(plan.stripe_subscription_id as string);
  const item = findAiAddonItem(subscription.items.data);
  if (item) await stripe.subscriptionItems.del(item, { proration_behavior: "create_prorations" });
  await syncStudentSubscription(await stripe.subscriptions.retrieve(subscription.id));
}
