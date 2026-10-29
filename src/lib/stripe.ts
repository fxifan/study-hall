import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Stripe client for the Study Hall account. Refuses live keys unless STRIPE_ALLOW_LIVE=1, so test
 * mode can't be left behind by accident (product brief: no live payment changes without approval).
 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  if (/^(sk|rk)_live_/.test(key) && process.env.STRIPE_ALLOW_LIVE !== "1") {
    throw new Error("Refusing a live Stripe key. Set STRIPE_ALLOW_LIVE=1 once live payments are approved.");
  }
  client ??= new Stripe(key);
  return client;
}
