import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { paymentReference } from "@/lib/payments";
import { createClient } from "@/lib/supabase/server";
import { shortWhen, studentName } from "@/lib/tutor/format";
import { effectiveStatus, type InvoiceStatus } from "@/lib/tutor/invoice-data";
import { formatCents, sessionCharge } from "@/lib/tutor/invoice-math";
import { requireTutor } from "@/lib/tutor/server";
import { addDaysToDateKey, dateKeyOf } from "@/lib/time";
import { deleteFamily, deleteSession, updateFamily } from "../../actions";
import { createInvoice } from "../../invoices/actions";
import { LANG_LABELS, Loading, Notice, TutorShell, appHref, field, labelClass, primaryButton, secondaryButton, yearLabel } from "../../_components/shell";
import { STATUS_STYLE } from "../../_components/styles";

export const metadata: Metadata = { title: "Family" };

export default function FamilyPage({ params, searchParams }: PageProps<"/[lang]/app/families/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Family params={params} searchParams={searchParams} />
    </Suspense>
  );
}

type FamilyRow = {
  id: string;
  parent_name: string;
  parent_email: string;
  report_lang: keyof typeof LANG_LABELS;
  rate_cents_override: number | null;
  tutor_students: { id: string; first_name: string; last_initial: string; year_level: number; subjects: string[] }[];
  tutor_invoices: { id: string; number: number; due_date: string; status: InvoiceStatus; total_cents: number }[];
};
type Session = { id: string; starts_at: string; duration_min: number; rate_cents: number; subjects: string[]; tutor_students: { first_name: string; last_initial: string } };

const ERRORS: Record<string, string> = {
  family: "Check the parent's name and email.",
  none: "No unbilled sessions in those dates.",
  invoice: "Couldn't create the invoice. Try again.",
  blocked: "Your free trial has ended. Upgrade to Solo to create invoices.",
  delete: "A family with sessions or invoices can't be deleted.",
};

async function Family({ params, searchParams }: Pick<PageProps<"/[lang]/app/families/[id]">, "params" | "searchParams">) {
  const [me, locale, { id }, query] = await Promise.all([requireTutor(), getLocale(), params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: f }, { data: unbilled }] = await Promise.all([
    supabase
      .from("tutor_families")
      .select(
        "id, parent_name, parent_email, report_lang, rate_cents_override, tutor_students(id, first_name, last_initial, year_level, subjects), tutor_invoices(id, number, due_date, status, total_cents)",
      )
      .eq("id", id)
      .maybeSingle<FamilyRow>(),
    supabase
      .from("tutor_sessions")
      .select("id, starts_at, duration_min, rate_cents, subjects, tutor_students!inner(first_name, last_initial, family_id)")
      .eq("tutor_students.family_id", id)
      .is("invoice_id", null)
      .order("starts_at")
      .returns<Session[]>(),
  ]);
  if (!f) notFound();
  const today = dateKeyOf();
  const first = unbilled?.length ? dateKeyOf(unbilled[0].starts_at) : addDaysToDateKey(today, -30);
  const total = (unbilled ?? []).reduce((sum, s) => sum + sessionCharge(s.duration_min, s.rate_cents), 0);
  const error = typeof query.error === "string" ? ERRORS[query.error] : null;

  return (
    <TutorShell tutor={me} title={f.parent_name} current="students" back={{ href: "/app/students", label: "Students" }}>
      {query.saved === "family" && <Notice>Saved.</Notice>}
      {query.saved === "session-deleted" && <Notice>Session deleted.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      <ul className="flex flex-wrap gap-2">
        {f.tutor_students.map((s) => (
          <li key={s.id}>
            <Link className="inline-flex rounded-full border border-hair bg-sheet px-3 py-1.5 text-sm" href={appHref(`/app/students/${s.id}`, locale)}>
              {studentName(s)} · {yearLabel(s.year_level)}
            </Link>
          </li>
        ))}
      </ul>

      <section id="invoice" className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Unbilled sessions</h2>
        {unbilled?.length ? (
          <>
            <ul className="divide-y divide-rule dash-card text-sm">
              {unbilled.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span>
                    {studentName(s.tutor_students)} · {shortWhen(s.starts_at)} · {s.duration_min} min
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-mono tabular-nums">{formatCents(sessionCharge(s.duration_min, s.rate_cents))}</span>
                    <form action={deleteSession}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="returnTo" value={`/app/families/${f.id}`} />
                      <button type="submit" className="text-xs text-ink-faint hover:text-pen" aria-label="Delete session">
                        ✕
                      </button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-ink-soft">
              {unbilled.length} {unbilled.length === 1 ? "session" : "sessions"}, {formatCents(total)}
            </p>
            <form action={createInvoice} className="flex flex-col gap-3 dash-card p-4">
              <input type="hidden" name="familyId" value={f.id} />
              <div className="grid grid-cols-2 gap-2">
                <label className={labelClass}>
                  Sessions from
                  <input type="date" name="from" className={field} defaultValue={first} required />
                </label>
                <label className={labelClass}>
                  to
                  <input type="date" name="to" className={field} defaultValue={today} required />
                </label>
              </div>
              <button type="submit" className={primaryButton}>
                Create invoice
              </button>
              <p className="text-xs text-ink-soft">You&apos;ll see a draft to check and edit before anything is sent.</p>
            </form>
          </>
        ) : (
          <p className="text-sm text-ink-soft">Nothing to invoice. Logged sessions appear here until they&apos;re on an invoice.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Invoices</h2>
        {f.tutor_invoices.length ? (
          <ul className="divide-y divide-rule dash-card">
            {f.tutor_invoices
              .toSorted((a, b) => b.number - a.number)
              .map((i) => {
                const shown = effectiveStatus(i.status, i.due_date);
                return (
                  <li key={i.id}>
                    <Link href={appHref(`/app/invoices/${i.id}`, locale)} className="flex items-center justify-between gap-3 px-4 py-3">
                      <span>
                        {paymentReference(i.number)} · {formatCents(i.total_cents)}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-xs capitalize ${STATUS_STYLE[shown]}`}>{shown}</span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        ) : (
          <p className="text-sm text-ink-soft">No invoices yet.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Family details</h2>
        <form action={updateFamily} className="flex flex-col gap-3 dash-card p-4">
          <input type="hidden" name="id" value={f.id} />
          <label className={labelClass}>
            Parent&apos;s name
            <input name="parentName" className={field} defaultValue={f.parent_name} required maxLength={100} />
          </label>
          <label className={labelClass}>
            Parent&apos;s email
            <input name="parentEmail" type="email" className={field} defaultValue={f.parent_email} required />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={labelClass}>
              Report language
              <select name="reportLang" className={field} defaultValue={f.report_lang}>
                {Object.entries(LANG_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Hourly rate (A$)
              <input
                name="rate"
                className={field}
                inputMode="decimal"
                defaultValue={f.rate_cents_override === null ? "" : (f.rate_cents_override / 100).toFixed(2)}
                placeholder={`Default ${formatCents(me.tutor.default_rate_cents)}`}
              />
            </label>
          </div>
          <button type="submit" className={primaryButton}>
            Save
          </button>
          <p className="text-xs text-ink-soft">A new rate applies to sessions logged from now on.</p>
        </form>
        <form action={deleteFamily}>
          <input type="hidden" name="id" value={f.id} />
          <button type="submit" className={secondaryButton}>
            Delete family
          </button>
        </form>
      </section>
    </TutorShell>
  );
}
