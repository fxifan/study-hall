/**
 * Invoice maths (spec §3.5, §6). The single source of truth: the server computes every total here
 * and the database checks that line amounts add up to the total (private.check_invoice_totals).
 *
 * Australian GST, as implemented (confirm with ATO guidance / an accountant before launch):
 *   - Rates are GST-inclusive, as prices quoted to consumers must be. For a GST-registered tutor the
 *     invoice is a "Tax invoice" showing the GST included: gst = round(total / 11).
 *   - A tutor who isn't registered issues a plain "Invoice" with no GST line: gst = 0.
 * Everything is integer cents; rounding is half-up, once per line and once for GST.
 */

export type LineInput = { sessionId: string | null; description: string; qty: number; unitCents: number };
export type Line = LineInput & { amountCents: number };
export type Totals = { subtotalCents: number; gstCents: number; totalCents: number };

/** Hundredths of a unit, so 1.25 h is 125 and floating point never touches money. */
export function qtyHundredths(qty: number): number {
  return Math.round(qty * 100);
}

export function lineAmount(qty: number, unitCents: number): number {
  return Math.round((qtyHundredths(qty) * unitCents) / 100);
}

/** One session's charge: its share of the hourly rate, to the nearest cent. */
export function sessionCharge(durationMin: number, hourlyRateCents: number): number {
  return Math.round((durationMin * hourlyRateCents) / 60);
}

export function computeLines(lines: LineInput[]): Line[] {
  return lines.map((l) => ({ ...l, amountCents: lineAmount(l.qty, l.unitCents) }));
}

export function computeTotals(lines: Pick<Line, "amountCents">[], gstRegistered: boolean): Totals {
  const totalCents = lines.reduce((sum, l) => sum + l.amountCents, 0);
  const gstCents = gstRegistered ? Math.round(totalCents / 11) : 0;
  return { subtotalCents: totalCents - gstCents, gstCents, totalCents };
}

/** "A$60.00": invoices always show cents. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-AU");
  return `${sign}A$${dollars}.${String(abs % 100).padStart(2, "0")}`;
}

/** "1 h", "1.5 h", "50 min" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(2).replace(/0$/, "")} h`;
}

/** Session → invoice line: qty 1, the session's charge as the unit price. */
export function sessionLine(session: {
  id: string;
  durationMin: number;
  rateCents: number;
  label: string;
}): LineInput {
  return {
    sessionId: session.id,
    description: `${session.label} (${formatDuration(session.durationMin)} @ ${formatCents(session.rateCents)}/h)`.slice(0, 200),
    qty: 1,
    unitCents: sessionCharge(session.durationMin, session.rateCents),
  };
}

/** "Tax invoice" only when the tutor is registered for GST. */
export function invoiceTitle(gstRegistered: boolean): "Tax invoice" | "Invoice" {
  return gstRegistered ? "Tax invoice" : "Invoice";
}

/** Payload for the tutor_create_invoice / tutor_save_invoice RPCs. */
export function linesPayload(lines: Line[]) {
  return lines.map((l) => ({
    session_id: l.sessionId,
    description: l.description,
    qty: qtyHundredths(l.qty) / 100,
    unit_cents: l.unitCents,
    amount_cents: l.amountCents,
  }));
}
