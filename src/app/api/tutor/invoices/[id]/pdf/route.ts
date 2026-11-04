import { createClient } from "@/lib/supabase/server";
import { loadInvoice } from "@/lib/tutor/invoice-data";
import { invoiceFilename, invoicePdf } from "@/lib/tutor/invoice-pdf";
import { currentTutor } from "@/lib/tutor/server";

/** GET /api/tutor/invoices/<id>/pdf: the invoice PDF, rendered on demand. RLS limits it to its tutor. */
export async function GET(_request: Request, { params }: RouteContext<"/api/tutor/invoices/[id]/pdf">) {
  const me = await currentTutor();
  if (!me) return new Response("Please log in.", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const invoice = await loadInvoice(await createClient(), id, { tutor: me.tutor, email: me.profile.email });
  if (!invoice) return new Response("Not found", { status: 404 });
  const pdf = await invoicePdf(invoice);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${invoiceFilename(invoice)}"`,
      "cache-control": "private, no-store",
    },
  });
}
