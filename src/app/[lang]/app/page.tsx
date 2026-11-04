import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { shortWhen, studentName } from "@/lib/tutor/format";
import { formatCents, sessionCharge } from "@/lib/tutor/invoice-math";
import { accessFor, requireTutor } from "@/lib/tutor/server";
import { PlanBanner } from "./_components/plan-banner";
import { Loading, TutorShell, appHref, primaryButton } from "./_components/shell";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Today />
    </Suspense>
  );
}

type Recent = {
  id: string;
  starts_at: string;
  duration_min: number;
  rate_cents: number;
  status: "logged" | "invoiced";
  subjects: string[];
  tutor_students: { first_name: string; last_initial: string } | null;
  tutor_reports: { id: string; sent_at: string | null; sent_to: string | null } | null;
};

async function Today() {
  const [me, locale] = await Promise.all([requireTutor(), getLocale()]);
  const supabase = await createClient();
  const [{ data: recent }, { data: unbilled }, access] = await Promise.all([
    supabase
      .from("tutor_sessions")
      .select("id, starts_at, duration_min, rate_cents, status, subjects, tutor_students(first_name, last_initial), tutor_reports(id, sent_at, sent_to)")
      .order("starts_at", { ascending: false })
      .limit(15)
      .returns<Recent[]>(),
    supabase.from("tutor_sessions").select("duration_min, rate_cents").is("invoice_id", null),
    accessFor(me.tutor),
  ]);
  const unbilledCents = (unbilled ?? []).reduce((sum, s) => sum + sessionCharge(s.duration_min, s.rate_cents), 0);

  return (
    <TutorShell tutor={me} title={`Hi, ${me.tutor.display_name.split(" ")[0]}`} current="today">
      <PlanBanner access={access} />
      <Link href={appHref("/app/log", locale)} className={`${primaryButton} h-14 text-lg sm:h-12`}>
        + Log a session
      </Link>
      {unbilled?.length ? (
        <p className="text-sm text-ink-soft">
          {unbilled.length} unbilled {unbilled.length === 1 ? "session" : "sessions"} ({formatCents(unbilledCents)}).{" "}
          <Link className="underline" href={appHref("/app/invoices", locale)}>
            Create invoices
          </Link>
        </p>
      ) : null}

      <h2 className="text-lg font-medium">Recent sessions</h2>
      {recent?.length ? (
        <ul className="divide-y divide-rule rounded-lg border border-hair bg-sheet">
          {recent.map((s) => {
            const report = s.tutor_reports;
            const status = !report ? "No report" : report.sent_at ? (report.sent_to === "copied as text" ? "Shared" : "Sent") : "Draft";
            const body = (
              <>
                <span className="flex flex-col">
                  <span>{s.tutor_students ? studentName(s.tutor_students) : "Student"}</span>
                  <span className="text-sm text-ink-soft">
                    {shortWhen(s.starts_at)} · {s.duration_min} min{s.subjects.length ? ` · ${s.subjects.join(", ")}` : ""}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${status === "Draft" ? "border-pen text-pen" : "border-hair text-ink-soft"}`}>
                  {status}
                </span>
              </>
            );
            return (
              <li key={s.id}>
                {report ? (
                  <Link href={appHref(`/app/reports/${report.id}`, locale)} className="flex items-center justify-between gap-3 px-4 py-3">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center justify-between gap-3 px-4 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-ink-soft">
          No sessions yet. After your next session, tap <strong>Log a session</strong>, record a minute of notes, and you&apos;ll have a parent
          update ready to check and send.
        </p>
      )}
    </TutorShell>
  );
}
