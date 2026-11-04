import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { paymentReference } from "@/lib/payments";
import { createClient } from "@/lib/supabase/server";
import { effectiveStatus, longDate, type InvoiceStatus } from "@/lib/tutor/invoice-data";
import { formatCents, sessionCharge } from "@/lib/tutor/invoice-math";
import { requireTutor } from "@/lib/tutor/server";
import { Loading, Notice, TutorShell, appHref } from "../_components/shell";
import { STATUS_STYLE } from "../_components/styles";

export const metadata: Metadata = { title: "Invoices" };

export default function InvoicesPage({ searchParams }: PageProps<"/[lang]/app/invoices">) {
  return (
    <Suspense fallback={<Loading />}>
      <Invoices searchParams={searchParams} />
    </Suspense>
  );
}

type Row = {
  id: string;
  number: number;
  due_date: string;
  status: InvoiceStatus;
  total_cents: number;
  gst_registered: boolean;
  tutor_families: { parent_name: string } | null;
};
type Unbilled = { duration_min: number; rate_cents: number; tutor_students: { family_id: string; tutor_families: { parent_name: string } | null } | null };

async function Invoices({ searchParams }: Pick<PageProps<"/[lang]/app/invoices">, "searchParams">) {
  const [me, locale, query] = await Promise.all([requireTutor(), getLocale(), searchParams]);
  const supabase = await createClient();
  const [{ data: invoices }, { data: unbilled }] = await Promise.all([
    supabase
      .from("tutor_invoices")
      .select("id, number, due_date, status, total_cents, gst_registered, tutor_families(parent_name)")
      .order("number", { ascending: false })
      .returns<Row[]>(),
    supabase
      .from("tutor_sessions")
      .select("duration_min, rate_cents, tutor_students(family_id, tutor_families(parent_name))")
      .is("invoice_id", null)
      .returns<Unbilled[]>(),
  ]);
  const byFamily = new Map<string, { name: string; count: number; cents: number }>();
  for (const s of unbilled ?? []) {
    if (!s.tutor_students) continue;
    const f = byFamily.get(s.tutor_students.family_id) ?? { name: s.tutor_students.tutor_families?.parent_name ?? "", count: 0, cents: 0 };
    f.count += 1;
    f.cents += sessionCharge(s.duration_min, s.rate_cents);
    byFamily.set(s.tutor_students.family_id, f);
  }
  const rows = (invoices ?? []).map((i) => ({ ...i, shown: effectiveStatus(i.status, i.due_date) }));
  const outstanding = rows.filter((i) => i.shown === "sent" || i.shown === "overdue").reduce((sum, i) => sum + i.total_cents, 0);

  return (
    <TutorShell tutor={me} title="Invoices" current="invoices">
      {query.saved === "deleted" && <Notice>Draft deleted. Its sessions are unbilled again.</Notice>}
      {query.error && <Notice tone="error">Something went wrong. Try again.</Notice>}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Ready to invoice</h2>
        {byFamily.size ? (
          <ul className="divide-y divide-rule dash-card">
            {[...byFamily].map(([familyId, f]) => (
              <li key={familyId}>
                <Link href={appHref(`/app/families/${familyId}#invoice`, locale)} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span>{f.name}</span>
                  <span className="text-sm text-ink-soft">
                    {f.count} {f.count === 1 ? "session" : "sessions"} · {formatCents(f.cents)} →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-soft">No unbilled sessions.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">All invoices</h2>
        {outstanding > 0 && <p className="text-sm text-ink-soft">Outstanding: {formatCents(outstanding)}</p>}
        {rows.length ? (
          <ul className="divide-y divide-rule dash-card">
            {rows.map((i) => (
              <li key={i.id}>
                <Link href={appHref(`/app/invoices/${i.id}`, locale)} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="flex flex-col">
                    <span>
                      {paymentReference(i.number)} · {i.tutor_families?.parent_name}
                    </span>
                    <span className="text-sm text-ink-soft">
                      {formatCents(i.total_cents)} · due {longDate(i.due_date)}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs capitalize ${STATUS_STYLE[i.shown]}`}>{i.shown}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-soft">No invoices yet.</p>
        )}
      </section>
    </TutorShell>
  );
}
