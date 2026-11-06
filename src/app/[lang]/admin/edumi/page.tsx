import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShellFallback } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { namesFor } from "@/lib/social/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatInZone } from "@/lib/time";
import { AdminFrame, fieldClass } from "../admin-frame";
import { clearFlag, dismissReports, hideMessage, suspendChat } from "./actions";

export const metadata: Metadata = { title: "Edumi groups" };

export default function EdumiAdminPage() {
  return (
    <Suspense fallback={<AppShellFallback label="Loading…" />}>
      <EdumiAdmin />
    </Suspense>
  );
}

type Report = { id: string; reason: string; created_at: string; message_id: string; group_messages: { id: string; body: string; sender_id: string | null; hidden_at: string | null } | null };

/** Moderation (reported messages, flagged AI content) and the pilot measures for student groups. */
async function EdumiAdmin() {
  await requireRole("admin");
  const db = createAdminClient();
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const [{ data: reports }, { data: flagged }, groups, members, active, help, helpDone, quizzes, completions, seats, plans] = await Promise.all([
    db.from("message_reports").select("id, reason, created_at, message_id, group_messages(id, body, sender_id, hidden_at)").is("resolved_at", null).order("created_at").returns<Report[]>(),
    db.from("student_resources").select("id, kind, title, flag_reason, flagged_at").not("flagged_at", "is", null).order("flagged_at").limit(50),
    db.from("study_groups").select("id", { count: "exact", head: true }).is("archived_at", null),
    db.from("study_group_members").select("profile_id", { count: "exact", head: true }),
    db.from("study_sessions").select("group_id, profile_id").gt("started_at", since),
    db.from("group_help_requests").select("id", { count: "exact", head: true }).gt("created_at", since),
    db.from("group_help_requests").select("id", { count: "exact", head: true }).gt("created_at", since).in("state", ["accepted", "resolved"]),
    db.from("resource_attempts").select("id", { count: "exact", head: true }).gt("submitted_at", since),
    db.from("student_resources").select("id", { count: "exact", head: true }).gt("completed_at", since),
    db.from("studyhall_seats").select("id", { count: "exact", head: true }).eq("status", "paid"),
    db.from("student_plans").select("status"),
  ]);
  const activeGroups = new Set((active.data ?? []).map((s) => s.group_id)).size;
  const contributors = new Set((active.data ?? []).map((s) => s.profile_id)).size;
  const senders = await namesFor((reports ?? []).flatMap((r) => (r.group_messages?.sender_id ? [r.group_messages.sender_id] : [])));
  const byMessage = new Map<string, Report[]>();
  for (const r of reports ?? []) byMessage.set(r.message_id, [...(byMessage.get(r.message_id) ?? []), r]);
  const planCounts = (plans.data ?? []).reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.status as string]: (acc[p.status as string] ?? 0) + 1 }), {});

  const stats: [string, string | number][] = [
    ["Groups", groups.count ?? 0],
    ["Memberships", members.count ?? 0],
    ["Groups active (7 days)", activeGroups],
    ["Students contributing (7 days)", contributors],
    ["Help requests (7 days)", `${help.count ?? 0} (${helpDone.count ?? 0} accepted or resolved)`],
    ["Quiz attempts (7 days)", quizzes.count ?? 0],
    ["Resources completed (7 days)", completions.count ?? 0],
    ["Study Hall seats paid from parent links", seats.count ?? 0],
    ["Student plans", Object.entries(planCounts).map(([k, v]) => `${v} ${k}`).join(", ") || "none"],
  ];

  return (
    <AdminFrame title="Edumi groups" current="edumi">
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Pilot measures</h2>
        <dl className="grid gap-2 sm:grid-cols-3">
          {stats.map(([k, v]) => (
            <div key={k} className="rounded-md border border-rule p-3">
              <dt className="text-xs text-ink-soft">{k}</dt>
              <dd className="font-mono">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Reported messages</h2>
        {byMessage.size === 0 && <p className="text-ink-soft">Nothing to review.</p>}
        {[...byMessage].map(([messageId, rs]) => {
          const m = rs[0].group_messages;
          return (
            <div key={messageId} className="flex flex-col gap-2 rounded-md border border-rule p-3 text-sm">
              <p>
                <strong>{(m?.sender_id && senders.get(m.sender_id)) || "Unknown"}</strong>: {m?.body}
                {m?.hidden_at && <span className="ml-2 text-xs text-ink-faint">(hidden)</span>}
              </p>
              <ul className="text-xs text-ink-soft">
                {rs.map((r) => (
                  <li key={r.id}>
                    {formatInZone(r.created_at, "d MMM h:mmaaa")}: {r.reason}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2">
                <form action={hideMessage.bind(null, messageId)}>
                  <Button size="sm" variant="outline">Hide message</Button>
                </form>
                <form action={suspendChat.bind(null, messageId)} className="flex items-center gap-1">
                  <input name="days" type="number" min={1} max={90} defaultValue={7} className={`${fieldClass} w-16`} aria-label="Days" />
                  <Button size="sm" variant="outline">Hide and pause chat</Button>
                </form>
                <form action={dismissReports.bind(null, messageId)}>
                  <Button size="sm" variant="ghost">No action</Button>
                </form>
              </div>
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Flagged AI content</h2>
        {(flagged ?? []).length === 0 && <p className="text-ink-soft">No flags.</p>}
        {(flagged ?? []).map((f) => (
          <div key={f.id as string} className="flex items-center justify-between gap-2 rounded-md border border-rule p-3 text-sm">
            <span>
              {f.title as string} <span className="text-xs text-ink-faint">({f.kind as string})</span>
              <span className="block text-ink-soft">{f.flag_reason as string}</span>
            </span>
            <form action={clearFlag.bind(null, f.id as string)}>
              <Button size="sm" variant="ghost">Clear</Button>
            </form>
          </div>
        ))}
      </section>
    </AdminFrame>
  );
}
