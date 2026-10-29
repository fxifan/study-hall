import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell, AppShellFallback, ComingInPhase } from "@/components/app-shell";
import { getDictionary } from "@/i18n/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).roles.admin };
}

export default async function AdminPage() {
  const t = await getDictionary();
  return (
    <Suspense fallback={<AppShellFallback label={t.common.loading} />}>
      <AdminHome />
    </Suspense>
  );
}

async function AdminHome() {
  const [profile, t] = await Promise.all([requireRole("admin"), getDictionary()]);
  const supabase = await createClient();
  const count = (table: string) => supabase.from(table).select("*", { count: "exact", head: true });
  const [students, rooms, plans] = await Promise.all([
    count("students"),
    count("rooms"),
    supabase.from("plans").select("id, name, price_cents, currency, interval, active").order("price_cents"),
  ]);

  return (
    <AppShell profile={profile} title={t.admin.heading}>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t.admin.students} value={students.count ?? 0} />
        <Stat label={t.admin.rooms} value={rooms.count ?? 0} />
      </dl>
      <section className="flex flex-col gap-2">
        <h2 className="font-mono text-xs tracking-widest text-ink-soft uppercase">{t.admin.plans}</h2>
        <ul className="divide-y divide-rule rounded-md border border-hair bg-sheet">
          {plans.data?.map((p) => (
            <li key={p.id} className="flex justify-between gap-4 px-4 py-3">
              <span>{p.name}</span>
              <span className="font-mono text-sm">
                {p.currency === "AUD" ? "A$" : `${p.currency} `}
                {(p.price_cents / 100).toFixed(0)}/
                {t.admin.perInterval[p.interval as keyof typeof t.admin.perInterval] ?? p.interval}
                {p.active ? "" : ` · ${t.admin.inactive}`}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <ComingInPhase phase={1}>{t.admin.manageSoon}</ComingInPhase>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-hair bg-sheet px-4 py-3">
      <dt className="font-mono text-xs text-ink-soft uppercase">{label}</dt>
      <dd className="text-3xl">{value}</dd>
    </div>
  );
}
