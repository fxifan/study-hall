import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { paymentReference } from "@/lib/payments";
import { dateKeyOf } from "@/lib/time";
import { tryDecrypt } from "./crypto";
import { invoiceTitle } from "./invoice-math";
import type { TutorRow } from "./server";

/** What an invoice shows about the seller. Snapshotted into tutor_invoices.seller when sent. */
export type SellerSnapshot = {
  displayName: string;
  businessName: string | null;
  abn: string | null;
  email: string;
  bankAccountName: string | null;
  bankBsbEnc: string | null;
  bankAcctEnc: string | null;
};

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

export type InvoiceView = {
  id: string;
  number: number;
  reference: string;
  title: "Tax invoice" | "Invoice";
  gstRegistered: boolean;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  storedStatus: InvoiceStatus;
  sentAt: string | null;
  sentTo: string | null;
  paidAt: string | null;
  reminderSentAt: string | null;
  paymentLinkUrl: string | null;
  family: { id: string; parentName: string; parentEmail: string; reportLang: "en" | "zh-CN" | "both" };
  seller: { displayName: string; businessName: string | null; abn: string | null; email: string };
  bank: { accountName: string | null; bsb: string | null; account: string | null };
  lines: { id: string; sessionId: string | null; description: string; qty: number; unitCents: number; amountCents: number }[];
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
};

export function sellerSnapshot(tutor: TutorRow, email: string): SellerSnapshot {
  return {
    displayName: tutor.display_name,
    businessName: tutor.business_name,
    abn: tutor.abn,
    email,
    bankAccountName: tutor.bank_account_name,
    bankBsbEnc: tutor.bank_bsb_enc,
    bankAcctEnc: tutor.bank_acct_enc,
  };
}

/** Sent and past due (Melbourne date) reads as overdue, whether or not the daily job has run. */
export function effectiveStatus(status: InvoiceStatus, dueDate: string, today = dateKeyOf()): InvoiceStatus {
  return (status === "sent" || status === "overdue") && dueDate < today ? "overdue" : status === "overdue" ? "sent" : status;
}

type Row = {
  id: string;
  number: number;
  issue_date: string;
  due_date: string;
  gst_registered: boolean;
  status: InvoiceStatus;
  subtotal_cents: number;
  gst_cents: number;
  total_cents: number;
  seller: SellerSnapshot | null;
  sent_at: string | null;
  sent_to: string | null;
  paid_at: string | null;
  reminder_sent_at: string | null;
  payment_link_url: string | null;
  tutor_families: { id: string; parent_name: string; parent_email: string; report_lang: "en" | "zh-CN" | "both" };
  tutor_invoice_lines: { id: string; session_id: string | null; position: number; description: string; qty: number | string; unit_cents: number; amount_cents: number }[];
};

/**
 * Load an invoice for display or PDF. Drafts show the tutor's current details; sent invoices show
 * the snapshot taken when they were sent. Works with an RLS client (tutor) or the service role (cron).
 */
export async function loadInvoice(
  supabase: SupabaseClient,
  id: string,
  current: { tutor: TutorRow; email: string } | null,
): Promise<InvoiceView | null> {
  const { data: r } = await supabase
    .from("tutor_invoices")
    .select(
      "id, number, issue_date, due_date, gst_registered, status, subtotal_cents, gst_cents, total_cents, seller, sent_at, sent_to, paid_at, reminder_sent_at, payment_link_url, tutor_families!inner(id, parent_name, parent_email, report_lang), tutor_invoice_lines(id, session_id, position, description, qty, unit_cents, amount_cents)",
    )
    .eq("id", id)
    .maybeSingle<Row>();
  if (!r) return null;
  const seller = r.status === "draft" || !r.seller ? (current ? sellerSnapshot(current.tutor, current.email) : r.seller) : r.seller;
  if (!seller) return null;
  return {
    id: r.id,
    number: r.number,
    reference: paymentReference(r.number),
    title: invoiceTitle(r.gst_registered),
    gstRegistered: r.gst_registered,
    issueDate: r.issue_date,
    dueDate: r.due_date,
    status: effectiveStatus(r.status, r.due_date),
    storedStatus: r.status,
    sentAt: r.sent_at,
    sentTo: r.sent_to,
    paidAt: r.paid_at,
    reminderSentAt: r.reminder_sent_at,
    paymentLinkUrl: r.payment_link_url,
    family: { id: r.tutor_families.id, parentName: r.tutor_families.parent_name, parentEmail: r.tutor_families.parent_email, reportLang: r.tutor_families.report_lang },
    seller: { displayName: seller.displayName, businessName: seller.businessName, abn: seller.abn, email: seller.email },
    bank: { accountName: seller.bankAccountName, bsb: tryDecrypt(seller.bankBsbEnc), account: tryDecrypt(seller.bankAcctEnc) },
    lines: r.tutor_invoice_lines
      .toSorted((a, b) => a.position - b.position)
      .map((l) => ({ id: l.id, sessionId: l.session_id, description: l.description, qty: Number(l.qty), unitCents: l.unit_cents, amountCents: l.amount_cents })),
    subtotalCents: r.subtotal_cents,
    gstCents: r.gst_cents,
    totalCents: r.total_cents,
  };
}

/** "2026-11-09" -> "9 November 2026" */
export function longDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "2026-11-09" -> "2026年11月9日" */
export function longDateZh(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return `${y}年${m}月${d}日`;
}

export function formatBsb(bsb: string | null): string | null {
  return bsb && /^\d{6}$/.test(bsb) ? `${bsb.slice(0, 3)}-${bsb.slice(3)}` : bsb;
}

/** PDF fonts here are Latin-only; names with Chinese characters can't be printed yet. */
export function hasCjk(text: string): boolean {
  return /[㐀-鿿豈-﫿]/.test(text);
}
