-- The landing page shows prices from public.plans, so signed-out visitors may read the public
-- columns of active plans. stripe_price_id and org-internal columns stay hidden (column-level grant).

grant select (id, name, price_cents, currency, "interval", days_per_week, active) on public.plans to anon;

create policy "anyone reads active plans" on public.plans
  for select to anon using (active);
