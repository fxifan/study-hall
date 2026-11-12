import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMinutes } from "./credit";
import { latest, studied, type ActivityItem } from "./activity";
import type { Member } from "./server";

/** A group's last few milestones: finished sessions (5 min+), goals reached, people joining. */
export async function groupActivity(groupId: string, members: Member[], meId: string): Promise<ActivityItem[]> {
  const admin = createAdminClient();
  const [{ data: sessions }, { data: msgs }] = await Promise.all([
    admin
      .from("study_sessions")
      .select("profile_id, stopped_at, credited_seconds")
      .eq("group_id", groupId)
      .eq("state", "stopped")
      .gte("credited_seconds", 300)
      .order("stopped_at", { ascending: false })
      .limit(15),
    admin.from("group_messages").select("kind, body, meta, created_at").eq("group_id", groupId).in("kind", ["recap", "system"]).is("hidden_at", null).order("created_at", { ascending: false }).limit(30),
  ]);
  const by = new Map(members.map((m) => [m.profile_id, m]));
  const items: ActivityItem[] = [];
  for (const s of sessions ?? []) {
    const m = by.get(s.profile_id as string);
    // Only members who share when they study appear here, like "Studying now".
    if (!m || (!m.share_status && m.profile_id !== meId) || !s.stopped_at) continue;
    items.push({ at: s.stopped_at as string, kind: "session", text: `${m.profile_id === meId ? "You" : m.name} studied ${studied(s.credited_seconds as number)}` });
  }
  for (const g of msgs ?? []) {
    const meta = (g.meta ?? {}) as { event?: string; done?: number; target?: number };
    if (g.kind === "recap" && typeof meta.done === "number" && typeof meta.target === "number" && meta.done >= meta.target) {
      items.push({ at: g.created_at as string, kind: "milestone", text: `The group reached its ${formatMinutes(meta.target)} goal` });
    } else if (g.kind === "system" && meta.event === "joined") {
      items.push({ at: g.created_at as string, kind: "member", text: (g.body as string).replace(/\.$/, "") });
    }
  }
  return latest(items);
}

/** The student's own last few: sessions, study days, full weeks and finished solo tasks. */
export async function myActivity(profileId: string): Promise<ActivityItem[]> {
  const admin = createAdminClient();
  const [{ data: sessions }, { data: points }, { data: solo }] = await Promise.all([
    admin
      .from("study_sessions")
      .select("stopped_at, credited_seconds, study_groups(name)")
      .eq("profile_id", profileId)
      .eq("state", "stopped")
      .gte("credited_seconds", 60)
      .order("stopped_at", { ascending: false })
      .limit(10),
    admin.from("points_ledger").select("kind, points, created_at").eq("profile_id", profileId).in("kind", ["study_day", "full_week"]).order("created_at", { ascending: false }).limit(10),
    admin.from("solo_tasks").select("body, status, finished_at").eq("profile_id", profileId).in("status", ["done", "partly"]).order("finished_at", { ascending: false }).limit(10),
  ]);
  const items: ActivityItem[] = [];
  for (const s of sessions ?? []) {
    if (!s.stopped_at) continue;
    const group = (s.study_groups as unknown as { name: string } | null)?.name;
    items.push({ at: s.stopped_at as string, kind: "session", text: `Studied ${studied(s.credited_seconds as number)} · ${group ?? "Solo"}` });
  }
  for (const p of points ?? []) {
    items.push({ at: p.created_at as string, kind: "milestone", text: p.kind === "full_week" ? `Full study week · +${p.points}` : `Study day counted · +${p.points}` });
  }
  for (const t of solo ?? []) {
    if (!t.finished_at) continue;
    items.push({ at: t.finished_at as string, kind: "milestone", text: `${t.status === "done" ? "Finished" : "Worked on"}: ${t.body as string}` });
  }
  return latest(items);
}
