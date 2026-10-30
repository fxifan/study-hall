import { EVIDENCE_BUCKET } from "@/lib/evidence";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Opens a piece of uploaded work. Access is decided by goal_evidence's RLS for the signed-in user
 * (the student, their parents, the session's staff, or an admin); only then does the server sign a
 * one-minute link to the private file.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/evidence/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const { data: row } = await supabase.from("goal_evidence").select("storage_path, file_name").eq("id", id).maybeSingle();
  if (!row) return new Response("Not found", { status: 404 });
  const { data, error } = await createAdminClient().storage.from(EVIDENCE_BUCKET).createSignedUrl(row.storage_path, 60);
  if (error || !data) return new Response("Couldn't open the file", { status: 502 });
  return Response.redirect(data.signedUrl, 302);
}
