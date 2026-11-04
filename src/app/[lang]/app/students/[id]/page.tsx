import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { shortWhen, studentName } from "@/lib/tutor/format";
import { requireTutor } from "@/lib/tutor/server";
import { deleteSession, deleteStudent, updateStudent } from "../../actions";
import { Loading, Notice, TutorShell, YEAR_LEVELS, appHref, field, labelClass, primaryButton, secondaryButton } from "../../_components/shell";

export const metadata: Metadata = { title: "Student" };

export default function StudentPage({ params, searchParams }: PageProps<"/[lang]/app/students/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Student params={params} searchParams={searchParams} />
    </Suspense>
  );
}

type Row = {
  id: string;
  family_id: string;
  first_name: string;
  last_initial: string;
  year_level: number;
  subjects: string[];
  notes: string | null;
  goals: string | null;
  tutor_families: { parent_name: string } | null;
};
type Session = {
  id: string;
  starts_at: string;
  duration_min: number;
  subjects: string[];
  invoice_id: string | null;
  tutor_reports: { id: string; sent_at: string | null; sent_to: string | null } | null;
};

async function Student({ params, searchParams }: Pick<PageProps<"/[lang]/app/students/[id]">, "params" | "searchParams">) {
  const [me, locale, { id }, query] = await Promise.all([requireTutor(), getLocale(), params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: s }, { data: sessions }, { data: families }] = await Promise.all([
    supabase
      .from("tutor_students")
      .select("id, family_id, first_name, last_initial, year_level, subjects, notes, goals, tutor_families(parent_name)")
      .eq("id", id)
      .maybeSingle<Row>(),
    supabase
      .from("tutor_sessions")
      .select("id, starts_at, duration_min, subjects, invoice_id, tutor_reports(id, sent_at, sent_to)")
      .eq("student_id", id)
      .order("starts_at", { ascending: false })
      .returns<Session[]>(),
    supabase.from("tutor_families").select("id, parent_name").order("parent_name"),
  ]);
  if (!s) notFound();

  return (
    <TutorShell tutor={me} title={studentName(s)} current="students" back={{ href: "/app/students", label: "Students" }}>
      {query.saved === "student" && <Notice>Saved.</Notice>}
      {query.saved === "session-deleted" && <Notice>Session deleted.</Notice>}
      {query.error === "student" && <Notice tone="error">Check the details and try again.</Notice>}
      {query.error === "delete" && <Notice tone="error">This student has logged sessions. Delete those first (invoiced sessions can&apos;t be deleted).</Notice>}

      <Link href={appHref(`/app/log?student=${s.id}`, locale)} className={primaryButton}>
        + Log a session for {s.first_name}
      </Link>

      <h2 className="text-lg font-medium">Reports</h2>
      {sessions?.length ? (
        <ul className="divide-y divide-rule rounded-lg border border-hair bg-sheet">
          {sessions.map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-3 px-4 py-3">
              {x.tutor_reports ? (
                <Link href={appHref(`/app/reports/${x.tutor_reports.id}`, locale)} className="flex flex-1 flex-col">
                  <span>{shortWhen(x.starts_at)}</span>
                  <span className="text-sm text-ink-soft">
                    {x.duration_min} min{x.subjects.length ? ` · ${x.subjects.join(", ")}` : ""} ·{" "}
                    {x.tutor_reports.sent_at ? (x.tutor_reports.sent_to === "copied as text" ? "shared as text" : "sent") : "draft"}
                    {x.invoice_id ? " · invoiced" : ""}
                  </span>
                </Link>
              ) : (
                <span className="flex-1">{shortWhen(x.starts_at)}</span>
              )}
              {!x.invoice_id && (
                <form action={deleteSession}>
                  <input type="hidden" name="id" value={x.id} />
                  <input type="hidden" name="returnTo" value={`/app/students/${s.id}`} />
                  <button type="submit" className="text-xs text-ink-faint hover:text-pen" aria-label={`Delete session ${shortWhen(x.starts_at)}`}>
                    Delete
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-soft">No sessions logged yet.</p>
      )}

      <h2 className="text-lg font-medium">Details</h2>
      <form action={updateStudent} className="flex flex-col gap-3 rounded-lg border border-hair bg-sheet p-4">
        <input type="hidden" name="id" value={s.id} />
        <div className="grid grid-cols-[1fr_5rem] gap-2">
          <label className={labelClass}>
            First name
            <input name="firstName" className={field} defaultValue={s.first_name} required maxLength={50} />
          </label>
          <label className={labelClass}>
            Last initial
            <input name="lastInitial" className={field} defaultValue={s.last_initial} required maxLength={1} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className={labelClass}>
            Year level
            <select name="yearLevel" className={field} defaultValue={s.year_level}>
              {YEAR_LEVELS.map((y) => (
                <option key={y.value} value={y.value}>
                  {y.label}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Family
            <select name="familyId" className={field} defaultValue={s.family_id}>
              {(families ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.parent_name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={labelClass}>
          Subjects (comma-separated)
          <input name="subjects" className={field} defaultValue={s.subjects.join(", ")} maxLength={400} />
        </label>
        <label className={labelClass}>
          What they need help with
          <input name="goals" className={field} defaultValue={s.goals ?? ""} maxLength={300} />
        </label>
        <label className={labelClass}>
          Notes (private to you)
          <input name="notes" className={field} defaultValue={s.notes ?? ""} maxLength={500} />
        </label>
        <button type="submit" className={primaryButton}>
          Save
        </button>
      </form>
      <p className="text-sm">
        Family:{" "}
        <Link className="underline" href={appHref(`/app/families/${s.family_id}`, locale)}>
          {s.tutor_families?.parent_name}
        </Link>
      </p>
      <form action={deleteStudent}>
        <input type="hidden" name="id" value={s.id} />
        <button type="submit" className={secondaryButton}>
          Delete student
        </button>
      </form>
    </TutorShell>
  );
}
