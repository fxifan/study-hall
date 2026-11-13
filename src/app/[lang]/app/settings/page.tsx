import type { Metadata } from "next";
import { Suspense } from "react";
import { FREE_DRAFT_CAP, FREE_STUDENT_LIMIT, MONTHLY_DRAFT_CAP, PLANS, REFERRAL_CREDIT_CENTS, REFERRAL_FREE_DAYS, SUPPORT_EMAIL } from "@/lib/tutor/config";
import { maskTail, tryDecrypt } from "@/lib/tutor/crypto";
import { formatCents } from "@/lib/tutor/invoice-math";
import { accessFor, draftsThisMonth, needsTrialStart, requireTutor } from "@/lib/tutor/server";
import { formatInZone } from "@/lib/time";
import { tutorEmailMode } from "@/lib/email/send";
import { siteOrigin } from "@/lib/site";
import { referralCodeFor, referralStats } from "@/lib/tutor/referrals";
import { CopyButton } from "../../student/_social/copy-button";
import { saveSettings } from "../actions";
import { openTutorPortal, startSoloCheckout } from "../billing-actions";
import { stripeConfigured } from "@/lib/stripe";
import { syncTutorCheckout } from "@/lib/tutor/billing";
import { refreshTutorAfterCheckout } from "@/lib/tutor/server";
import { Loading, Notice, TutorShell, field, labelClass, primaryButton } from "../_components/shell";
import { PlanBanner } from "../_components/plan-banner";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage({ searchParams }: PageProps<"/[lang]/app/settings">) {
  return (
    <Suspense fallback={<Loading />}>
      <Settings searchParams={searchParams} />
    </Suspense>
  );
}

const ERRORS: Record<string, string> = {
  settings: "Check the highlighted details: ABN is 11 digits, BSB is 6 digits, rate is in dollars.",
  abn: "GST-registered businesses need an ABN on their tax invoices. Add your ABN or untick GST.",
};

