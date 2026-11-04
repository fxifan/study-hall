import { ACTIVE_SUBSCRIPTION_STATUSES } from "./subscription-status";

export const RETENTION_DAYS = 7;

export type SubscriptionRow = {
  parent_id: string;
  status: string;
  current_period_end: string | null;
  canceled_at: string | null;
};

const active = new Set<string>(ACTIVE_SUBSCRIPTION_STATUSES);

/**
 * Parents whose subscriptions have all ended more than RETENTION_DAYS ago. A subscription's end
 * is the later of its period end and its cancellation time. Statuses that never ended (incomplete
 * checkouts) don't count as an ended subscription; a parent with any active one is kept.
 */
export function endedFamilies(rows: SubscriptionRow[], now = new Date()): string[] {
  const cutoff = now.getTime() - RETENTION_DAYS * 86_400_000;
  const byParent = new Map<string, SubscriptionRow[]>();
  for (const r of rows) byParent.set(r.parent_id, [...(byParent.get(r.parent_id) ?? []), r]);
  const out: string[] = [];
  for (const [parent, subs] of byParent) {
    if (subs.some((s) => active.has(s.status))) continue;
    const ended = subs.filter((s) => s.status === "canceled" || s.status === "incomplete_expired" || s.status === "unpaid");
    if (!ended.length || ended.length !== subs.filter((s) => s.status !== "incomplete").length) continue;
    const last = Math.max(
      ...ended.map((s) => Math.max(Date.parse(s.current_period_end ?? "") || 0, Date.parse(s.canceled_at ?? "") || 0)),
    );
    if (last > 0 && last < cutoff) out.push(parent);
  }
  return out;
}
