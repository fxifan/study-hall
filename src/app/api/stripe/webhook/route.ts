import type Stripe from "stripe";
import { syncSubscription } from "@/lib/billing";
import { siteOrigin } from "@/lib/site";
import { getStripe } from "@/lib/stripe";

/**
 * Stripe webhook (spec §6). Verifies the signature, then mirrors subscription state into the
 * database. Configure the endpoint with scripts/stripe-setup.ts; it needs STRIPE_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook secret not configured", { status: 500 });

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), request.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const origin = await siteOrigin();
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode === "subscription" && typeof session.subscription === "string") {
        await syncSubscription(await stripe.subscriptions.retrieve(session.subscription), origin);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object, origin);
      break;
  }
  return Response.json({ received: true });
}
