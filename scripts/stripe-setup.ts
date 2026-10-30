/**
 * One-off Stripe setup for the Study Hall account, in TEST mode. Safe to re-run.
 *   npm run stripe:setup
 *   npm run stripe:setup -- --webhook https://study-hall-murex.vercel.app/api/stripe/webhook
 *
 * 1. For each active plan: a Stripe product and weekly AUD price (lookup key study-hall-<plan id>),
 *    saved to plans.stripe_price_id. Price changes need a new price; this script never edits one.
 * 2. A Customer Portal configuration: update card, see invoices, cancel at the end of the paid week
 *    with an optional reason (owner decision 2026-10-30; reasons feed churn metrics).
 * 3. With --webhook <url>: a webhook endpoint for that URL. Its signing secret is written to
 *    .stripe-webhook-secret (gitignored) instead of being printed.
 */
import { writeFileSync } from "node:fs";
import Stripe from "stripe";
import { createAdminClient, loadEnv, requireEnv } from "./lib/env";

loadEnv();

const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];

async function main() {
  const key = requireEnv("STRIPE_SECRET_KEY");
  if (!/^(sk|rk)_test_/.test(key)) throw new Error("Use a TEST secret key (sk_test_…). This script won't touch live mode.");
  const stripe = new Stripe(key);
  const site = (process.env.NEXT_PUBLIC_PRODUCTION_URL || "https://study-hall-murex.vercel.app").replace(/\/$/, "");
  const db = createAdminClient();

  // 1. Prices for active plans
  const { data: plans, error } = await db.from("plans").select("id, name, price_cents, currency, interval, stripe_price_id").eq("active", true);
  if (error) throw error;
  for (const plan of plans ?? []) {
    const lookupKey = `study-hall-${plan.id}`;
    let price = (await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 })).data[0];
    if (price && (price.unit_amount !== plan.price_cents || price.currency !== plan.currency.toLowerCase())) {
      throw new Error(`Stripe price ${price.id} doesn't match plan "${plan.name}". Create a new plan row for a new price.`);
    }
    if (!price) {
      const product = await stripe.products.create({ name: `Study Hall: ${plan.name}`, metadata: { app: "study-hall", plan_id: plan.id } });
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.price_cents,
        currency: plan.currency.toLowerCase(),
        recurring: { interval: plan.interval as "week" },
        lookup_key: lookupKey,
        metadata: { app: "study-hall", plan_id: plan.id },
      });
      console.log(`Created price ${price.id} for "${plan.name}"`);
    } else {
      // Plans can be renamed; keep the product name Checkout shows in step.
      const productId = typeof price.product === "string" ? price.product : price.product.id;
      const product = await stripe.products.retrieve(productId);
      if (product.name !== `Study Hall: ${plan.name}`) {
        await stripe.products.update(productId, { name: `Study Hall: ${plan.name}` });
        console.log(`Renamed product for "${plan.name}"`);
      }
    }
    if (plan.stripe_price_id !== price.id) {
      const { error: updateError } = await db.from("plans").update({ stripe_price_id: price.id }).eq("id", plan.id);
      if (updateError) throw updateError;
    }
    console.log(`Plan "${plan.name}" -> ${price.id}`);
  }

  // 2. Customer Portal
  const configs = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  const portal: Stripe.BillingPortal.ConfigurationCreateParams = {
    business_profile: { privacy_policy_url: `${site}/legal/privacy`, terms_of_service_url: `${site}/legal/house-rules` },
    default_return_url: `${site}/parent`,
    features: {
      customer_update: { enabled: true, allowed_updates: ["email"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
        cancellation_reason: {
          enabled: true,
          options: ["too_expensive", "unused", "switched_service", "missing_features", "other"],
        },
      },
    },
    metadata: { app: "study-hall" },
  };
  const existing = configs.data.find((c) => c.metadata?.app === "study-hall");
  const config = existing
    ? await stripe.billingPortal.configurations.update(existing.id, portal)
    : await stripe.billingPortal.configurations.create(portal);
  console.log(`Customer Portal configuration ${config.id}`);

  // 3. Webhook endpoint (optional)
  const webhookFlag = process.argv.indexOf("--webhook");
  if (webhookFlag !== -1) {
    const url = process.argv[webhookFlag + 1];
    if (!url?.startsWith("https://")) throw new Error("--webhook needs an https:// URL");
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    if (endpoints.data.some((e) => e.url === url)) {
      console.log(`Webhook endpoint for ${url} already exists (its secret can only be revealed in the Dashboard).`);
    } else {
      const endpoint = await stripe.webhookEndpoints.create({ url, enabled_events: WEBHOOK_EVENTS, metadata: { app: "study-hall" } });
      writeFileSync(".stripe-webhook-secret", `${endpoint.secret}\n`, { mode: 0o600 });
      console.log(`Created webhook endpoint ${endpoint.id}; signing secret saved to .stripe-webhook-secret`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
