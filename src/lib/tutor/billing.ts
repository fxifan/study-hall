import { trackSubscription } from "@/lib/subscription-events";
import "server-only";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { planForStatus } from "./plan";
import { rewardReferralIfDue } from "./referrals";

export { planForStatus };

/**
 * Stripe billing for the tutor product's Solo plan (A$15/month, owner decision 4 Nov 2026). The
 * price and portal configuration are made by scripts/stripe-setup.ts. Subscriptions carry
 * metadata.tutor_id; the webhook and the checkout return page both call syncTutorSubscription.
 * A Solo plan an admin switched on by hand (no Stripe customer) is left alone.
 */
export const TUTOR_PRICE_LOOKUP_KEY = "study-hall-tutor-solo";

let priceId: string | undefined;
export async function tutorSoloPriceId(): Promise<string> {
  if (!priceId) {
    const price = (await getStripe().prices.list({ lookup_keys: [TUTOR_PRICE_LOOKUP_KEY], active: true, limit: 1 })).data[0];
    if (!price) throw new Error("No tutor Solo price in Stripe. Run npm run stripe:setup.");
    priceId = price.id;
  }
  return priceId;
}

let portalId: string | null | undefined;
export async function tutorPortalConfiguration(): Promise<string | undefined> {
  if (portalId === undefined) {
    const configs = await getStripe().billingPortal.configurations.list({ active: true, limit: 100 });
    portalId = configs.data.find((c) => c.metadata?.app === "study-hall-tutor")?.id ?? null;
  }
  return portalId ?? undefined;
}


export async function syncTutorSubscription(subscription: Stripe.Subscription): Promise<void> {
  const tutorId = subscription.metadata.tutor_id;
  if (!tutorId) return;
  const customer = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const { error } = await createAdminClient()
    .from("tutors")
    .update({ plan: planForStatus(subscription.status), stripe_customer_id: customer })
    .eq("id", tutorId);
  if (error) throw error;
  await trackSubscription(subscription, "tutors", "tutor", tutorId);
  // A referred tutor's first real payment (not the trial) gives both tutors a free month, once.
  if (subscription.status === "active") await rewardReferralIfDue(tutorId);
}

export async function syncTutorCheckout(sessionId: string, tutorId: string): Promise<boolean> {
  const session = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  const sub = session.subscription;
  if (session.status !== "complete" || !sub || typeof sub === "string" || sub.metadata.tutor_id !== tutorId) return false;
  await syncTutorSubscription(sub);
  return true;
}
