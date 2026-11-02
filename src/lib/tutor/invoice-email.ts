import { plainTextBody, renderEmail, type EmailBlock, type EmailSection, type RenderedEmail } from "@/lib/email/bilingual";
import { formatBsb, longDate, longDateZh, type InvoiceView } from "./invoice-data";
import { formatCents } from "./invoice-math";

/**
 * Invoice and overdue-reminder emails, with the PDF attached. English, plus Simplified Chinese below
 * it for families who get Chinese reports (the PDF itself is English, as a tax document).
 */
function sections(invoice: InvoiceView, kind: "invoice" | "reminder"): EmailSection[] {
  const name = invoice.seller.businessName || invoice.seller.displayName;
  const total = formatCents(invoice.totalCents);
  const due = longDate(invoice.dueDate);
  const bank = invoice.bank.bsb && invoice.bank.account;
  const en: EmailBlock[] = [
    { kind: "heading", text: kind === "invoice" ? `${invoice.title} ${invoice.reference} from ${name}` : `Reminder: ${invoice.reference} is overdue` },
    {
      kind: "p",
      text:
        kind === "invoice"
          ? `Hi ${invoice.family.parentName}, here is your invoice for tutoring. The PDF is attached.`
          : `Hi ${invoice.family.parentName}, this is a friendly reminder that invoice ${invoice.reference} was due on ${due}. If you've already paid, thank you, and please ignore this email.`,
    },
    {
      kind: "fields",
      rows: [
        ["Amount", `${total}${invoice.gstRegistered ? " (incl. GST)" : ""}`],
        ["Due", due],
        ...(bank
          ? ([
              ["Pay to", invoice.bank.accountName ?? name],
              ["BSB", formatBsb(invoice.bank.bsb) ?? ""],
              ["Account", invoice.bank.account ?? ""],
              ["Reference", invoice.reference],
            ] as [string, string][])
          : ([["Reference", invoice.reference]] as [string, string][])),
      ],
    },
    ...(invoice.paymentLinkUrl ? [{ kind: "button" as const, label: "Pay online", url: invoice.paymentLinkUrl }] : []),
  ];
  const result: EmailSection[] = [
    { label: "English", lang: "en", colon: ": ", blocks: en, footer: `Sent by ${name} using Study Hall. Reply to this email to reach ${invoice.seller.displayName}.` },
  ];
  if (invoice.family.reportLang !== "en") {
    const dueZh = longDateZh(invoice.dueDate);
    const zh: EmailBlock[] = [
      { kind: "heading", text: kind === "invoice" ? `${name} 的账单 ${invoice.reference}` : `提醒：账单 ${invoice.reference} 已逾期` },
      {
        kind: "p",
        text:
          kind === "invoice"
            ? `您好，这是辅导课程的账单，PDF 已附在邮件中。`
            : `您好，温馨提醒：账单 ${invoice.reference} 的付款截止日期为 ${dueZh}。如您已付款，谢谢，请忽略此邮件。`,
      },
      {
        kind: "fields",
        rows: [
          ["金额", `${total}${invoice.gstRegistered ? "（含 GST）" : ""}`],
          ["付款截止日期", dueZh],
          ...(bank
            ? ([
                ["收款人", invoice.bank.accountName ?? name],
                ["BSB", formatBsb(invoice.bank.bsb) ?? ""],
                ["账号", invoice.bank.account ?? ""],
                ["转账备注", invoice.reference],
              ] as [string, string][])
            : ([["转账备注", invoice.reference]] as [string, string][])),
        ],
      },
    ];
    result.push({ label: "简体中文", lang: "zh-CN", colon: "：", blocks: zh, footer: `由 ${name} 通过 Study Hall 发送。直接回复此邮件即可联系 ${invoice.seller.displayName}。` });
  }
  return result;
}

export function invoiceEmail(invoice: InvoiceView): RenderedEmail {
  const name = invoice.seller.businessName || invoice.seller.displayName;
  return renderEmail({
    subject: `${invoice.title} ${invoice.reference} from ${name}: ${formatCents(invoice.totalCents)}, due ${longDate(invoice.dueDate)}`,
    sections: sections(invoice, "invoice"),
    brand: name,
  });
}

export function reminderEmail(invoice: InvoiceView): RenderedEmail {
  const name = invoice.seller.businessName || invoice.seller.displayName;
  return renderEmail({
    subject: `Reminder: ${invoice.reference} from ${name} is overdue (${formatCents(invoice.totalCents)})`,
    sections: sections(invoice, "reminder"),
    brand: name,
  });
}

/**
 * The same invoice or reminder as plain text, for the tutor to send from their own email app with
 * the PDF attached (while Study Hall has no verified sending domain).
 */
export function ownInvoiceEmail(invoice: InvoiceView, kind: "invoice" | "reminder"): { subject: string; body: string } {
  const rendered = kind === "invoice" ? invoiceEmail(invoice) : reminderEmail(invoice);
  return { subject: rendered.subject, body: plainTextBody(sections(invoice, kind), `Thanks,\n${invoice.seller.displayName}`) };
}
