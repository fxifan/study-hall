import { getCurrentProfile } from "@/lib/auth";
import { loadAnalytics } from "@/lib/analytics-data";
import { tutorPays } from "@/lib/analytics";

/**
 * GET /api/admin/accounts: every real account as CSV (admins only, checked on the server).
 * Name, email, product, role, created date, status. No report, note or invoice content.
 */
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") return new Response("Admins only.", { status: 403 });
  const now = new Date();
  const data = await loadAnalytics({ from: new Date(now.getTime() - 30 * 86_400_000), to: now });
  const tutor = new Map(data.tutors.map((t) => [t.id, t]));
  const subs = new Map<string, string>();
  for (const s of data.subscriptions) if (!subs.has(s.parent_id) || s.status === "active") subs.set(s.parent_id, s.status);
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [
    ["name", "email", "product", "role", "created_at", "status"].join(","),
    ...data.accounts.map((a) => {
      const t = tutor.get(a.id);
      const status = a.role === "tutor" ? (t ? (tutorPays(t) ? "solo_paying" : t.plan) : "") : a.role === "parent" ? (subs.get(a.id) ?? "none") : "";
      return [a.name ?? "", a.email, a.role === "tutor" ? "tutors" : "study_hall", a.role, a.created_at, status].map(esc).join(",");
    }),
  ];
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="edumi-accounts-${now.toISOString().slice(0, 10)}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
