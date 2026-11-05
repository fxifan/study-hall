import "server-only";
import type { Account, Attendance, Dated, Event, Range, Session, ShReport, Subscription, Tutor, TutorReport } from "./analytics";
import { DAY } from "./analytics";
import { isReservedTestEmail } from "./email";
import { createAdminClient } from "./supabase/admin";

/**
 * Loads the rows behind /admin/analytics with the service role. Call only after an admin check.
 * Test and internal accounts (*.test, example.com addresses, staff) are removed here, so no
 * metric can include them. History needed for retention (60 days before the range) is included.
 */
export async function loadAnalytics(range: Range) {
  const admin = createAdminClient();
  const since = new Date(range.from.getTime() - 60 * DAY).toISOString();
  const all = async <T>(q: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> => {
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  };

  const [profiles, subs, tutors, events, reports, students, invoices, lessons, resources, attendance, sessions, shReports, studentRows] = await Promise.all([
    all(admin.from("profiles").select("id, role, email, full_name, created_at")),
    all(admin.from("subscriptions").select("parent_id, status, created_at, canceled_at, quantity, plans(name, price_cents, interval)")),
    all(admin.from("tutors").select("id, plan, trial_ends_at, created_at, stripe_customer_id")),
    all(admin.from("product_events").select("name, product, user_id, created_at, properties").eq("is_test", false).gte("created_at", since)),
    all(admin.from("tutor_reports").select("tutor_id, created_at, sent_at, langs, model:draft_json->model")),
    all(admin.from("tutor_students").select("tutor_id, created_at")),
    all(admin.from("tutor_invoices").select("tutor_id, created_at")),
    all(admin.from("tutor_lessons").select("tutor_id, created_at")),
    all(admin.from("tutor_resources").select("tutor_id, created_at")),
    all(admin.from("attendance").select("student_id, status, sessions!inner(starts_at)").gte("sessions.starts_at", since)),
    all(admin.from("sessions").select("starts_at, ends_at, status").gte("starts_at", since)),
    all(admin.from("reports").select("status, created_at, sent_at").gte("created_at", since)),
    all(admin.from("students").select("id, profile_id, parent_students(parent_id)")),
  ]);

  const email = new Map(profiles.map((p) => [p.id as string, (p.email as string) ?? ""]));
  const testUser = (id: string | null) => Boolean(id && isReservedTestEmail(email.get(id) ?? ""));
  const testStudent = new Set(
    studentRows
      .filter((s) => testUser(s.profile_id as string | null) || ((s.parent_students as { parent_id: string }[]) ?? []).some((p) => testUser(p.parent_id)))
      .map((s) => s.id as string),
  );
  const role = new Map(profiles.map((p) => [p.id as string, p.role as string]));
  // Admins' own tutor workspaces are staff use, not customers.
  const realTutor = (id: string) => !testUser(id) && role.get(id) === "tutor";

  const accounts: (Account & { email: string; name: string | null })[] = profiles
    .filter((p) => ["parent", "student", "tutor"].includes(p.role as string) && !isReservedTestEmail((p.email as string) ?? ""))
    .map((p) => ({ id: p.id as string, role: p.role as string, created_at: p.created_at as string, email: (p.email as string) ?? "", name: (p.full_name as string) ?? null }));

  const subscriptions: Subscription[] = subs
    .filter((s) => !testUser(s.parent_id as string))
    .map((s) => {
      const plan = s.plans as unknown as { name: string; price_cents: number; interval: string } | null;
      return {
        parent_id: s.parent_id as string,
        status: s.status as string,
        created_at: s.created_at as string,
        canceled_at: (s.canceled_at as string) ?? null,
        quantity: (s.quantity as number) ?? 1,
        price_cents: plan?.price_cents ?? 0,
        interval: plan?.interval ?? "week",
        plan_name: plan?.name ?? "Unknown plan",
      };
    });

  const dated = (rows: Record<string, unknown>[]): Dated[] =>
    rows.filter((r) => realTutor(r.tutor_id as string)).map((r) => ({ tutor_id: r.tutor_id as string, created_at: r.created_at as string }));

  return {
    accounts,
    subscriptions,
    tutors: tutors.filter((t) => realTutor(t.id as string)) as unknown as Tutor[],
    events: events as unknown as Event[],
    tutorReports: reports
      .filter((r) => realTutor(r.tutor_id as string))
      .map((r): TutorReport => ({
        tutor_id: r.tutor_id as string,
        created_at: r.created_at as string,
        sent_at: (r.sent_at as string) ?? null,
        drafted: r.model != null,
        langs: (r.langs as string[]) ?? [],
      })),
    tutorStudents: dated(students),
    tutorInvoices: dated(invoices),
    tutorLessons: dated(lessons),
    tutorResources: dated(resources),
    attendance: attendance
      .filter((a) => !testStudent.has(a.student_id as string))
      .map((a): Attendance => ({
        student_id: a.student_id as string,
        starts_at: (a.sessions as unknown as { starts_at: string }).starts_at,
        present: a.status !== "absent",
      })),
    sessions: sessions as unknown as Session[],
    shReports: shReports as unknown as ShReport[],
    /** Students that are real accounts (for linking attendance to active users). */
    testStudentCount: testStudent.size,
  };
}
