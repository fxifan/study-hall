import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Wordmark } from "@/components/wordmark";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { syncStudentCheckout } from "@/lib/social/billing";
import { PLAN_FEATURES } from "@/lib/social/copy";
import { createAdminClient } from "@/lib/supabase/admin";
import { parentPay } from "./actions";

export const metadata: Metadata = { title: "Edumi for your child", robots: { index: false } };

export default function PayPage({ params, searchParams }: PageProps<"/[lang]/pay/[token]">) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-12" lang="en">
      <Wordmark className="text-base" />
      <Suspense fallback={null}>
        <Pay params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/** Parent view of a student's plan link: name, plan and price only. No chats, scores or groups. */
async function Pay({ params, searchParams }: Pick<PageProps<"/[lang]/pay/[token]">, "params" | "searchParams">) {
  const [{ token }, query, locale] = await Promise.all([params, searchParams, getLocale()]);
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound();
  const admin = createAdminClient();
  const { data: plan } = await admin.from("student_plans").select("profile_id, status").eq("parent_link_token", token).maybeSingle();
  if (!plan) notFound();
  if (typeof query.checkout === "string" && /^cs_[A-Za-z0-9_]+$/.test(query.checkout)) await syncStudentCheckout(query.checkout, plan.profile_id as string).catch(() => false);
  const { data: fresh } = await admin.from("student_plans").select("status").eq("profile_id", plan.profile_id).single();
  const { data: student } = await admin.from("students").select("first_name").eq("profile_id", plan.profile_id).maybeSingle();
  const name = (student?.first_name as string) ?? "Your child";
  const active = fresh?.status === "active";

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-medium tracking-tight">{active ? `${name}'s Edumi plan is active` : `${name} would like Edumi`}</h1>
      {active ? (
        <p className="text-ink-soft">Thank you. Stripe has emailed your receipt. You can cancel any time from the link in that email.</p>
      ) : (
        <>
          <p className="text-ink-soft">
            Edumi helps students study with their friends: they set a shared daily goal, count verified study time, quiz themselves and ask each other for
            help. {name} has been using the free week.
          </p>
          <section className="rounded-lg border border-rule bg-sheet p-4">
            <p className="mb-2">
              <span className="text-2xl font-medium">A$11.99</span> <span className="text-ink-soft">per month, cancel any time</span>
            </p>
            <ul className="list-disc pl-5 text-sm">
              {PLAN_FEATURES.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </section>
          <p className="text-sm text-ink-soft">
            Group chats are members-only, students can report or block anyone, and moderators review reports. This page doesn&apos;t show {name}&apos;s
            messages, scores or groups.
          </p>
          <form action={parentPay.bind(null, token, locale)} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Your email (for the receipt)
              <input name="email" type="email" required autoComplete="email" className="h-10 rounded-md border border-rule bg-paper px-3" />
            </label>
            <label className="flex items-start gap-2 text-sm text-ink-soft">
              <input type="checkbox" name="agree" required className="mt-1" />
              <span>
                I&apos;m {name}&apos;s parent or guardian and I&apos;ve read the <a href={localizePath("/legal/privacy", locale)}>privacy policy</a>.
              </span>
            </label>
            {query.error && <p className="text-sm text-pen">Check your email and tick the box.</p>}
            <button className="inline-flex h-11 items-center justify-center rounded-md bg-ink px-5 font-medium text-paper">Pay A$11.99/month</button>
          </form>
        </>
      )}
    </div>
  );
}
