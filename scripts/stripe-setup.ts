/**
 * One-off Stripe setup for the Edumi account. Test mode by default. Safe to re-run.
 *   npm run stripe:setup
 *   npm run stripe:setup -- --webhook https://study-hall-murex.vercel.app/api/stripe/webhook
 * Live mode (owner only, in their own terminal; the key is never saved or printed):
 *   STRIPE_SECRET_KEY=sk_live_… npm run stripe:setup -- --live --webhook https://<site>/api/stripe/webhook
 *   This points plans.stripe_price_id at the live prices, so test checkouts stop working after it.
 *
 * 1. For each active plan: a Stripe product and weekly AUD price (lookup key study-hall-<plan id>),
 *    saved to plans.stripe_price_id. Price changes need a new price; this script never edits one.
 * 2. A Customer Portal configuration: update card, see invoices, switch plan, cancel at the end of
 *    the paid week with an optional reason (owner decision 2026-10-30; reasons feed churn metrics).
 * 2b. The tutor product's Solo plan: A$15/month (lookup key study-hall-tutor-solo).
 * 2c/2d. The Edumi student plan (A$11.99/month) and the EduMi AI add-on (A$2.99/month).
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
  const live = process.argv.includes("--live");
  if (live ? !/^(sk|rk)_live_/.test(key) : !/^(sk|rk)_test_/.test(key)) {
    throw new Error(live ? "--live needs a live secret key (sk_live_…)." : "Use a TEST secret key (sk_test_…), or pass --live with a live key.");
  }
  console.log(live ? "LIVE mode" : "Test mode");
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
      const product = await stripe.products.create({ name: `Edumi Study Hall: ${plan.name}`, metadata: { app: "study-hall", plan_id: plan.id } });
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
      if (product.name !== `Edumi Study Hall: ${plan.name}`) {
        await stripe.products.update(productId, { name: `Edumi Study Hall: ${plan.name}` });
        console.log(`Renamed product for "${plan.name}"`);
      }
    }
    if (plan.stripe_price_id !== price.id) {
      const { error: updateError } = await db.from("plans").update({ stripe_price_id: price.id }).eq("id", plan.id);
      if (updateError) throw updateError;
    }
    console.log(`Plan "${plan.name}" -> ${price.id}`);
  }

  // 2. Customer Portal. Families can switch between the plans on sale: moving up starts now and they
  // pay the difference for the week; moving down starts at the next renewal. Quantity stays fixed.
  const { data: onSale, error: onSaleError } = await db.from("plans").select("stripe_price_id").eq("active", true);
  if (onSaleError) throw onSaleError;
  const switchable = await Promise.all(
    (onSale ?? []).map(async (plan) => {
      const price = await stripe.prices.retrieve(plan.stripe_price_id!);
      return { product: price.product as string, prices: [price.id] };
    }),
  );
  const configs = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  const portal: Stripe.BillingPortal.ConfigurationCreateParams = {
    business_profile: { headline: "Edumi Study Hall", privacy_policy_url: `${site}/legal/privacy`, terms_of_service_url: `${site}/legal/house-rules` },
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
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        products: switchable,
        proration_behavior: "always_invoice",
        schedule_at_period_end: { conditions: [{ type: "decreasing_item_amount" }] },
      },
    },
    metadata: { app: "study-hall" },
  };
  const existing = configs.data.find((c) => c.metadata?.app === "study-hall");
  const config = existing
    ? await stripe.billingPortal.configurations.update(existing.id, portal)
    : await stripe.billingPortal.configurations.create(portal);
  console.log(`Customer Portal configuration ${config.id}`);

  // 2b. Tutor Solo plan
  const tutorKey = "study-hall-tutor-solo";
  let tutorPrice = (await stripe.prices.list({ lookup_keys: [tutorKey], limit: 1 })).data[0];
  if (!tutorPrice) {
    const product = await stripe.products.create({ name: "Edumi for Tutors: Solo", metadata: { app: "study-hall", product: "tutor" } });
    tutorPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: 1500,
      currency: "aud",
      recurring: { interval: "month" },
      lookup_key: tutorKey,
      metadata: { app: "study-hall", product: "tutor" },
    });
    console.log(`Created tutor Solo price ${tutorPrice.id}`);
  } else {
    // Rebrand-safe: keep the product name Checkout and receipts show in step.
    const productId = typeof tutorPrice.product === "string" ? tutorPrice.product : tutorPrice.product.id;
    const product = await stripe.products.retrieve(productId);
    if (product.name !== "Edumi for Tutors: Solo") {
      await stripe.products.update(productId, { name: "Edumi for Tutors: Solo" });
      console.log("Renamed tutor product to Edumi for Tutors: Solo");
    }
  }
  console.log(`Tutor Solo -> ${tutorPrice.id}`);
  const tutorPortal: Stripe.BillingPortal.ConfigurationCreateParams = {
    business_profile: { headline: "Edumi for Tutors", privacy_policy_url: `${site}/legal/privacy`, terms_of_service_url: `${site}/tutors/terms` },
    default_return_url: `${site}/app/settings`,
    features: {
      customer_update: { enabled: true, allowed_updates: ["email", "address", "tax_id"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
    },
    metadata: { app: "study-hall-tutor" },
  };
  const existingTutor = configs.data.find((c) => c.metadata?.app === "study-hall-tutor");
  const tutorConfig = existingTutor
    ? await stripe.billingPortal.configurations.update(existingTutor.id, tutorPortal)
    : await stripe.billingPortal.configurations.create(tutorPortal);
  console.log(`Tutor Customer Portal configuration ${tutorConfig.id}`);

  // 2c. Edumi student plan (A$11.99/month, owner decision 6 Nov 2026). The 7-day trial is Edumi's
  // own (student_plans.trial_ends_at), so the price carries no Stripe trial.
  const studentKey = "edumi-student-monthly";
  let studentPrice = (await stripe.prices.list({ lookup_keys: [studentKey], limit: 1 })).data[0];
  if (!studentPrice) {
    const product = await stripe.products.create({ name: "Edumi Student", metadata: { app: "edumi", product: "student" } });
    studentPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: 1199,
      currency: "aud",
      recurring: { interval: "month" },
      lookup_key: studentKey,
      metadata: { app: "edumi", product: "student" },
    });
    console.log(`Created Edumi Student price ${studentPrice.id}`);
  }
  console.log(`Edumi Student -> ${studentPrice.id}`);

  // 2d. EduMi AI add-on (A$2.99/month, owner decision 12 Nov 2026): a second item on the student's
  // own subscription (src/lib/social/billing.ts addAiAddon). The app also makes it on first use.
  const aiKey = "edumi-ai-addon-monthly";
  let aiPrice = (await stripe.prices.list({ lookup_keys: [aiKey], limit: 1 })).data[0];
  if (!aiPrice) {
    const product = await stripe.products.create({ name: "Edumi AI", metadata: { app: "edumi", product: "ai_addon" } });
    aiPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: 299,
      currency: "aud",
      recurring: { interval: "month" },
      lookup_key: aiKey,
      metadata: { app: "edumi", addon: "ai" },
    });
    console.log(`Created Edumi AI add-on price ${aiPrice.id}`);
  }
  console.log(`Edumi AI add-on -> ${aiPrice.id}`);

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
