"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { siteOrigin } from "@/lib/site";
import { studentCheckoutUrl } from "@/lib/social/billing";
import { createAdminClient } from "@/lib/supabase/admin";

/** A parent pays for their child's student plan from the link the child shared. */
export async function parentPay(token: string, lang: string, formData: FormData) {
  const email = z.email().trim().toLowerCase().safeParse(formData.get("email"));
  if (!email.success || formData.get("agree") !== "on" || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) redirect(`/${lang}/pay/${token}?error=1`);
  const admin = createAdminClient();
  const { data: plan } = await admin.from("student_plans").select("profile_id").eq("parent_link_token", token).maybeSingle();
  if (!plan) redirect(`/${lang}/pay/${token}?error=1`);
  await admin.from("student_plans").update({ parent_email: email.data, updated_at: new Date().toISOString() }).eq("profile_id", plan.profile_id);
  const url = await studentCheckoutUrl({
    profileId: plan.profile_id as string,
    payer: "parent",
    email: email.data,
    customer: null,
    origin: await siteOrigin(),
    returnPath: `/${lang}/pay/${token}`,
  });
  redirect(url);
}
