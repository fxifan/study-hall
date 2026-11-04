/**
 * Per-tutor activity counts for /admin/tutors. Counts and amounts only: admins see how much each
 * tutor uses the product, never their families' names, students, report text or invoice details.
 */
export type ActivityRows = {
  families: { tutor_id: string }[];
  students: { tutor_id: string }[];
  sessions: { tutor_id: string; starts_at: string; duration_min: number }[];
  lessons: { tutor_id: string; starts_at: string; status: string }[];
  reports: { tutor_id: string; sent_at: string | null }[];
  invoices: { tutor_id: string; status: string; total_cents: number }[];
};

export type TutorActivity = {
  families: number;
  students: number;
  sessions: number;
  sessions30d: number;
  hours30d: number;
  upcomingLessons: number;
  reportsDrafted: number;
  reportsSent: number;
  invoicesSent: number;
  invoicedCents: number;
  paidCents: number;
  lastActivity: string | null;
};

const empty = (): TutorActivity => ({
  families: 0,
  students: 0,
  sessions: 0,
  sessions30d: 0,
  hours30d: 0,
  upcomingLessons: 0,
  reportsDrafted: 0,
  reportsSent: 0,
  invoicesSent: 0,
  invoicedCents: 0,
  paidCents: 0,
  lastActivity: null,
});

export function tutorActivity(rows: ActivityRows, now = new Date()): Map<string, TutorActivity> {
  const out = new Map<string, TutorActivity>();
  const get = (id: string) => {
    let a = out.get(id);
    if (!a) out.set(id, (a = empty()));
    return a;
  };
  const nowMs = now.getTime();
  const since = nowMs - 30 * 86_400_000;
  const touch = (a: TutorActivity, iso: string | null) => {
    if (iso && Date.parse(iso) <= nowMs && (!a.lastActivity || iso > a.lastActivity)) a.lastActivity = iso;
  };

  for (const r of rows.families) get(r.tutor_id).families++;
  for (const r of rows.students) get(r.tutor_id).students++;
  for (const r of rows.sessions) {
    const a = get(r.tutor_id);
    a.sessions++;
    const t = Date.parse(r.starts_at);
    if (t >= since && t <= nowMs) {
      a.sessions30d++;
      a.hours30d += r.duration_min / 60;
    }
    touch(a, r.starts_at);
  }
  for (const r of rows.lessons) {
    if (r.status === "scheduled" && Date.parse(r.starts_at) > nowMs) get(r.tutor_id).upcomingLessons++;
  }
  for (const r of rows.reports) {
    const a = get(r.tutor_id);
    a.reportsDrafted++;
    if (r.sent_at) a.reportsSent++;
    touch(a, r.sent_at);
  }
  for (const r of rows.invoices) {
    if (r.status === "draft") continue;
    const a = get(r.tutor_id);
    a.invoicesSent++;
    a.invoicedCents += r.total_cents;
    if (r.status === "paid") a.paidCents += r.total_cents;
  }
  for (const a of out.values()) a.hours30d = Math.round(a.hours30d * 10) / 10;
  return out;
}

export function activityFor(map: Map<string, TutorActivity>, id: string): TutorActivity {
  return map.get(id) ?? empty();
}

/** Whether a login is suspended (Supabase `banned_until` in the future). */
export function isSuspended(bannedUntil: string | null | undefined, now = new Date()): boolean {
  return !!bannedUntil && Date.parse(bannedUntil) > now.getTime();
}
