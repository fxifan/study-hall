import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell, AppShellFallback, ComingInPhase } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin" };

export default function AdminPage() {
  return (
    <Suspense fallback={<AppShellFallback />}>
      <AdminHome />
    </Suspense>
  );
}

async function AdminHome() {
  const profile = await requireRole("admin");
  const supabase = await createClient();
  const count = (table: string) => supabase.from(table).select("*", { count: "exact", head: true });
  const [students, rooms, plans] = await Promise.all([
    count("students"),
    count("rooms"),
    supabase.from("plans").select("id, name, price_cents, currency, interval, active").order("price_cents"),
  ]);

  return (
    <AppShell profile={profile} title="Overview">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Students" value={students.count ?? 0} />
        <Stat label="Rooms" value={rooms.count ?? 0} />
      </dl>
      <section className="flex flex-col gap-2">
        <h2 className="font-mono text-xs tracking-widest text-ink-soft uppercase">Plans</h2>
        <ul className="divide-y divide-rule rounded-md border border-hair bg-sheet">
          {plans.data?.map((p) => (
            <li key={p.id} className="flex justify-between gap-4 px-4 py-3">
              <span>{p.name}</span>
              <span className="font-mono text-sm">
                {p.currency === "AUD" ? "A$" : `${p.currency} `}
                {(p.price_cents / 100).toFixed(0)}/{p.interval}
                {p.active ? "" : " · inactive"}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <ComingInPhase phase={1}>Rooms, schedule, plans and proctor (WWCC) management.</ComingInPhase>
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
