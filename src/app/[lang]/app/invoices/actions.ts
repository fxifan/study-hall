"use server";

import { track } from "@/lib/events";
import { refresh } from "next/cache";
import { z } from "zod";
import { EmailError, sendEmail, tutorEmailMode } from "@/lib/email/send";
import { createClient } from "@/lib/supabase/server";
import { studentName } from "@/lib/tutor/format";
import { loadInvoice, sellerSnapshot } from "@/lib/tutor/invoice-data";
import { invoiceEmail } from "@/lib/tutor/invoice-email";
import { computeLines, computeTotals, linesPayload, sessionLine, type LineInput } from "@/lib/tutor/invoice-math";
import { invoiceFilename, invoicePdf } from "@/lib/tutor/invoice-pdf";
import { canWork } from "@/lib/tutor/plan";
import { logUsage } from "@/lib/tutor/server";
import { addDaysToDateKey, dateKeyOf, formatInZone, zonedDateTimeToUtc } from "@/lib/time";
import { blockedMessage } from "../_components/plan-banner";
import { back, requireTutorAction } from "../_lib/action-helpers";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Group a family's unbilled sessions in a date range into a draft invoice (spec §3.5). */
export async function createInvoice(formData: FormData) {
  const me = await requireTutorAction();
  const parsed = z
    .object({ familyId: z.uuid(), from: day, to: day })
    .safeParse({ familyId: formData.get("familyId"), from: formData.get("from"), to: formData.get("to") });
  if (!parsed.success) return back("/app/invoices", "?error=range");
  const { familyId, from, to } = parsed.data;
  if (!canWork({ plan: me.tutor.plan, trialEndsAt: me.tutor.trial_ends_at })) return back(`/app/families/${familyId}`, "?error=blocked");

  const supabase = await createClient();
  const { data: sessions } = await supabase
    .from("tutor_sessions")
    .select("id, starts_at, duration_min, rate_cents, subjects, tutor_students!inner(first_name, last_initial, family_id)")
    .eq("tutor_students.family_id", familyId)
    .is("invoice_id", null)
    .gte("starts_at", zonedDateTimeToUtc(from, "00:00").toISOString())
    .lt("starts_at", zonedDateTimeToUtc(addDaysToDateKey(to, 1), "00:00").toISOString())
    .order("starts_at")
    .returns<{ id: string; starts_at: string; duration_min: number; rate_cents: number; subjects: string[]; tutor_students: { first_name: string; last_initial: string } }[]>();
  if (!sessions?.length) return back(`/app/families/${familyId}`, "?error=none");

  const lines = computeLines(
    sessions.map((s) =>
      sessionLine({
        id: s.id,
        durationMin: s.duration_min,
        rateCents: s.rate_cents,
        label: [`Tutoring${s.subjects.length ? `: ${s.subjects.join(", ")}` : ""}`, studentName(s.tutor_students), formatInZone(s.starts_at, "EEE d MMM yyyy")].join(" · "),
      }),
    ),
  );
  const totals = computeTotals(lines, me.tutor.gst_registered);
  const issue = dateKeyOf();
  const { data: id, error } = await supabase.rpc("tutor_create_invoice", {
    p_family_id: familyId,
    p_issue_date: issue,
    p_due_date: addDaysToDateKey(issue, me.tutor.invoice_due_days),
    p_gst_registered: me.tutor.gst_registered,
    p_lines: linesPayload(lines),
    p_subtotal_cents: totals.subtotalCents,
    p_gst_cents: totals.gstCents,
    p_total_cents: totals.totalCents,
  });
  if (error || !id) {
    console.error("Invoice not created", error?.message);
    return back(`/app/families/${familyId}`, "?error=invoice");
  }
  await track({ name: "invoice_generated", product: "tutors", role: "tutor", userId: me.profile.id, email: me.profile.email, objectType: "tutor_invoice", objectId: id as string, props: { kind: me.tutor.gst_registered ? "gst" : "no_gst" }, dedupeKey: `invoice:${id}` });
  return back(`/app/invoices/${id}`, "?saved=created");
}

const lineSchema = z.object({
  sessionId: z.uuid().nullable(),
  description: z.string().trim().min(1).max(200),
  qty: z.number().positive().max(10000),
  unitCents: z.number().int().min(0).max(10_000_000),
});

/** Save a draft's lines and dates. Amounts and totals are recomputed here, never trusted from the browser. */
export async function saveInvoice(id: string, input: { issueDate: string; dueDate: string; lines: LineInput[] }): Promise<ActionResult> {
  await requireTutorAction();
  const parsed = z
    .object({ id: z.uuid(), issueDate: day, dueDate: day, lines: z.array(lineSchema).min(1).max(100) })
    .safeParse({ id, ...input });
  if (!parsed.success) return { ok: false, error: "Each line needs a description, a quantity above 0 and a price." };
  if (parsed.data.dueDate < parsed.data.issueDate) return { ok: false, error: "The due date can't be before the issue date." };
  const supabase = await createClient();
  const { data: invoice } = await supabase.from("tutor_invoices").select("gst_registered, status").eq("id", id).maybeSingle();
  if (!invoice) return { ok: false, error: "Invoice not found." };
  if (invoice.status !== "draft") return { ok: false, error: "This invoice has been sent and can't be changed." };
  const lines = computeLines(parsed.data.lines);
  const totals = computeTotals(lines, invoice.gst_registered);
  const { error } = await supabase.rpc("tutor_save_invoice", {
    p_invoice_id: id,
    p_issue_date: parsed.data.issueDate,
    p_due_date: parsed.data.dueDate,
    p_lines: linesPayload(lines),
    p_subtotal_cents: totals.subtotalCents,
    p_gst_cents: totals.gstCents,
    p_total_cents: totals.totalCents,
  });
  if (error) {
    console.error("Invoice not saved", error.message);
    return { ok: false, error: "Couldn't save the invoice." };
  }
  refresh();
  return { ok: true, message: "Saved." };
}

