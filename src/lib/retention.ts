import "server-only";
import { EVIDENCE_BUCKET } from "./evidence";
import { createAdminClient } from "./supabase/admin";
import { endedFamilies, type SubscriptionRow } from "./retention-rules";

export { RETENTION_DAYS } from "./retention-rules";

/**
 * Owner decision (4 Nov 2026): a family's data is kept for 7 days after their subscription ends,
 * then deleted. Runs daily from the generate-sessions cron. Deletes, for each such parent: their
 * children's uploaded work (storage), the children's messages, the children (cascading to their
 * goals, attendance, reports, check-ins, flags and help requests), the children's logins, and
 * finally the parent's login (cascading to their profile, consents and subscription rows).
 * Stripe keeps its own billing records. Returns how many families were deleted (no personal data).
 */
export async function deleteEndedFamilies(now = new Date()): Promise<{ families: number; students: number }> {
  const admin = createAdminClient();
  const { data: subs, error } = await admin
    .from("subscriptions")
    .select("parent_id, status, current_period_end, canceled_at");
  if (error) throw error;
  const parents = endedFamilies((subs ?? []) as SubscriptionRow[], now);
  let students = 0;

  for (const parentId of parents) {
    const { data: parent } = await admin.from("profiles").select("role, org_id").eq("id", parentId).maybeSingle();
    if (parent?.role !== "parent") continue; // never touch a staff or tutor login
    const { data: links } = await admin.from("parent_students").select("student_id").eq("parent_id", parentId);
    const studentIds = (links ?? []).map((l) => l.student_id as string);
    // A child shared with another parent who still subscribes stays.
    const { data: otherLinks } = studentIds.length
      ? await admin.from("parent_students").select("student_id, parent_id").in("student_id", studentIds).neq("parent_id", parentId)
      : { data: [] };
    const shared = new Set((otherLinks ?? []).map((l) => l.student_id as string));
    const own = studentIds.filter((id) => !shared.has(id));

    if (own.length) {
      const { data: rows } = await admin.from("students").select("id, profile_id").in("id", own);
      const { data: files } = await admin.from("goal_evidence").select("storage_path").in("student_id", own);
      const paths = (files ?? []).map((f) => f.storage_path as string);
      for (let i = 0; i < paths.length; i += 100) await admin.storage.from(EVIDENCE_BUCKET).remove(paths.slice(i, i + 100));
      const profileIds = (rows ?? []).flatMap((r) => (r.profile_id ? [r.profile_id as string] : []));
      if (profileIds.length) await admin.from("messages").delete().in("sender_id", profileIds);
      const { error: studentError } = await admin.from("students").delete().in("id", own);
      if (studentError) throw studentError;
      for (const id of profileIds) await admin.auth.admin.deleteUser(id);
      students += own.length;
    }
    await admin.from("messages").delete().eq("sender_id", parentId);
    const { error: userError } = await admin.auth.admin.deleteUser(parentId);
    if (userError) throw userError;
    await admin.from("audit_log").insert({
      org_id: parent.org_id,
      actor_id: null,
      action: "family_deleted_after_retention",
      entity: "profiles",
      entity_id: parentId,
    });
  }
  return { families: parents.length, students };
}
