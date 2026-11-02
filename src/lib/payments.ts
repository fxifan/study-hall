import "server-only";

/**
 * Family-payment adapter (docs/tutor-reports-spec.md §2). Owner decision (§11.2): no Stripe for
 * the MVP. Families pay tutors by bank transfer, using the details printed on the invoice; tutors
 * mark invoices paid by hand. When Stripe Connect (Express) Payment Links are added, return the
 * link here and the invoice email and PDF will show it (tutor_invoices.payment_link_url).
 */
export async function paymentLinkFor(invoice: { id: string; totalCents: number }): Promise<string | null> {
  void invoice;
  return null;
}

/** Bank-transfer reference families should use, e.g. "INV-0007". */
export function paymentReference(number: number): string {
  return `INV-${String(number).padStart(4, "0")}`;
}
