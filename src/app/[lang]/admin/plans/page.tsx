import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShellFallback } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDictionary } from "@/i18n/server";
import { formatAud } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { addPlan, savePlan } from "../actions";
import { AdminFrame } from "../admin-frame";

export const metadata: Metadata = { title: "Plans" };

export default async function PlansPage() {
  const t = await getDictionary();
  return (
    <Suspense fallback={<AppShellFallback label={t.common.loading} />}>
      <Plans />
    </Suspense>
  );
}

async function Plans() {
  const p = (await getDictionary()).adminPages.plans;
  const supabase = await createClient();
  const { data: plans } = await supabase
    .from("plans")
    .select("id, name, price_cents, days_per_week, active, stripe_price_id, includes_tutoring")
    .order("price_cents");

  return (
    <AdminFrame title={p.title} current="plans">
      <p className="text-sm text-ink-soft">{p.intro}</p>
      {plans?.map((plan) => (
        <form key={plan.id} action={savePlan} className="flex flex-col gap-3 rounded-md border border-hair bg-sheet p-4" aria-label={plan.name}>
          <input type="hidden" name="id" value={plan.id} />
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="text-2xl">
              {formatAud(plan.price_cents)}
              {plan.includes_tutoring && <span className="ml-3 font-mono text-xs text-pen uppercase">{p.tutoringBadge}</span>}
            </span>
            <span className={`font-mono text-xs ${plan.stripe_price_id ? "text-ink-soft" : "text-pen"}`}>
              {plan.stripe_price_id ? p.stripeReady : p.stripeMissing}
            </span>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex flex-col gap-1">
              {p.name}
              <Input name="name" required defaultValue={plan.name} />
            </label>
            <label className="flex flex-col gap-1">
              {p.daysPerWeek}
              <Input name="daysPerWeek" type="number" min={1} max={7} defaultValue={plan.days_per_week ?? ""} className="w-24" />
            </label>
            <label className="flex items-center gap-2 self-end pb-1.5">
              <input type="checkbox" name="active" defaultChecked={plan.active} />
              {p.active}
            </label>
          </div>
          <Button type="submit" variant="outline" className="self-start">
            {p.save}
          </Button>
        </form>
      ))}
      <form action={addPlan} className="flex flex-wrap items-end gap-3 rounded-md border border-dashed border-rule p-4 text-sm" aria-label={p.add}>
        <label className="flex flex-col gap-1">
          {p.name}
          <Input name="name" required />
        </label>
        <label className="flex flex-col gap-1">
          {p.price}
          <Input name="priceCents" type="number" min={0} required className="w-32" />
        </label>
        <label className="flex flex-col gap-1">
          {p.daysPerWeek}
          <Input name="daysPerWeek" type="number" min={1} max={7} className="w-24" />
        </label>
        <label className="flex items-center gap-2 pb-1.5">
          <input type="checkbox" name="includesTutoring" />
          {p.includesTutoring}
        </label>
        <Button type="submit">{p.add}</Button>
      </form>
    </AdminFrame>
  );
}
