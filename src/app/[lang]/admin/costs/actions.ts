"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Founders switch a tutor's plan by hand until Stripe is linked for the tutor product (owner
 * decision, spec §11.2). Service role, after checking the caller is an admin: tutors can't change
 * their own plan (database guard).
 */
export async function setTutorPlan(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") throw new Error("Admins only.");
  const parsed = z
    .object({ tutorId: z.uuid(), change: z.enum(["solo", "trial", "extend"]) })
    .parse({ tutorId: formData.get("tutorId"), change: formData.get("change") });
  const admin = createAdminClient();
  const update =
    parsed.change === "extend"
      ? { plan: "trial", trial_ends_at: new Date(Date.now() + 14 * 86_400_000).toISOString() }
      : { plan: parsed.change };
  const { error } = await admin.from("tutors").update(update).eq("id", parsed.tutorId);
  if (error) throw error;
  await admin.from("audit_log").insert({
    org_id: profile.orgId,
    actor_id: profile.id,
    action: `tutor_plan_${parsed.change}`,
    entity: "tutors",
    entity_id: parsed.tutorId,
  });
  refresh();
}
