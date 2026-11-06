"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function admin() {
  const p = await getCurrentProfile();
  if (p?.role !== "admin") throw new Error("Admins only.");
  return p;
}

/** Hide a reported message from members and close its reports. */
export async function hideMessage(messageId: string) {
  const me = await admin();
  const db = createAdminClient();
  await db.from("group_messages").update({ hidden_at: new Date().toISOString(), hidden_by: me.id }).eq("id", messageId);
  await db.from("message_reports").update({ resolved_at: new Date().toISOString(), resolved_by: me.id, outcome: "hidden" }).eq("message_id", messageId).is("resolved_at", null);
  refresh();
}

export async function dismissReports(messageId: string) {
  const me = await admin();
  await createAdminClient().from("message_reports").update({ resolved_at: new Date().toISOString(), resolved_by: me.id, outcome: "no_action" }).eq("message_id", messageId).is("resolved_at", null);
  refresh();
}

/** Pause a student's chat (they can still study and use practice). */
export async function suspendChat(messageId: string, formData: FormData) {
  const me = await admin();
  const days = z.coerce.number().int().min(1).max(90).catch(7).parse(formData.get("days"));
  const db = createAdminClient();
  const { data: m } = await db.from("group_messages").select("sender_id").eq("id", messageId).maybeSingle();
  if (!m?.sender_id) return;
  await db.from("students").update({ chat_suspended_until: new Date(Date.now() + days * 86_400_000).toISOString() }).eq("profile_id", m.sender_id);
  await db.from("group_messages").update({ hidden_at: new Date().toISOString(), hidden_by: me.id }).eq("id", messageId);
  await db.from("message_reports").update({ resolved_at: new Date().toISOString(), resolved_by: me.id, outcome: "suspended" }).eq("message_id", messageId).is("resolved_at", null);
  refresh();
}

/** Clear a student's flag on generated content after checking it. */
export async function clearFlag(resourceId: string) {
  await admin();
  await createAdminClient().from("student_resources").update({ flagged_at: null, flag_reason: null }).eq("id", resourceId);
  refresh();
}
