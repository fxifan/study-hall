import "server-only";
import type Stripe from "stripe";
import { track, type Product } from "./events";

/**
 * Subscription lifecycle events from Stripe's state (webhook and checkout return both call this;
 * dedupe keys make each transition count once): started when it first becomes active, cancelled
 * when it ends, payment_failed for each billing period it goes past due or unpaid.
 */
export async function trackSubscription(sub: Stripe.Subscription, product: Product, role: "parent" | "tutor", userId: string) {
  const plan = sub.items.data[0]?.price.lookup_key ?? sub.items.data[0]?.price.id ?? null;
  if (sub.status === "active" || sub.status === "trialing") {
    await track({ name: "subscription_started", product, role, userId, objectType: "subscription", props: { status: sub.status, plan }, dedupeKey: `sub_started:${sub.id}` });
  }
  if (sub.status === "canceled" || sub.status === "incomplete_expired") {
    await track({ name: "subscription_cancelled", product, role, userId, objectType: "subscription", props: { status: sub.status, plan, reason: sub.cancellation_details?.feedback ?? undefined }, dedupeKey: `sub_cancelled:${sub.id}` });
  }
  if (sub.status === "past_due" || sub.status === "unpaid") {
    const period = sub.items.data[0]?.current_period_end ?? 0;
    await track({ name: "payment_failed", product, role, userId, objectType: "subscription", props: { status: sub.status, plan }, dedupeKey: `payment_failed:${sub.id}:${period}` });
  }
}
