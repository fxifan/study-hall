"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, localizePath } from "@/i18n/config";
import { getCurrentProfile } from "@/lib/auth";
import { stripeCustomerFor, studyHallPortalConfiguration } from "@/lib/billing";
import { siteOrigin } from "@/lib/site";
import { getStripe } from "@/lib/stripe";

/** Opens Stripe's Customer Portal (change card, invoices, switch plan, cancel at the end of the paid week). */
export async function openBillingPortal() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "parent") throw new Error("Only a signed-in parent can manage billing.");
  const customer = await stripeCustomerFor(profile.id);
  if (!customer) throw new Error("No Stripe customer for this parent yet.");

  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
  const session = await getStripe().billingPortal.sessions.create({
    customer,
    configuration: await studyHallPortalConfiguration(),
    locale: locale === "zh" ? "zh" : "en",
    return_url: `${await siteOrigin()}${localizePath("/parent", locale)}`,
  });
  redirect(session.url);
}
