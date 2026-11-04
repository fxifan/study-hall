import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { hasCjk, longDate, loadInvoice } from "@/lib/tutor/invoice-data";
import { formatCents } from "@/lib/tutor/invoice-math";
import { ownInvoiceEmail } from "@/lib/tutor/invoice-email";
import { invoiceFilename } from "@/lib/tutor/invoice-pdf";
import { tutorEmailMode } from "@/lib/email/send";
import { requireTutor } from "@/lib/tutor/server";
import { formatInZone } from "@/lib/time";
import { deleteInvoice, setPaid } from "../actions";
import { Loading, Notice, TutorShell, appHref, primaryButton, secondaryButton } from "../../_components/shell";
import { STATUS_STYLE } from "../../_components/styles";
import { InvoiceEditor } from "./invoice-editor";
import { OwnEmailSend } from "./own-send";

export const metadata: Metadata = { title: "Invoice" };

export default function InvoicePage({ params, searchParams }: PageProps<"/[lang]/app/invoices/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Invoice params={params} searchParams={searchParams} />
    </Suspense>
  );
}


async function Invoice({ params, searchParams }: Pick<PageProps<"/[lang]/app/invoices/[id]">, "params" | "searchParams">) {
  const [me, locale, { id }, query] = await Promise.all([requireTutor(), getLocale(), params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const invoice = await loadInvoice(await createClient(), id, { tutor: me.tutor, email: me.profile.email });
  if (!invoice) notFound();
  const pdfHref = `/api/tutor/invoices/${invoice.id}/pdf`;
  const own = tutorEmailMode() === "own";
  const ownProps = { invoiceId: invoice.id, to: invoice.family.parentEmail, pdfHref, filename: invoiceFilename(invoice) };

  return (
    <TutorShell
      tutor={me}
      title={`${invoice.title} ${invoice.reference}`}
      current="invoices"
      back={{ href: `/app/families/${invoice.family.id}`, label: invoice.family.parentName }}
    >
      {query.saved === "created" && <Notice>Draft created from the unbilled sessions. Check the lines, then send.</Notice>}
      {query.saved === "paid" && <Notice>Marked as paid.</Notice>}
      {query.saved === "unpaid" && <Notice>Marked as unpaid.</Notice>}
      {query.error && <Notice tone="error">Something went wrong. Try again.</Notice>}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`rounded-full border px-2.5 py-0.5 capitalize ${STATUS_STYLE[invoice.status]}`}>{invoice.status}</span>
        <span className="text-ink-soft">
          To {invoice.family.parentName} ({invoice.family.parentEmail})
        </span>
      </div>
      {hasCjk(invoice.family.parentName) && (
        <p className="text-xs text-ink-soft">The PDF shows the parent&apos;s email in &quot;Bill to&quot;: Chinese characters can&apos;t be printed in invoice PDFs yet.</p>
      )}
      {invoice.gstRegistered && !invoice.seller.abn && <Notice tone="error">A tax invoice must show your ABN. Add it in Settings before sending.</Notice>}
      {!invoice.bank.bsb && invoice.storedStatus === "draft" && (
        <p className="text-sm text-ink-soft">
          Tip: add your bank details in{" "}
          <Link className="underline" href={appHref("/app/settings", locale)}>
            Settings
          </Link>{" "}
          so families know how to pay.
        </p>
      )}

      {invoice.storedStatus === "draft" ? (
        <>
          <InvoiceEditor
            id={invoice.id}
            initial={{
              issueDate: invoice.issueDate,
              dueDate: invoice.dueDate,
              lines: invoice.lines.map((l) => ({ sessionId: l.sessionId, description: l.description, qty: l.qty, unitCents: l.unitCents })),
            }}
            gstRegistered={invoice.gstRegistered}
            parentEmail={invoice.family.parentEmail}
            pdfHref={pdfHref}
            ownSend={
              own ? (
                <OwnEmailSend
                  {...ownProps}
                  {...ownInvoiceEmail(invoice, "invoice")}
                  mode="invoice"
                  disabled={invoice.gstRegistered && !invoice.seller.abn ? "Add your ABN in Settings before sending a tax invoice." : null}
                />
              ) : null
            }
          />
          <form action={deleteInvoice}>
            <input type="hidden" name="id" value={invoice.id} />
            <button type="submit" className="text-sm text-ink-soft hover:text-pen">
              Delete draft (sessions go back to unbilled)
            </button>
          </form>
        </>
      ) : (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 dash-card p-4 text-sm">
            <dt className="text-ink-soft">Total</dt>
            <dd className="font-medium">
              {formatCents(invoice.totalCents)}
              {invoice.gstRegistered ? ` (incl. ${formatCents(invoice.gstCents)} GST)` : ""}
            </dd>
            <dt className="text-ink-soft">Issued</dt>
            <dd>{longDate(invoice.issueDate)}</dd>
            <dt className="text-ink-soft">Due</dt>
            <dd>{longDate(invoice.dueDate)}</dd>
            {invoice.sentAt && (
              <>
                <dt className="text-ink-soft">Sent</dt>
                <dd>
                  {formatInZone(invoice.sentAt, "d MMM yyyy, h:mmaaa")} to {invoice.sentTo}
                </dd>
              </>
            )}
            {invoice.reminderSentAt && (
              <>
                <dt className="text-ink-soft">Reminder</dt>
                <dd>{formatInZone(invoice.reminderSentAt, "d MMM yyyy")}</dd>
              </>
            )}
            {invoice.paidAt && (
              <>
                <dt className="text-ink-soft">Paid</dt>
                <dd>{formatInZone(invoice.paidAt, "d MMM yyyy")}</dd>
              </>
            )}
          </dl>
          <ul className="divide-y divide-rule dash-card text-sm">
            {invoice.lines.map((l) => (
              <li key={l.id} className="flex justify-between gap-3 px-4 py-2">
                <span>{l.description}</span>
                <span className="font-mono tabular-nums">{formatCents(l.amountCents)}</span>
              </li>
            ))}
          </ul>
          {own && invoice.status === "overdue" && (
            <section className="flex flex-col gap-2">
              <h2 className="font-medium">Send a reminder</h2>
              <OwnEmailSend {...ownProps} {...ownInvoiceEmail(invoice, "reminder")} mode="reminder" />
            </section>
          )}
          <div className="grid grid-cols-2 gap-2">
            <form action={setPaid}>
              <input type="hidden" name="id" value={invoice.id} />
              <input type="hidden" name="paid" value={invoice.status === "paid" ? "0" : "1"} />
              <button type="submit" className={`${invoice.status === "paid" ? secondaryButton : primaryButton} w-full`}>
                {invoice.status === "paid" ? "Mark as unpaid" : "Mark as paid"}
              </button>
            </form>
            <a className={secondaryButton} href={pdfHref} target="_blank" rel="noreferrer">
              Download PDF
            </a>
          </div>
        </>
      )}
    </TutorShell>
  );
}
