import { EmailError, sendEmail, tutorEmailMode } from "@/lib/email/send";
import { createAdminClient } from "@/lib/supabase/admin";
import { OVERDUE_REMINDER_DAYS } from "@/lib/tutor/config";
import { loadInvoice } from "@/lib/tutor/invoice-data";
import { reminderEmail } from "@/lib/tutor/invoice-email";
import { invoiceFilename, invoicePdf } from "@/lib/tutor/invoice-pdf";
import { addDaysToDateKey, dateKeyOf } from "@/lib/time";

/**
 * Daily (vercel.json), the tutor product's only scheduled job (spec §7):
 *   1. Sent invoices past their due date (Melbourne) become overdue.
 *   2. One reminder per invoice, 7 days after the due date, unless the tutor turned reminders off.
 *      Only when Study Hall sends email itself (tutorEmailMode() === "app"); until then tutors send
 *      reminders from their own email, from the invoice page.
 * Vercel Cron sends "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  const today = dateKeyOf();

  const { data: overdue, error } = await admin
    .from("tutor_invoices")
    .update({ status: "overdue" })
    .eq("status", "sent")
    .lt("due_date", today)
    .select("id");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (tutorEmailMode() !== "app") return Response.json({ overdue: overdue?.length ?? 0, reminded: 0, failed: [], reminders: "off: no sending domain" });

  const { data: due } = await admin
    .from("tutor_invoices")
    .select("id, tutor_id, tutors!inner(overdue_reminders, display_name)")
    .eq("status", "overdue")
    .is("reminder_sent_at", null)
    .lte("due_date", addDaysToDateKey(today, -OVERDUE_REMINDER_DAYS))
    .eq("tutors.overdue_reminders", true)
    .limit(50)
    .returns<{ id: string; tutor_id: string; tutors: { overdue_reminders: boolean; display_name: string } }[]>();

  let reminded = 0;
  const failed: string[] = [];
  for (const row of due ?? []) {
    const invoice = await loadInvoice(admin, row.id, null);
    if (!invoice) continue;
    try {
      await sendEmail({
        to: invoice.family.parentEmail,
        email: reminderEmail(invoice),
        fromName: row.tutors.display_name,
        replyTo: invoice.seller.email,
        attachments: [{ filename: invoiceFilename(invoice), content: await invoicePdf(invoice), contentType: "application/pdf" }],
      });
      await admin.from("tutor_invoices").update({ reminder_sent_at: new Date().toISOString() }).eq("id", row.id);
      await admin.from("tutor_usage_events").insert({ tutor_id: row.tutor_id, kind: "email", amount: 1 });
      reminded += 1;
    } catch (e) {
      console.error("Reminder not sent", row.id, e instanceof EmailError ? e.message : e);
      failed.push(row.id);
    }
  }
  return Response.json({ overdue: overdue?.length ?? 0, reminded, failed });
}
