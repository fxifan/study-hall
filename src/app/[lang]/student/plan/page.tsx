import type { Metadata } from "next";
import { Suspense } from "react";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { siteOrigin } from "@/lib/site";
import { syncStudentCheckout } from "@/lib/social/billing";
import { PLAN_FEATURES } from "@/lib/social/copy";
import { requireSocialStudent } from "@/lib/social/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatInZone } from "@/lib/time";
import { createParentLink, openStudentPortal, startStudentCheckout } from "../_social/actions";
import { CopyButton } from "../_social/copy-button";
import { Loading, Notice, StudentShell, card, primaryBtn, secondaryBtn } from "../_social/shell";

export const metadata: Metadata = { title: "Your plan" };


export default function PlanPage({ searchParams }: PageProps<"/[lang]/student/plan">) {
  return (
    <Suspense fallback={<Loading />}>
      <Plan searchParams={searchParams} />
    </Suspense>
  );
}

async function Plan({ searchParams }: Pick<PageProps<"/[lang]/student/plan">, "searchParams">) {
  const [first, locale, query] = await Promise.all([requireSocialStudent({ paid: false }), getLocale(), searchParams]);
  let me = first;
  let justPaid = false;
  if (typeof query.checkout === "string" && /^cs_[A-Za-z0-9_]+$/.test(query.checkout)) {
    justPaid = await syncStudentCheckout(query.checkout, me.profile.id).catch(() => false);
    if (justPaid) me = await requireSocialStudent({ paid: false });
  }
  const { data: plan } = await createAdminClient().from("student_plans").select("payer, stripe_customer_id, parent_link_token, current_period_end").eq("profile_id", me.profile.id).maybeSingle();
  const parentUrl = plan?.parent_link_token ? `${await siteOrigin()}${localizePath(`/pay/${plan.parent_link_token}`, locale)}` : null;
  const a = me.access;

  return (
    <StudentShell me={me} title="Your Edumi plan" current="me">
      {justPaid && <Notice tone="ok">You&apos;re subscribed. Thanks!</Notice>}
      {a.kind === "disabled" && <Notice>A parent set up your account. Ask them to switch on Edumi groups from their parent page.</Notice>}
      {a.kind === "expired" && <Notice tone="error">Your free week has ended. Subscribe, or ask a parent to, to keep your groups, timer and practice.</Notice>}

      <section className={`${card} flex flex-col gap-3`}>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-medium">Edumi Student</h2>
          <p>
            <span className="text-2xl font-medium">A$11.99</span>
            <span className="text-sm text-ink-soft">/month</span>
          </p>
        </div>
        <ul className="list-disc pl-5 text-sm">
          {PLAN_FEATURES.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <p className="text-sm text-ink-soft">
          {a.kind === "trial" && `Free trial until ${formatInZone(a.trialEndsAt, "EEE d MMM")}. No card needed until then.`}
          {a.kind === "paid" && `Active${plan?.payer === "parent" ? ", paid by a parent" : ""}${a.periodEnd ? `. Renews ${formatInZone(a.periodEnd, "d MMM")}` : ""}.`}
          {a.kind === "studyhall" && "Included with your family's Study Hall plan."}
        </p>
        {(a.kind === "trial" || a.kind === "expired") && (
          <div className="flex flex-wrap gap-3">
            <form action={startStudentCheckout}>
              <button className={primaryBtn}>Subscribe myself</button>
            </form>
            {!parentUrl && (
              <form action={createParentLink}>
                <button className={secondaryBtn}>Ask a parent to pay</button>
              </form>
            )}
          </div>
        )}
        {parentUrl && (a.kind === "trial" || a.kind === "expired") && (
          <div className="flex flex-col gap-2 rounded-md border border-rule p-3 text-sm">
            <p>Send this link to a parent. It shows the plan and price, and nothing from your chats or scores.</p>
            <div className="flex items-center gap-2">
              <span className="truncate font-mono text-xs">{parentUrl}</span>
              <CopyButton text={parentUrl} />
            </div>
          </div>
        )}
        {a.kind === "paid" && plan?.payer === "student" && plan.stripe_customer_id && (
          <form action={openStudentPortal}>
            <button className={secondaryBtn}>Manage billing</button>
          </form>
        )}
      </section>
    </StudentShell>
  );
}