/** Email the invoice PDF to the family and fix its contents (spec §3.5). */
export async function sendInvoice(id: string): Promise<ActionResult> {
  const me = await requireTutorAction();
  if (!canWork({ plan: me.tutor.plan, trialEndsAt: me.tutor.trial_ends_at })) return { ok: false, error: blockedMessage("trial_ended") };
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Invoice not found." };
  if (tutorEmailMode() !== "app") return { ok: false, error: "Sending from Edumi isn't set up. Send it from your own email." };
  const supabase = await createClient();
  const invoice = await loadInvoice(supabase, id, { tutor: me.tutor, email: me.profile.email });
  if (!invoice) return { ok: false, error: "Invoice not found." };
  if (invoice.storedStatus !== "draft") return { ok: false, error: "This invoice has already been sent." };
  if (!invoice.lines.length || invoice.totalCents <= 0) return { ok: false, error: "Add at least one line before sending." };
  if (invoice.gstRegistered && !invoice.seller.abn) return { ok: false, error: "A tax invoice needs your ABN. Add it in Settings." };

  try {
    const pdf = await invoicePdf(invoice);
    const result = await sendEmail({
      to: invoice.family.parentEmail,
      email: invoiceEmail(invoice),
      fromName: me.tutor.display_name,
      replyTo: me.profile.email,
      attachments: [{ filename: invoiceFilename(invoice), content: pdf, contentType: "application/pdf" }],
    });
    await logUsage(me.profile.id, "email", 1);
    const { error } = await supabase
      .from("tutor_invoices")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        sent_to: invoice.family.parentEmail,
        seller: sellerSnapshot(me.tutor, me.profile.email),
      })
      .eq("id", id);
    if (error) return { ok: false, error: "Sent, but couldn't record it. Refresh the page." };
    await track({ name: "invoice_sent", product: "tutors", role: "tutor", userId: me.profile.id, email: me.profile.email, objectType: "tutor_invoice", objectId: id, props: { via: "app_email" }, dedupeKey: `invoice_sent:${id}` });
    refresh();
    return { ok: true, message: result.delivered ? `Sent to ${invoice.family.parentEmail}.` : "Marked as sent (test mode: email written to email-previews/outbox)." };
  } catch (e) {
    console.error("Invoice email failed", e instanceof EmailError ? e.message : e);
    return { ok: false, error: "Couldn't send the invoice. Nothing was sent; try again." };
  }
}

/**
 * The tutor emailed or shared the invoice themselves: fix its contents and mark it sent, exactly as
 * sendInvoice does after Edumi emails it.
 */
export async function markInvoiceSent(id: string): Promise<ActionResult> {
  const me = await requireTutorAction();
  if (!canWork({ plan: me.tutor.plan, trialEndsAt: me.tutor.trial_ends_at })) return { ok: false, error: blockedMessage("trial_ended") };
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Invoice not found." };
  const supabase = await createClient();
  const invoice = await loadInvoice(supabase, id, { tutor: me.tutor, email: me.profile.email });
  if (!invoice) return { ok: false, error: "Invoice not found." };
  if (invoice.storedStatus !== "draft") return { ok: false, error: "This invoice has already been sent." };
  if (!invoice.lines.length || invoice.totalCents <= 0) return { ok: false, error: "Add at least one line first." };
  if (invoice.gstRegistered && !invoice.seller.abn) return { ok: false, error: "A tax invoice needs your ABN. Add it in Settings." };
  const { error } = await supabase
    .from("tutor_invoices")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      sent_to: `${invoice.family.parentEmail} (your email)`,
      seller: sellerSnapshot(me.tutor, me.profile.email),
    })
    .eq("id", id);
  if (error) return { ok: false, error: "Couldn't save." };
  await track({ name: "invoice_sent", product: "tutors", role: "tutor", userId: me.profile.id, email: me.profile.email, objectType: "tutor_invoice", objectId: id, props: { via: "own_email" }, dedupeKey: `invoice_sent:${id}` });
  refresh();
  return { ok: true, message: "Marked as sent." };
}

export async function setPaid(formData: FormData) {
  await requireTutorAction();
  const id = z.uuid().parse(formData.get("id"));
  const paid = formData.get("paid") === "1";
  const supabase = await createClient();
  const { data: invoice } = await supabase.from("tutor_invoices").select("status, due_date").eq("id", id).maybeSingle();
  if (!invoice || invoice.status === "draft") return back(`/app/invoices/${id}`, "?error=status");
  const { error } = await supabase
    .from("tutor_invoices")
    .update(paid ? { status: "paid", paid_at: new Date().toISOString() } : { status: invoice.due_date < dateKeyOf() ? "overdue" : "sent", paid_at: null })
    .eq("id", id);
  return back(`/app/invoices/${id}`, error ? "?error=status" : paid ? "?saved=paid" : "?saved=unpaid");
}

export async function deleteInvoice(formData: FormData) {
  await requireTutorAction();
  const id = z.uuid().parse(formData.get("id"));
  const { error } = await (await createClient()).from("tutor_invoices").delete().eq("id", id).eq("status", "draft");
  return back("/app/invoices", error ? "?error=delete" : "?saved=deleted");
}
