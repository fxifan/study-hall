import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppShellFallback } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { isReservedTestEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { activityFor, isSuspended, tutorActivity, type ActivityRows } from "@/lib/tutor/activity";
import { formatAudCents } from "@/lib/tutor/costs";
import { trialDaysLeft } from "@/lib/tutor/plan";
import { formatInZone } from "@/lib/time";
import { AdminFrame, fieldClass } from "../admin-frame";
import { grantTutorAccess, setTutorAccess } from "./actions";

export const metadata: Metadata = { title: "Tutors" };

/**
 * /admin/tutors: who has tutor access, how much each tutor uses the product, and controls to grant,
 * suspend or restore access. Activity is counts and amounts only (service role, after the admin
 * check): admins never see a tutor's families, students, report text or invoice details.
 */
export default function TutorsPage({ searchParams }: PageProps<"/[lang]/admin/tutors">) {
  return (
    <Suspense fallback={<AppShellFallback label="Loading…" />}>
      <Tutors searchParams={searchParams} />
    </Suspense>
  );
}

const ERRORS: Record<string, string> = {
  input: "Enter a name and a valid email.",
  taken: "That email already has a family or staff account. Use a different email for tutor access.",
  create: "Couldn't create the login. Try again in a minute.",
};

async function Tutors({ searchParams }: Pick<PageProps<"/[lang]/admin/tutors">, "searchParams">) {
  await requireRole("admin"); // before any service-role read
  const query = await searchParams;
  const admin = createAdminClient();
  const ids = (rows: { tutor_id: string }[] | null) => rows ?? [];

  const [tutors, profiles, users, families, students, sessions, lessons, reports, invoices, resources] = await Promise.all([
    admin.from("tutors").select("id, display_name, plan, trial_ends_at, created_at").order("created_at"),
    admin.from("profiles").select("id, email").eq("role", "tutor"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("tutor_families").select("tutor_id"),
    admin.from("tutor_students").select("tutor_id"),
    admin.from("tutor_sessions").select("tutor_id, starts_at, duration_min"),
    admin.from("tutor_lessons").select("tutor_id, starts_at, status"),
    admin.from("tutor_reports").select("tutor_id, sent_at"),
    admin.from("tutor_invoices").select("tutor_id, status, total_cents"),
    admin.from("tutor_resources").select("tutor_id, status"),
  ]);
  const resourceCount = new Map<string, { all: number; approved: number }>();
  for (const r of resources.data ?? []) {
    const c = resourceCount.get(r.tutor_id as string) ?? { all: 0, approved: 0 };
    c.all++;
    if (r.status === "approved") c.approved++;
    resourceCount.set(r.tutor_id as string, c);
  }
  const email = new Map((profiles.data ?? []).map((p) => [p.id as string, p.email as string]));
  const auth = new Map((users.data?.users ?? []).map((u) => [u.id, u]));
  const activity = tutorActivity({
    families: ids(families.data),
    students: ids(students.data),
    sessions: (sessions.data ?? []) as ActivityRows["sessions"],
    lessons: (lessons.data ?? []) as ActivityRows["lessons"],
    reports: (reports.data ?? []) as ActivityRows["reports"],
    invoices: (invoices.data ?? []) as ActivityRows["invoices"],
  });

  const rows = (tutors.data ?? []).map((t) => {
    const user = auth.get(t.id);
    const suspended = isSuspended(user?.banned_until);
    return { ...t, email: email.get(t.id) ?? "", suspended, lastSignIn: user?.last_sign_in_at ?? null, a: activityFor(activity, t.id) };
  });
  const real = rows.filter((r) => !isReservedTestEmail(r.email));
  const active30 = real.filter((r) => !r.suspended && r.a.sessions30d > 0).length;

  return (
    <AdminFrame title="Tutors" current="tutors">
      <p className="text-sm text-ink-soft">
        Tutor accounts use the separate tutor product at /app. Activity shows counts and totals only: tutors&apos; families, students,
        reports and invoices stay private to them. Plans and AI costs are on{" "}
        <Link href="/admin/costs" className="underline underline-offset-4">
          Tutor costs
        </Link>
        .
      </p>

      {typeof query.error === "string" && ERRORS[query.error] && (
        <p role="alert" className="rounded-md border border-pen-faint px-3 py-2 text-sm text-pen">
          {ERRORS[query.error]}
        </p>
      )}
      {query.granted && (
        <p role="status" className="rounded-md border border-hair px-3 py-2 text-sm">
          {query.granted === "nomail"
            ? "Access granted, but the login email didn't send. They can log in from /login."
            : "Access granted. They log in at /login with that email."}
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-4">
        {[
          ["Tutors", String(real.length)],
          ["Active (30 days)", String(active30)],
          ["Sessions (30 days)", String(real.reduce((n, r) => n + r.a.sessions30d, 0))],
          ["Reports sent", String(real.reduce((n, r) => n + r.a.reportsSent, 0))],
        ].map(([label, value]) => (
          <div key={label} className="dash-card px-4 py-3">
            <p className="text-xs text-ink-soft">{label}</p>
            <p className="text-2xl tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      <form action={grantTutorAccess} className="dash-card flex flex-wrap items-end gap-2 px-4 py-3 text-sm" data-testid="grant-tutor">
        <p className="w-full font-medium">Give tutor access</p>
        <label className="flex flex-col gap-1">
          Name
          <input name="name" required maxLength={80} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1">
          Email
          <input name="email" type="email" required className={fieldClass} />
        </label>
        <Button type="submit" size="sm">
          Grant access
        </Button>
        <p className="w-full text-xs text-ink-faint">
          Creates the login with a 14-day trial and emails a login link. Restores access if the tutor was suspended.
        </p>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm" data-testid="tutor-table">
          <thead className="text-left text-ink-soft">
            <tr>
              <th className="py-1 font-normal">Tutor</th>
              <th className="py-1 font-normal">Access</th>
              <th className="py-1 text-right font-normal">Families / students</th>
              <th className="py-1 text-right font-normal">Sessions (30d)</th>
              <th className="py-1 text-right font-normal">Upcoming</th>
              <th className="py-1 text-right font-normal">Reports sent</th>
              <th className="py-1 text-right font-normal">Resources</th>
              <th className="py-1 text-right font-normal">Invoiced / paid</th>
              <th className="py-1 font-normal" />
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {rows.map((t) => {
              const plan =
                t.plan === "solo" ? "Solo" : trialDaysLeft(t.trial_ends_at) === 0 ? "Trial ended" : `Trial to ${formatInZone(t.trial_ends_at, "d MMM")}`;
              return (
                <tr key={t.id} className={isReservedTestEmail(t.email) ? "text-ink-faint" : ""}>
                  <td className="py-2">
                    {t.display_name}
                    <br />
                    <span className="text-xs text-ink-soft">{t.email}</span>
                  </td>
                  <td>
                    <span className={t.suspended ? "text-pen" : ""}>{t.suspended ? "Suspended" : plan}</span>
                    <br />
                    <span className="text-xs text-ink-soft">
                      {t.lastSignIn ? `Signed in ${formatInZone(t.lastSignIn, "d MMM")}` : "Never signed in"}
                    </span>
                  </td>
                  <td className="text-right tabular-nums">
                    {t.a.families} / {t.a.students}
                  </td>
                  <td className="text-right tabular-nums">
                    {t.a.sessions30d} · {t.a.hours30d}h
                    <br />
                    <span className="text-xs text-ink-soft">{t.a.sessions} all time</span>
                  </td>
                  <td className="text-right tabular-nums">{t.a.upcomingLessons}</td>
                  <td className="text-right tabular-nums">
                    {t.a.reportsSent}
                    <span className="text-ink-soft"> of {t.a.reportsDrafted}</span>
                  </td>
                  <td className="text-right tabular-nums">
                    {resourceCount.get(t.id)?.all ?? 0}
                    <span className="text-ink-soft"> ({resourceCount.get(t.id)?.approved ?? 0} approved)</span>
                  </td>
                  <td className="text-right tabular-nums">
                    {formatAudCents(t.a.invoicedCents)}
                    <br />
                    <span className="text-xs text-ink-soft">{formatAudCents(t.a.paidCents)} paid</span>
                  </td>
                  <td className="text-right">
                    <form action={setTutorAccess}>
                      <input type="hidden" name="tutorId" value={t.id} />
                      {t.suspended ? (
                        <Button type="submit" name="access" value="restore" size="xs" variant="outline">
                          Restore
                        </Button>
                      ) : (
                        <Button type="submit" name="access" value="suspend" size="xs" variant="ghost">
                          Suspend
                        </Button>
                      )}
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="text-sm text-ink-soft">No tutors yet.</p>}
      <p className="text-xs text-ink-faint">
        Suspending blocks sign-in straight away; a session already open ends within the hour. Nothing is deleted. Test accounts (*.test,
        example.com) are greyed out and left out of the totals.
      </p>
    </AdminFrame>
  );
}
