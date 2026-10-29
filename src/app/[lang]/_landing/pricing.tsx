import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";
import type { LandingCopy } from "@/i18n/dictionaries/landing.en";
import { fill } from "@/i18n/fill";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";

type PublicPlan = {
  id: string;
  name: string;
  price_cents: number;
  currency: string;
  interval: string;
  days_per_week: number | null;
};

/**
 * Active plans, read as a signed-out visitor (migration public_plan_prices exposes only these
 * columns). Prices therefore live in one place: the plans table, managed by admins.
 * Cached for an hour; Phase 1B's plan editor should call revalidateTag("plans").
 */
async function getPublicPlans(): Promise<PublicPlan[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("plans");

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("plans")
    .select("id, name, price_cents, currency, interval, days_per_week")
    .eq("active", true)
    .order("price_cents");
  if (error) throw new Error(`Loading plans for the landing page: ${error.message}`);
  return data;
}

function formatPrice(cents: number) {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export async function PlanCards({ copy, signUpHref }: { copy: LandingCopy["pricing"]; signUpHref: string }) {
  const plans = await getPublicPlans();
  if (!plans.length) return <p className="intro">{copy.empty}</p>;

  return (
    <div className="plans">
      {plans.map((plan) => (
        <div key={plan.id} className="label" data-testid="plan-card">
          <p className="label-k">{copy.cardKicker}</p>
          <p className="label-name">{plan.name}</p>
          <p className="price">
            <span className="cur">{plan.currency === "AUD" ? "A$" : plan.currency}</span>
            <span className="amt">{formatPrice(plan.price_cents)}</span>
            <span className="per">{copy.per}</span>
          </p>
          <ul className="rows">
            <Row label={copy.rows.sessions}>
              {plan.days_per_week ? fill(copy.rows.sessionsLimited, { n: plan.days_per_week }) : copy.rows.sessionsUnlimited}
            </Row>
            <Row label={copy.rows.hours}>{copy.rows.hoursValue}</Row>
            <Row label={copy.rows.supervised}>{copy.rows.supervisedValue}</Row>
            <Row label={copy.rows.report}>{copy.rows.reportValue}</Row>
            <Row label={copy.rows.for}>{copy.rows.forValue}</Row>
          </ul>
          <Link className="btn btn-primary" href={signUpHref}>
            {copy.cta} <span className="arr" aria-hidden="true">→</span>
          </Link>
          <p className="label-note">{copy.ctaNote}</p>
        </div>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li>
      <span className="lbl">{label}</span>
      <span className="dots" aria-hidden="true" />
      <span className="val">{children}</span>
    </li>
  );
}
