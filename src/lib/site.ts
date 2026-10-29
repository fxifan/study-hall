import "server-only";
import { headers } from "next/headers";

/**
 * Public origin for links handed to Stripe and Supabase emails. NEXT_PUBLIC_SITE_URL when set
 * (production), otherwise the current request's host (local dev and Vercel previews).
 */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
