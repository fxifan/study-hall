"use server";

import { redirect } from "next/navigation";
import { siteOrigin } from "@/lib/site";
import { getStripe } from "@/lib/stripe";
import { tutorPortalConfiguration, tutorSoloPriceId } from "@/lib/tutor/billing";
import { requireTutorAction } from "./_lib/action-helpers";

/** Stripe Checkout for Solo (A$15/month). Reuses the tutor's Stripe customer if they had one. */
export async function startSoloCheckout() {
  const { profile, tutor } = await requireTutorAction();
  const origin = await siteOrigin();
  const customer = tutor.stripe_customer_id ?? undefined;
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: await tutorSoloPriceId(), quantity: 1 }],
    ...(customer ? { customer } : { customer_email: profile.email ?? undefined }),
    client_reference_id: tutor.id,
    subscription_data: { metadata: { tutor_id: tutor.id, app: "study-hall-tutor" } },
    metadata: { tutor_id: tutor.id },
    // Plain Checkout + Billing, as for families (no Managed Payments; not registered for GST).
    managed_payments: { enabled: false },
    success_url: `${origin}/app/settings?checkout={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/app/settings`,
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
