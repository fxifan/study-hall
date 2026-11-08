"use server";

import { redirect } from "next/navigation";
import { siteOrigin } from "@/lib/site";
import { getStripe } from "@/lib/stripe";
import { tutorPortalConfiguration, tutorSoloPriceId } from "@/lib/tutor/billing";
import { PLANS } from "@/lib/tutor/config";
import { needsTrialStart } from "@/lib/tutor/server";
import { requireTutorAction } from "./_lib/action-helpers";

/**
 * Stripe Checkout for Solo (A$15/month), always collecting a card. New tutors get the 14-day trial
 * here; a tutor still on an older no-card trial keeps its end date (if 48 hours or more away).
 * Reuses the tutor's Stripe customer if they had one.
 */
export async function startSoloCheckout(formData?: FormData) {
  const { profile, tutor } = await requireTutorAction();
  const origin = await siteOrigin();
  const customer = tutor.stripe_customer_id ?? undefined;
  const fromStart = formData?.get("from") === "start";
  const trialLeft = Date.parse(tutor.trial_ends_at) - Date.now();
  const trial = needsTrialStart(tutor)
    ? { trial_period_days: PLANS.trial.days }
    : tutor.plan === "trial" && !customer && trialLeft > 48 * 3600_000
      ? { trial_end: Math.floor(Date.parse(tutor.trial_ends_at) / 1000) }
      : {};
  const back = fromStart ? "/app/start" : "/app/settings";
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: await tutorSoloPriceId(), quantity: 1 }],
    payment_method_collection: "always",
    ...(customer ? { customer } : { customer_email: profile.email ?? undefined }),
    client_reference_id: tutor.id,
    subscription_data: { ...trial, metadata: { tutor_id: tutor.id, app: "study-hall-tutor" } },
    metadata: { tutor_id: tutor.id },
    // Plain Checkout + Billing, as for families (no Managed Payments; not registered for GST).
    managed_payments: { enabled: false },
    success_url: `${origin}${back}?checkout={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${back}`,
  });
  redirect(session.url!);
}

/** Stripe's Customer Portal: card, invoices, cancel at the end of the paid month. */
export async function openTutorPortal() {
  const { tutor } = await requireTutorAction();
  const customer = tutor.stripe_customer_id;
  if (!customer) throw new Error("No Stripe customer for this tutor yet.");
  const session = await getStripe().billingPortal.sessions.create({
    customer,
    configuration: await tutorPortalConfiguration(),
    return_url: `${await siteOrigin()}/app/settings`,
  });
  redirect(session.url);
}