async function Settings({ searchParams }: Pick<PageProps<"/[lang]/app/settings">, "searchParams">) {
  const [first, query] = await Promise.all([requireTutor(), searchParams]);
  // Back from Stripe Checkout: record the payment now, even if the webhook hasn't arrived.
  const paid = typeof query.checkout === "string" && stripeConfigured() && (await syncTutorCheckout(query.checkout, first.tutor.id));
  const me = paid ? await refreshTutorAfterCheckout() : first;
  const t = me.tutor;
  const [access, used, code, refs, origin] = await Promise.all([accessFor(t), draftsThisMonth(t.id), referralCodeFor(t.id), referralStats(t.id), siteOrigin()]);
  const referralLink = `${origin}/tutors?ref=${code}#signup`;
  const bsb = maskTail(tryDecrypt(t.bank_bsb_enc), 3);
  const acct = maskTail(tryDecrypt(t.bank_acct_enc), 3);
  const error = typeof query.error === "string" ? ERRORS[query.error] : null;

  return (
    <TutorShell tutor={me} title="Settings" current="settings">
      {query.saved === "1" && <Notice>Saved.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      <form action={saveSettings} className="flex flex-col gap-6">
        <section className="flex flex-col gap-3 dash-card p-4">
          <h2 className="font-medium">You</h2>
          <label className={labelClass}>
            Your name (shown to parents)
            <input name="displayName" className={field} defaultValue={t.display_name} required maxLength={80} />
          </label>
          <label className={labelClass}>
            Business name (optional, on invoices and emails)
            <input name="businessName" className={field} defaultValue={t.business_name ?? ""} maxLength={120} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={labelClass}>
              Default hourly rate (A$)
              <input
                name="rate"
                className={field}
                inputMode="decimal"
                required
                defaultValue={(t.default_rate_cents / 100).toFixed(2).replace(/\.00$/, "")}
                pattern="\d{1,4}(\.\d{1,2})?"
              />
            </label>
            <label className={labelClass}>
              Invoices due after (days)
              <input name="dueDays" type="number" min={0} max={90} className={field} defaultValue={t.invoice_due_days} />
            </label>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Default report language(s) for new families</legend>
            {(["en", "zh-CN"] as const).map((l) => (
              <label key={l} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="langs" value={l} defaultChecked={t.report_langs.includes(l)} className="size-5" />
                {l === "en" ? "English" : "简体中文 (Simplified Chinese)"}
              </label>
            ))}
          </fieldset>
        </section>

        <section className="flex flex-col gap-3 dash-card p-4">
          <h2 className="font-medium">ABN and GST</h2>
          <label className={labelClass}>
            ABN (optional unless you&apos;re registered for GST)
            <input name="abn" className={field} defaultValue={t.abn ?? ""} inputMode="numeric" placeholder="11 digits" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="gstRegistered" value="on" defaultChecked={t.gst_registered} className="size-5" />
            I&apos;m registered for GST
          </label>
          <p className="text-xs text-ink-soft">
            Registered: invoices are titled &quot;Tax invoice&quot;, show your ABN, and show the GST included in your rate (1/11 of the total).
            Not registered: a plain &quot;Invoice&quot; with no GST. We don&apos;t give tax advice: check the{" "}
            <a className="underline" href="https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst" target="_blank" rel="noreferrer">
              ATO&apos;s GST guidance
            </a>{" "}
            (tax invoices and whether you need to register) or ask your accountant.
          </p>
        </section>

        <section className="flex flex-col gap-3 dash-card p-4">
          <h2 className="font-medium">Bank details for invoices</h2>
          <p className="text-xs text-ink-soft">
            Printed on your invoices so families can pay by bank transfer. Encrypted before they&apos;re saved. Leave the number fields blank to keep
            what&apos;s saved.
          </p>
          <label className={labelClass}>
            Account name
            <input name="bankAccountName" className={field} defaultValue={t.bank_account_name ?? ""} maxLength={120} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={labelClass}>
              BSB {bsb && <span className="font-normal text-ink-soft">(saved: {bsb})</span>}
              <input name="bsb" className={field} inputMode="numeric" autoComplete="off" placeholder="000-000" />
            </label>
            <label className={labelClass}>
              Account number {acct && <span className="font-normal text-ink-soft">(saved: {acct})</span>}
              <input name="accountNumber" className={field} inputMode="numeric" autoComplete="off" />
            </label>
          </div>
          {(bsb || acct) && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="clearBank" value="on" className="size-5" /> Remove saved bank details
            </label>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="reminders" value="on" defaultChecked={t.overdue_reminders} className="size-5" />
            Email one reminder to the family 7 days after an invoice is overdue
          </label>
          {tutorEmailMode() === "own" && (
            <p className="text-xs text-ink-soft">
              Automatic reminders start once Edumi sends email for you. For now, overdue invoices have a &quot;Send a reminder&quot; button
              that opens your own email.
            </p>
          )}
        </section>

        <button type="submit" className={primaryButton}>
          Save settings
        </button>
      </form>

      <section className="flex flex-col gap-2 dash-card p-4 text-sm">
        <h2 className="font-medium">Plan</h2>
        <PlanBanner access={access} />
        <p>
          {t.plan === "solo"
            ? `Solo plan, ${formatCents(PLANS.solo.priceCentsPerMonth)}/month.`
            : access.ok && access.tier === "trial"
              ? `Free trial until ${formatInZone(t.trial_ends_at, "d MMMM yyyy")}. After that you keep the free plan for up to ${FREE_STUDENT_LIMIT} students, or Solo is ${formatCents(PLANS.solo.priceCentsPerMonth)}/month.`
              : `Free plan: up to ${FREE_STUDENT_LIMIT} students, ${FREE_DRAFT_CAP} AI drafts a month, free for as long as you like. Solo adds unlimited students and up to ${MONTHLY_DRAFT_CAP} drafts a month for ${formatCents(PLANS.solo.priceCentsPerMonth)}/month${needsTrialStart(t) ? ", with the first 14 days free" : ""}.`}
        </p>
        <p className="text-ink-soft">
          AI drafts this month: {used} of {access.ok && access.tier === "free" ? FREE_DRAFT_CAP : MONTHLY_DRAFT_CAP}
          {access.ok && access.tier === "free" ? "" : " (fair use)"}.
        </p>
        {paid && <p role="status">Thanks: you&apos;re on Solo.</p>}
        {!stripeConfigured() ? (
          t.plan !== "solo" && <p>To upgrade, email {SUPPORT_EMAIL}.</p>
        ) : t.plan === "solo" && t.stripe_customer_id ? (
          <form action={openTutorPortal}>
            <button type="submit" className="underline underline-offset-4">
              Manage billing (card, receipts, cancel)
            </button>
          </form>
        ) : t.plan !== "solo" ? (
          <form action={startSoloCheckout}>
            <button type="submit" className={primaryButton}>
              {needsTrialStart(t) ? "Try Solo free for 14 days" : `Upgrade to Solo, ${formatCents(PLANS.solo.priceCentsPerMonth)}/month`}
            </button>
          </form>
        ) : null}
      </section>

      <section className="flex flex-col gap-2 dash-card p-4 text-sm" data-testid="referral">
        <h2 className="font-medium">Refer a tutor, get a month free</h2>
        <p className="text-ink-soft">
          Share your link with another tutor. When they upgrade to Solo and their first month is paid, you both get a month free (
          {formatCents(REFERRAL_CREDIT_CENTS)} off, or {REFERRAL_FREE_DAYS} days of Solo if you&apos;re on the free plan).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 truncate rounded-md border border-rule bg-paper px-2.5 py-1.5 font-mono text-xs">{referralLink}</span>
          <CopyButton text={referralLink} label="Copy link" />
        </div>
        <p className="text-ink-soft">
          {refs.signedUp === 0
            ? "No one has signed up with your link yet."
            : `${refs.signedUp} ${refs.signedUp === 1 ? "tutor has" : "tutors have"} signed up with your link; ${refs.rewarded} free ${refs.rewarded === 1 ? "month" : "months"} earned.`}
        </p>
      </section>
    </TutorShell>
  );
}
