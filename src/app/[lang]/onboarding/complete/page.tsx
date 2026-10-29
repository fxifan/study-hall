import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { localizePath } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireRole } from "@/lib/auth";
import { syncCheckoutSession } from "@/lib/billing";
import { siteOrigin } from "@/lib/site";
import { stripeConfigured } from "@/lib/stripe";

/**
 * Stripe Checkout returns here. Confirms the session with Stripe directly (so it works even when the
 * webhook can't reach this environment), then sends the parent to their page.
 */
export default async function CheckoutCompletePage({ searchParams }: PageProps<"/[lang]/onboarding/complete">) {
  const t = await getDictionary();
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-12">
      <Suspense fallback={<p className="font-mono text-sm text-ink-faint">{t.common.loading}</p>}>
        <Confirm searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Confirm({ searchParams }: Pick<PageProps<"/[lang]/onboarding/complete">, "searchParams">) {
  const [profile, locale, { session_id: sessionId }, t] = await Promise.all([
    requireRole("parent"),
    getLocale(),
    searchParams,
    getDictionary(),
  ]);
  if (typeof sessionId === "string" && stripeConfigured()) {
    const result = await syncCheckoutSession(sessionId, await siteOrigin()).catch((error) => {
      console.error("Confirming checkout failed", error);
      return null;
    });
    if (result?.parentId === profile.id) redirect(localizePath("/parent", locale) + "?welcome=1");
  }
  return (
    <>
      <p role="alert" className="text-ink-soft">
        {t.onboarding.complete.failed}
      </p>
      <Link className="underline underline-offset-4" href={localizePath("/parent", locale)}>
        {t.onboarding.done.link}
      </Link>
    </>
  );
}
