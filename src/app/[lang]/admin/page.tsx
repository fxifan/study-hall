import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShellFallback } from "@/components/app-shell";
import { getDictionary } from "@/i18n/server";
import { formatAud } from "@/lib/money";
import { SESSION_HORIZON_DAYS } from "@/lib/sessions";
import { createClient } from "@/lib/supabase/server";
import { addDaysToDateKey, dateKeyOf } from "@/lib/time";
import { AdminFrame } from "./admin-frame";

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
  const t = await getDictionary();
  const supabase = await createClient();
  const count = (table: string) => supabase.from(table).select("*", { count: "exact", head: true });
  const now = new Date();
  const soon = addDaysToDateKey(dateKeyOf(now), 30);
  const [students, rooms, plans, checks, unassigned] = await Promise.all([
    count("students"),
    count("rooms"),
    supabase.from("plans").select("id, name, price_cents, interval, active").order("price_cents"),
    supabase.from("proctor_checks").select("id").or(`verified_at.is.null,wwcc_expiry.lte.${soon}`),
    supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .is("proctor_id", null)
      .neq("status", "cancelled")
      .gt("starts_at", now.toISOString())
      .lt("starts_at", new Date(now.getTime() + SESSION_HORIZON_DAYS * 86_400_000).toISOString()),
  ]);

  return (
    <AdminFrame title={t.admin.heading} current="overview">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t.admin.students} value={students.count ?? 0} />
        <Stat label={t.admin.rooms} value={rooms.count ?? 0} />
        <Stat label="WWCC to check" value={checks.data?.length ?? 0} warn={(checks.data?.length ?? 0) > 0} />
        <Stat label="Sessions without supervisor" value={unassigned.count ?? 0} warn={(unassigned.count ?? 0) > 0} />
      </dl>
      <section className="flex flex-col gap-2">
        <h2 className="font-mono text-xs tracking-widest text-ink-soft uppercase">{t.admin.plans}</h2>
        <ul className="divide-y divide-rule rounded-md border border-hair bg-sheet">
          {plans.data?.map((p) => (
            <li key={p.id} className="flex justify-between gap-4 px-4 py-3">
              <span>{p.name}</span>
              <span className="font-mono text-sm">
                {formatAud(p.price_cents)}/{t.admin.perInterval[p.interval as keyof typeof t.admin.perInterval] ?? p.interval}
                {p.active ? "" : ` · ${t.admin.inactive}`}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </AdminFrame>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-md border border-hair bg-sheet px-4 py-3">
      <dt className="font-mono text-xs text-ink-soft uppercase">{label}</dt>
      <dd className={`text-3xl ${warn ? "text-pen" : ""}`}>{value}</dd>
    </div>
  );
}
