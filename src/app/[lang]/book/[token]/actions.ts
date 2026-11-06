"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentLegalDocument } from "@/lib/legal";
import { siteOrigin } from "@/lib/site";
import { seatCheckoutUrl } from "@/lib/social/billing";
import { createAdminClient } from "@/lib/supabase/admin";

/** A parent books their child's seat in a group Study Hall session (A$40, Stripe one-off). */
export async function bookSeat(token: string, lang: string, formData: FormData) {
  const back = `/${lang}/book/${token}`;
  const email = z.email().trim().toLowerCase().safeParse(formData.get("email"));
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token) || !email.success || formData.get("rules") !== "on" || formData.get("privacy") !== "on") redirect(`${back}?error=1`);
  const admin = createAdminClient();
  const { data: seat } = await admin.from("studyhall_seats").select("id, status, studyhall_bookings(topic, cancelled_at)").eq("token", token).maybeSingle();
  const booking = seat?.studyhall_bookings as unknown as { topic: string; cancelled_at: string | null } | null;
  if (!seat || seat.status !== "pending" || !booking || booking.cancelled_at) redirect(back);
  const [rules, privacy, h] = await Promise.all([getCurrentLegalDocument("house_rules"), getCurrentLegalDocument("privacy_child_safety"), headers()]);
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  await admin
    .from("studyhall_seats")
    .update({
      parent_email: email.data,
      consent_house_rules_version: rules?.version ?? null,
      consent_privacy_version: privacy?.version ?? null,
      consent_ip_hash: ip ? createHash("sha256").update(`${process.env.IP_HASH_SALT ?? ""}:${ip}`).digest("hex") : null,
    })
    .eq("id", seat.id);
  redirect(await seatCheckoutUrl({ seatId: seat.id as string, token, topic: booking.topic, email: email.data, origin: await siteOrigin(), lang }));
}
