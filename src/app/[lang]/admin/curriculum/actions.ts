"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Curriculum review (docs/tutor-resources-spec.md §2): an admin edits, publishes or unpublishes
 * imported points. Service role after the admin check; nobody else can write curriculum_points.
 */
async function requireAdmin() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") throw new Error("Admins only.");
  return profile;
}

const today = () => new Date().toISOString().slice(0, 10);

export async function savePoint(formData: FormData) {
  await requireAdmin();
  const p = z
    .object({
      id: z.uuid(),
      area: z.string().trim().min(1).max(160),
      summary: z.string().trim().min(1).max(400),
      code: z.string().trim().max(40),
      publish: z.enum(["publish", "unpublish", "save"]),
    })
    .parse(Object.fromEntries(formData));
  const { error } = await createAdminClient()
    .from("curriculum_points")
    .update({
      area: p.area,
      summary: p.summary,
      code: p.code || null,
      ...(p.publish === "save" ? {} : { is_published: p.publish === "publish", checked_on: today() }),
    })
    .eq("id", p.id);
  if (error) throw error;
  refresh();
}

/** Publish or unpublish every point in one subject and unit or year. */
export async function setGroupPublished(formData: FormData) {
  await requireAdmin();
  const g = z
    .object({ framework: z.enum(["vce", "vc"]), subject: z.string().min(1), unitOrLevel: z.string().min(1), publish: z.enum(["publish", "unpublish"]) })
    .parse(Object.fromEntries(formData));
  const { error } = await createAdminClient()
    .from("curriculum_points")
    .update({ is_published: g.publish === "publish", checked_on: today() })
    .eq("framework", g.framework)
    .eq("subject", g.subject)
    .eq("unit_or_level", g.unitOrLevel);
  if (error) throw error;
  refresh();
}
