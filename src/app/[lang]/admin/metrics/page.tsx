import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShellFallback } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDictionary } from "@/i18n/server";
import { isReservedTestEmail } from "@/lib/email";
import { computeMetrics } from "@/lib/metrics";
import { formatAud } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { addDaysToDateKey, dateKeyOf } from "@/lib/time";
import { AdminFrame } from "../admin-frame";

export const metadata: Metadata = { title: "Metrics" };

export default async function MetricsPage({ searchParams }: PageProps<"/[lang]/admin/metrics">) {
  const t = await getDictionary();
  return (
    <Suspense fallback={<AppShellFallback label={t.common.loading} />}>
      <Metrics searchParams={searchParams} />
    </Suspense>
  );
}

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const percent = (v: number | null, none: string) => (v === null ? none : `${Math.round(v * 100)}%`);

type Subscription = {
  parent_id: string;
  status: string;
  created_at: string;
  canceled_at: string | null;
  cancel_reason: string | null;
  quantity: number;
  stripe_subscription_id: string | null;
  plans: { price_cents: number } | null;
};
type Enrolment = { student_id: string; session_id: string; sessions: { starts_at: string; ends_at: string; status: string } | null };

async function Metrics({ searchParams }: Pick<PageProps<"/[lang]/admin/metrics">, "searchParams">) {
  const [t, query] = await Promise.all([getDictionary(), searchParams]);
  const m = t.adminPages.metrics;
  const to = isDay(query.to) ? query.to : dateKeyOf();
  const from = isDay(query.from) ? query.from : addDaysToDateKey(to, -27);
  const supabase = await createClient();
  const [{ data: parents }, { data: links }, { data: consents }, { data: subs }, { data: enrolments }, { data: attendance }, { data: goals }, { data: reports }] =
    await Promise.all([
      supabase.from("profiles").select("id, email, created_at").eq("role", "parent"),
      supabase.from("parent_students").select("parent_id, student_id"),
      supabase.from("consents").select("parent_id"),
      supabase
        .from("subscriptions")
        .select("parent_id, status, created_at, canceled_at, cancel_reason, quantity, stripe_subscription_id, plans(price_cents)")
        .returns<Subscription[]>(),
      supabase.from("enrolments").select("student_id, session_id, sessions!inner(starts_at, ends_at, status)").returns<Enrolment[]>(),
      supabase.from("attendance").select("session_id, student_id, status, check_in_at"),
      supabase.from("goals").select("session_id, student_id, outcome, sessions(starts_at)").returns<{ student_id: string; outcome: string | null; sessions: { starts_at: string } | null }[]>(),
      supabase.from("reports").select("student_id, status, created_at"),
    ]);

  // Real families only: test accounts and seeded subscriptions would swamp the numbers.
  const realParents = (parents ?? []).filter((p) => !isReservedTestEmail(p.email));
  const parentIds = new Set(realParents.map((p) => p.id));
  const studentIds = new Set((links ?? []).filter((l) => parentIds.has(l.parent_id)).map((l) => l.student_id));
  const attendanceOf = new Map((attendance ?? []).map((a) => [`${a.session_id}:${a.student_id}`, a]));
  const now = new Date().toISOString();

  const data = computeMetrics(
    {
      parents: realParents,
      consentParents: (consents ?? []).map((c) => c.parent_id),
      subscriptions: (subs ?? [])
        .filter((s) => parentIds.has(s.parent_id) && !s.stripe_subscription_id?.startsWith("seed-"))
        .map((s) => ({ ...s, price_cents: s.plans?.price_cents ?? 0 })),
      enrolments: (enrolments ?? []).flatMap((e) => {
        if (!e.sessions || !studentIds.has(e.student_id) || e.sessions.status === "cancelled" || e.sessions.ends_at > now) return [];
        const a = attendanceOf.get(`${e.session_id}:${e.student_id}`);
        return [
          {
            student_id: e.student_id,
            starts_at: e.sessions.starts_at,
            attended: Boolean(a?.check_in_at) && a?.status !== "absent",
            present: a?.status === "present" || a?.status === "late",
          },
        ];
      }),
      goals: (goals ?? []).flatMap((g) => (g.sessions && studentIds.has(g.student_id) ? [{ outcome: g.outcome, starts_at: g.sessions.starts_at }] : [])),
      reports: (reports ?? []).filter((r) => studentIds.has(r.student_id)),
    },
    from,
    to,
  );

  const stats: [string, string][] = [
    [m.paying, String(data.paying)],
    [m.revenue, formatAud(data.revenueCents)],
    [m.attendance, percent(data.attendance, m.none)],
    [m.goals, percent(data.goalCompletion, m.none)],
  ];

  return (
    <AdminFrame title={m.title} current="metrics">
      <p className="text-sm text-ink-soft">{m.intro}</p>
      <form className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1">
          {m.from}
          <Input type="date" name="from" defaultValue={from} />
        </label>
        <label className="flex flex-col gap-1">
          {m.to}
          <Input type="date" name="to" defaultValue={to} />
        </label>
        <Button type="submit" variant="outline">
          {m.apply}
        </Button>
      </form>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="metric-stats">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-md border border-hair bg-sheet px-4 py-3">
            <dt className="text-sm text-ink-soft">{label}</dt>
            <dd className="text-2xl">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-md border border-hair bg-sheet px-4 py-3 text-sm" data-testid="metric-funnel">
          <h2 className="mb-1 font-mono text-xs tracking-widest text-ink-soft uppercase">{m.funnel}</h2>
          {m.started}: {data.funnel.started} → {m.consented}: {data.funnel.consented} → {m.paid}: {data.funnel.paid}
        </section>
        <section className="rounded-md border border-hair bg-sheet px-4 py-3 text-sm">
          <h2 className="mb-1 font-mono text-xs tracking-widest text-ink-soft uppercase">{m.reports}</h2>
          {m.sent}: {data.reports.sent} · {m.failed}: {data.reports.failed} · {m.awaiting}: {data.reports.awaiting}
        </section>
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-medium">{m.weeks}</h2>
        <div className="overflow-x-auto rounded-md border border-hair bg-sheet">
          <table className="w-full text-sm" data-testid="metric-weeks">
            <thead>
              <tr className="border-b border-rule text-left text-ink-soft">
                {[m.week, m.paying, m.newFamilies, m.cancelled, m.revenue, m.attendance, m.days].map((h) => (
                  <th key={h} className="px-3 py-2 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-rule font-mono text-xs">
              {data.weeks.map((w) => (
                <tr key={w.week}>
                  <td className="px-3 py-2">{w.week}</td>
                  <td className="px-3 py-2">{w.paying}</td>
                  <td className="px-3 py-2">{w.added}</td>
                  <td className="px-3 py-2">{w.cancelled}</td>
                  <td className="px-3 py-2">{formatAud(w.revenueCents)}</td>
                  <td className="px-3 py-2">{percent(w.attendance, m.none)}</td>
                  <td className="px-3 py-2">{w.days?.toFixed(1) ?? m.none}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="text-sm">
        <h2 className="mb-1 font-mono text-xs tracking-widest text-ink-soft uppercase">{m.churn}</h2>
        {data.reasons.length ? data.reasons.map(([reason, n]) => `${reason.replaceAll("_", " ")}: ${n}`).join(" · ") : m.noReasons}
      </section>
    </AdminFrame>
  );
}
