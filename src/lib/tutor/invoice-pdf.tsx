import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatBsb, hasCjk, longDate, type InvoiceView } from "./invoice-data";
import { formatCents } from "./invoice-math";

/**
 * Invoice PDF (spec §3.5, §6), rendered server-side with @react-pdf/renderer: no headless browser.
 *
 * "Tax invoice" for GST-registered tutors (ABN, GST amount, "Total includes GST"); otherwise a plain
 * "Invoice" with no GST line. The ATO's tax-invoice requirements for sales under A$1,000 are: the
 * words "Tax invoice", the seller's identity and ABN, the issue date, a description of what was sold
 * (quantity and price), the GST amount, and that the price includes GST. Confirm before launch.
 *
 * Fonts are the PDF built-ins (Latin only): a name in Chinese characters is replaced by the
 * parent's email in "Bill to" rather than printed as blank boxes.
 */
const s = StyleSheet.create({
  page: { padding: 48, fontSize: 10, fontFamily: "Helvetica", color: "#1b2a41" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  title: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  muted: { color: "#5b6472" },
  label: { color: "#5b6472", fontSize: 8, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 },
  block: { marginBottom: 18 },
  th: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#1b2a41", paddingBottom: 4, marginBottom: 4, fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 0.5, borderColor: "#d3deeb" },
  desc: { flex: 1, paddingRight: 8 },
  num: { width: 60, textAlign: "right" },
  totals: { marginTop: 10, marginLeft: "auto", width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grand: { fontFamily: "Helvetica-Bold", fontSize: 12, borderTopWidth: 1, borderColor: "#1b2a41", paddingTop: 4, marginTop: 2 },
  pay: { marginTop: 28, padding: 12, borderWidth: 1, borderColor: "#d3deeb" },
});

const qtyText = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(2).replace(/0$/, ""));

export function InvoiceDocument({ invoice }: { invoice: InvoiceView }) {
  const seller = invoice.seller;
  const name = seller.businessName || seller.displayName;
  const billTo = hasCjk(invoice.family.parentName) ? invoice.family.parentEmail : invoice.family.parentName;
  return (
    <Document title={`${invoice.title} ${invoice.reference}`} author={name}>
      <Page size="A4" style={s.page}>
        <View style={[s.row, s.block]}>
          <View>
            <Text style={s.title}>{invoice.title}</Text>
            <Text style={s.muted}>{invoice.reference}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12 }}>{name}</Text>
            {seller.businessName && <Text>{seller.displayName}</Text>}
            {seller.abn && <Text>ABN {seller.abn.replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3 $4")}</Text>}
            <Text style={s.muted}>{seller.email}</Text>
          </View>
        </View>

        <View style={[s.row, s.block]}>
          <View>
            <Text style={s.label}>Bill to</Text>
            <Text>{billTo}</Text>
            {billTo !== invoice.family.parentEmail && <Text style={s.muted}>{invoice.family.parentEmail}</Text>}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.label}>Issued</Text>
            <Text>{longDate(invoice.issueDate)}</Text>
            <Text style={[s.label, { marginTop: 6 }]}>Due</Text>
            <Text>{longDate(invoice.dueDate)}</Text>
          </View>
        </View>

        <View style={s.th}>
          <Text style={s.desc}>Description</Text>
          <Text style={s.num}>Qty</Text>
          <Text style={s.num}>Price</Text>
          <Text style={s.num}>Amount</Text>
        </View>
        {invoice.lines.map((l) => (
          <View key={l.id} style={s.tr} wrap={false}>
            <Text style={s.desc}>{l.description}</Text>
            <Text style={s.num}>{qtyText(l.qty)}</Text>
            <Text style={s.num}>{formatCents(l.unitCents)}</Text>
            <Text style={s.num}>{formatCents(l.amountCents)}</Text>
          </View>
        ))}

        <View style={s.totals}>
          {invoice.gstRegistered ? (
            <>
              <View style={s.totalRow}>
                <Text>Subtotal (excl. GST)</Text>
                <Text>{formatCents(invoice.subtotalCents)}</Text>
              </View>
              <View style={s.totalRow}>
                <Text>GST (10%)</Text>
                <Text>{formatCents(invoice.gstCents)}</Text>
              </View>
              <View style={[s.totalRow, s.grand]}>
                <Text>Total (incl. GST)</Text>
                <Text>{formatCents(invoice.totalCents)}</Text>
              </View>
              <Text style={[s.muted, { marginTop: 4, fontSize: 8 }]}>Total price includes GST.</Text>
            </>
          ) : (
            <View style={[s.totalRow, s.grand]}>
              <Text>Total</Text>
              <Text>{formatCents(invoice.totalCents)}</Text>
            </View>
          )}
        </View>

        <View style={s.pay} wrap={false}>
          <Text style={s.label}>How to pay</Text>
          {invoice.bank.bsb && invoice.bank.account ? (
            <>
              <Text>Bank transfer to:</Text>
              {invoice.bank.accountName && <Text>Account name: {invoice.bank.accountName}</Text>}
              <Text>BSB: {formatBsb(invoice.bank.bsb)}</Text>
              <Text>Account number: {invoice.bank.account}</Text>
              <Text>Reference: {invoice.reference}</Text>
            </>
          ) : (
            <Text>Please contact {seller.email} for payment details. Reference: {invoice.reference}</Text>
          )}
          {invoice.paymentLinkUrl && <Text style={{ marginTop: 4 }}>Or pay online: {invoice.paymentLinkUrl}</Text>}
        </View>
        {!invoice.gstRegistered && (
          <Text style={[s.muted, { marginTop: 12, fontSize: 8 }]}>{name} is not registered for GST. No GST has been charged.</Text>
        )}
      </Page>
    </Document>
  );
}

export async function invoicePdf(invoice: InvoiceView): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument invoice={invoice} />);
}

export function invoiceFilename(invoice: InvoiceView): string {
  return `${invoice.title.replace(" ", "-")}-${invoice.reference}.pdf`;
}
